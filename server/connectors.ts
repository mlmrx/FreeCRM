import { referenceConnectors } from '@/lib/multi-edition';
import type { WorkspaceContext } from './control-plane';
import type { RequestIdentity } from './request-context';
import { ApiError } from './request-context';
import { requirePermission } from './authorization';

const definition = (key: unknown) => {
  const found = referenceConnectors.find((item) => item.key === key);
  if (!found) throw new ApiError(400, 'unsupported_connector', 'Only complete reference connectors can be configured.');
  return found;
};
function audit(db: D1Database, workspaceId: string, identity: RequestIdentity, action: string, connectionId: string, metadata: unknown, now: string) {
  return db.prepare('INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), workspaceId, identity.userId, action, 'connector', connectionId, JSON.stringify(metadata), identity.requestId, now);
}

export async function connectSimulator(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, connectorKey: unknown) {
  requirePermission(workspace.workspace.role, 'connectors:manage');
  const connector = definition(connectorKey);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO connector_connections (id,workspace_id,connector_key,auth_type,credential_ref,credential_metadata_json,scopes_json,status,health,created_at,updated_at) VALUES (?,?,?,?,NULL,'{}',?,'connected','healthy',?,?) ON CONFLICT(workspace_id,connector_key) DO UPDATE SET status='connected',health='healthy',credential_ref=NULL,updated_at=excluded.updated_at`).bind(id, workspace.workspaceId, connector.key, connector.auth, JSON.stringify(connector.scopes), now, now),
    audit(db, workspace.workspaceId, identity, 'connector.connected', id, { connectorKey: connector.key, auth: 'simulated', scopes: connector.scopes }, now),
  ]);
  return { id, connectorKey: connector.key, status: 'connected', health: 'healthy', scopes: connector.scopes };
}

export async function syncSimulator(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, connectionId: unknown, idempotencyKey: unknown) {
  requirePermission(workspace.workspace.role, 'connectors:manage');
  if (typeof connectionId !== 'string' || typeof idempotencyKey !== 'string' || !idempotencyKey || idempotencyKey.length > 128) throw new ApiError(400, 'validation_error', 'A connectionId and bounded idempotencyKey are required.');
  const connection = await db.prepare("SELECT connector_key,sync_cursor,status FROM connector_connections WHERE workspace_id=? AND id=?").bind(workspace.workspaceId, connectionId).first<{ connector_key: string; sync_cursor: string | null; status: string }>();
  if (!connection || connection.status !== 'connected') throw new ApiError(409, 'connector_unavailable', 'Connector is not connected in this workspace.');
  definition(connection.connector_key);
  const replay = await db.prepare("SELECT response_json FROM idempotency_records WHERE workspace_id=? AND operation='connector.sync' AND key=?").bind(workspace.workspaceId, idempotencyKey).first<{ response_json: string }>();
  if (replay) return { ...JSON.parse(replay.response_json) as object, replayed: true };
  const cursor = String(Number(connection.sync_cursor ?? '0') + 1);
  const now = new Date().toISOString();
  const response = { connectionId, cursor, processed: 0, simulated: true };
  await db.batch([
    db.prepare("UPDATE connector_connections SET sync_cursor=?,health='healthy',retry_count=0,last_error_code=NULL,updated_at=? WHERE workspace_id=? AND id=?").bind(cursor, now, workspace.workspaceId, connectionId),
    db.prepare("INSERT INTO idempotency_records (workspace_id,operation,key,request_hash,status_code,response_json,created_at,expires_at) VALUES (?,'connector.sync',?,'local-simulator',200,?,?,?)").bind(workspace.workspaceId, idempotencyKey, JSON.stringify(response), now, new Date(Date.now() + 86_400_000).toISOString()),
    audit(db, workspace.workspaceId, identity, 'connector.synced', connectionId, { cursor, processed: 0, simulated: true }, now),
  ]);
  return { ...response, replayed: false };
}

export async function disconnectSimulator(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, connectionId: unknown) {
  requirePermission(workspace.workspace.role, 'connectors:manage');
  if (typeof connectionId !== 'string') throw new ApiError(400, 'validation_error', 'connectionId is required.');
  const now = new Date().toISOString();
  const result = await db.prepare("UPDATE connector_connections SET status='disconnected',health='disconnected',credential_ref=NULL,credential_metadata_json='{}',sync_cursor=NULL,updated_at=? WHERE workspace_id=? AND id=?").bind(now, workspace.workspaceId, connectionId).run();
  if (!result.meta.changes) throw new ApiError(404, 'connector_not_found', 'Connector was not found in this workspace.');
  await audit(db, workspace.workspaceId, identity, 'connector.disconnected', connectionId, { credentialDeleted: true }, now).run();
  return { connectionId, status: 'disconnected', credentialDeleted: true };
}
