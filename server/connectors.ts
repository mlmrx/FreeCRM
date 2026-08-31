import { referenceConnectors } from '@/lib/multi-edition';
import type { WorkspaceContext } from './control-plane';
import type { RequestIdentity } from './request-context';
import { ApiError } from './request-context';
import { requirePermission } from './authorization';
import { captureWorkspaceMutationEpoch, normalizeMutationFenceError, workspaceMutationFence } from './mutation-fence';

const definition = (key: unknown) => {
  const found = referenceConnectors.find((item) => item.key === key);
  if (!found) throw new ApiError(400, 'unsupported_connector', 'Only complete reference connectors can be configured.');
  return found;
};

const boundedId = (value: unknown, name: string) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) throw new ApiError(400, 'validation_error', `${name} is required and must be at most 128 characters.`);
  return value.trim();
};

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function secretDigest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function audit(db: D1Database, workspaceId: string, identity: RequestIdentity, action: string, connectionId: string, metadata: unknown, now: string) {
  return db.prepare('INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), workspaceId, identity.userId, action, 'connector', connectionId, JSON.stringify(metadata), identity.requestId, now);
}

type ConnectionRow = {
  id: string;
  connector_key: string;
  sync_cursor: string | null;
  status: string;
};

type IdempotencyRow = {
  request_hash: string;
  response_json: string;
};

export async function connectSimulator(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, connectorKey: unknown, webhookKey?: unknown) {
  requirePermission(workspace.workspace.role, 'connectors:manage');
  const connector = definition(connectorKey);
  let credentialRef: string | null = null;
  let credentialMetadata = '{}';
  let secret: string | null = null;
  if (connector.key === 'webhook-simulator') {
    secret = typeof webhookKey === 'string' ? webhookKey.trim() : '';
    if (secret.length < 32 || secret.length > 512 || /[\u0000-\u001f\u007f]/.test(secret)) throw new ApiError(400, 'validation_error', 'webhookKey must be 32 to 512 printable characters.');
  }
  const mutationEpoch = await captureWorkspaceMutationEpoch(db, workspace.workspaceId);
  if (secret !== null) {
    credentialRef = `sha256:${await secretDigest(secret)}`;
    credentialMetadata = JSON.stringify({ configured: true, storage: 'sha256', rotatedAt: new Date().toISOString() });
  }
  const now = new Date().toISOString();
  const proposedId = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO connector_connections (id,workspace_id,connector_key,auth_type,credential_ref,credential_metadata_json,scopes_json,status,health,retry_count,last_error_code,created_at,updated_at,credential_generation) VALUES (?,?,?,?,?,?,?,'connected','healthy',0,NULL,?,?,1) ON CONFLICT(workspace_id,connector_key) DO UPDATE SET auth_type=excluded.auth_type,scopes_json=excluded.scopes_json,status='connected',health='healthy',credential_ref=excluded.credential_ref,credential_metadata_json=excluded.credential_metadata_json,retry_count=0,last_error_code=NULL,updated_at=excluded.updated_at,credential_generation=connector_connections.credential_generation+1`).bind(proposedId, workspace.workspaceId, connector.key, connector.auth, credentialRef, credentialMetadata, JSON.stringify(connector.scopes), now, now),
    db.prepare(`INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at) SELECT ?,workspace_id,?,'connector.connected','connector',id,?,?,? FROM connector_connections WHERE workspace_id=? AND connector_key=?`).bind(crypto.randomUUID(), identity.userId, JSON.stringify({ connectorKey: connector.key, auth: 'simulated', scopes: connector.scopes }), identity.requestId, now, workspace.workspaceId, connector.key),
    workspaceMutationFence(db, workspace.workspaceId, mutationEpoch, `connector.connect:${connector.key}:${identity.requestId}`, now),
  ]).catch((error) => { throw normalizeMutationFenceError(error); });
  const stored = await db.prepare('SELECT id FROM connector_connections WHERE workspace_id=? AND connector_key=?').bind(workspace.workspaceId, connector.key).first<{ id: string }>();
  if (!stored) throw new ApiError(500, 'connector_unavailable', 'The connector could not be initialized.');
  return { id: stored.id, connectorKey: connector.key, status: 'connected', health: 'healthy', scopes: connector.scopes, webhookKeyConfigured: connector.key === 'webhook-simulator' };
}

export async function syncSimulator(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, connectionId: unknown, idempotencyKey: unknown) {
  requirePermission(workspace.workspace.role, 'connectors:manage');
  const id = boundedId(connectionId, 'connectionId');
  const key = boundedId(idempotencyKey, 'idempotencyKey');
  const mutationEpoch = await captureWorkspaceMutationEpoch(db, workspace.workspaceId);
  const connection = await db.prepare('SELECT id,connector_key,sync_cursor,status FROM connector_connections WHERE workspace_id=? AND id=?').bind(workspace.workspaceId, id).first<ConnectionRow>();
  if (!connection || connection.status !== 'connected') throw new ApiError(409, 'connector_unavailable', 'Connector is not connected in this workspace.');
  definition(connection.connector_key);
  const requestHash = await digest({ connectionId: id, connectorKey: connection.connector_key });
  const replay = await db.prepare("SELECT request_hash,response_json FROM idempotency_records WHERE workspace_id=? AND operation='connector.sync' AND key=?").bind(workspace.workspaceId, key).first<IdempotencyRow>();
  if (replay) {
    if (replay.request_hash !== requestHash) throw new ApiError(409, 'idempotency_conflict', 'That idempotency key was already used for another connector sync.');
    return { ...JSON.parse(replay.response_json) as object, replayed: true };
  }

  const previousCursor = connection.sync_cursor ?? '';
  const previousSequence = previousCursor === '' ? 0 : Number(previousCursor);
  if (!Number.isSafeInteger(previousSequence) || previousSequence < 0) throw new ApiError(409, 'connector_state_invalid', 'Connector cursor state is invalid. Reconnect the simulator.');
  const cursor = String(previousSequence + 1);
  const now = new Date().toISOString();
  const response = { connectionId: id, connectorKey: connection.connector_key, cursor, processed: 0, simulated: true };
  try {
    await db.batch([
      db.prepare('INSERT INTO connector_sync_claims (workspace_id,connection_id,expected_cursor,operation_id,claimed_at) VALUES (?,?,?,?,?)').bind(workspace.workspaceId, id, previousCursor, key, now),
      db.prepare("UPDATE connector_connections SET sync_cursor=?,health='healthy',retry_count=0,last_error_code=NULL,updated_at=? WHERE workspace_id=? AND id=? AND status='connected' AND COALESCE(sync_cursor,'')=?").bind(cursor, now, workspace.workspaceId, id, previousCursor),
      db.prepare("INSERT INTO idempotency_records (workspace_id,operation,key,request_hash,status_code,response_json,created_at,expires_at) VALUES (?,'connector.sync',?,?,200,?,?,?)").bind(workspace.workspaceId, key, requestHash, JSON.stringify(response), now, new Date(Date.now() + 86_400_000).toISOString()),
      audit(db, workspace.workspaceId, identity, 'connector.synced', id, { cursor, processed: 0, simulated: true }, now),
      workspaceMutationFence(db, workspace.workspaceId, mutationEpoch, `connector.sync:${id}:${key}`, now),
    ]);
  } catch (error) {
    const committed = await db.prepare("SELECT request_hash,response_json FROM idempotency_records WHERE workspace_id=? AND operation='connector.sync' AND key=?").bind(workspace.workspaceId, key).first<IdempotencyRow>();
    if (committed?.request_hash === requestHash) return { ...JSON.parse(committed.response_json) as object, replayed: true };
    if (committed) throw new ApiError(409, 'idempotency_conflict', 'That idempotency key was already used for another connector sync.');
    if (String(error).includes('connector_sync_claims') || String(error).includes('connector sync state changed')) {
      throw new ApiError(409, 'connector_state_changed', 'Connector state changed during sync. Refresh and try again.');
    }
    throw normalizeMutationFenceError(error);
  }
  return { ...response, replayed: false };
}

export async function disconnectSimulator(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, connectionId: unknown) {
  requirePermission(workspace.workspace.role, 'connectors:manage');
  const id = boundedId(connectionId, 'connectionId');
  const mutationEpoch = await captureWorkspaceMutationEpoch(db, workspace.workspaceId);
  const connection = await db.prepare('SELECT connector_key FROM connector_connections WHERE workspace_id=? AND id=?').bind(workspace.workspaceId, id).first<{ connector_key: string }>();
  if (!connection) throw new ApiError(404, 'connector_not_found', 'Connector was not found in this workspace.');
  definition(connection.connector_key);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE connector_connections SET status='disconnected',health='disconnected',credential_ref=NULL,credential_metadata_json='{}',retry_count=0,last_error_code=NULL,updated_at=?,credential_generation=credential_generation+1 WHERE workspace_id=? AND id=?").bind(now, workspace.workspaceId, id),
    audit(db, workspace.workspaceId, identity, 'connector.disconnected', id, { connectorKey: connection.connector_key, credentialDeleted: true }, now),
    workspaceMutationFence(db, workspace.workspaceId, mutationEpoch, `connector.disconnect:${id}:${identity.requestId}`, now),
  ]).catch((error) => { throw normalizeMutationFenceError(error); });
  return { connectionId: id, status: 'disconnected', credentialDeleted: true };
}
