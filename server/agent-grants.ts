import type { WorkspaceContext } from './control-plane';
import type { RequestIdentity } from './request-context';
import { ApiError } from './request-context';
import { requirePermission } from './authorization';
import { captureWorkspaceMutationEpoch, normalizeMutationFenceError, workspaceMutationFence } from './mutation-fence';
import { pruneExpiredIdempotencyRecords } from './idempotency-maintenance';
import { assertD1BatchSize } from './d1-limits';

export const DEFAULT_LOCAL_AGENT_GRANT_TTL_DAYS = 30;
export const DEFAULT_LOCAL_AGENT_GRANT_TTL_MS = DEFAULT_LOCAL_AGENT_GRANT_TTL_DAYS * 86_400_000;

export function defaultLocalAgentGrantExpiry(now: string): string {
  return new Date(Date.parse(now) + DEFAULT_LOCAL_AGENT_GRANT_TTL_MS).toISOString();
}

type GrantMutationOperation = 'agent.grant.expiry' | 'agent.grant.revoke';
type GrantRow = { scopes_json: string; expires_at: string | null; created_at: string };
type MutationReceiptRow = { request_hash: string; response_json: string };
type ExpiryResponse = { agentId: string; toolId: string; expiresAt: string | null; status: 'updated' };
type RevokeResponse = { agentId: string; toolId: string; status: 'revoked' };

const json = (value: unknown) => JSON.stringify(value ?? {});

function boundedId(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw new ApiError(400, 'validation_error', `${name} is required and must be at most 128 characters.`);
  }
  return value.trim();
}

function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 24 || !value.endsWith('Z')) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function futureExpiry(value: unknown, now = Date.now()): string | null {
  if (value === null) return null;
  if (!isCanonicalUtcTimestamp(value)) {
    throw new ApiError(400, 'validation_error', 'expiresAt must be null or a canonical UTC timestamp in YYYY-MM-DDTHH:mm:ss.sssZ format.');
  }
  if (Date.parse(value) <= now) throw new ApiError(400, 'validation_error', 'expiresAt must be in the future.');
  return value;
}

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(json(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function grantMutationReplay<T extends ExpiryResponse | RevokeResponse>(
  db: D1Database,
  workspaceId: string,
  operation: GrantMutationOperation,
  idempotencyKey: string,
  requestHash: string,
): Promise<(T & { replayed: true }) | null> {
  const receipt = await db.prepare('SELECT request_hash,response_json FROM idempotency_records WHERE workspace_id=? AND operation=? AND key=?')
    .bind(workspaceId, operation, idempotencyKey)
    .first<MutationReceiptRow>();
  if (!receipt) return null;
  if (receipt.request_hash !== requestHash) {
    throw new ApiError(409, 'idempotency_conflict', 'That idempotency key was already used for a different agent grant mutation.');
  }
  try {
    const candidate = JSON.parse(receipt.response_json) as Record<string, unknown>;
    if ((candidate.result as { discardedByReset?: unknown } | undefined)?.discardedByReset === true) {
      throw new ApiError(409, 'idempotency_receipt_discarded', 'A workspace reset discarded this prior agent grant receipt. Submit the action again with a new idempotency key.');
    }
    const common = typeof candidate.agentId === 'string' && candidate.agentId.length > 0 && candidate.agentId.length <= 128
      && typeof candidate.toolId === 'string' && candidate.toolId.length > 0 && candidate.toolId.length <= 128;
    const valid = operation === 'agent.grant.expiry'
      ? common && candidate.status === 'updated' && (candidate.expiresAt === null || isCanonicalUtcTimestamp(candidate.expiresAt))
      : common && candidate.status === 'revoked';
    if (!valid) throw new Error('invalid receipt');
    return { ...candidate as T, replayed: true };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'idempotency_receipt_invalid', 'The stored agent grant receipt is invalid; no new grant mutation was performed.');
  }
}

async function readGrant(db: D1Database, workspaceId: string, agentId: string, toolId: string): Promise<GrantRow> {
  const grant = await db.prepare('SELECT scopes_json,expires_at,created_at FROM agent_tool_grants WHERE workspace_id=? AND agent_id=? AND tool_id=?')
    .bind(workspaceId, agentId, toolId)
    .first<GrantRow>();
  if (!grant) throw new ApiError(404, 'grant_not_found', 'The agent tool grant was not found in this workspace.');
  return grant;
}

export async function setAgentToolGrantExpiry(
  db: D1Database,
  identity: RequestIdentity,
  workspace: WorkspaceContext,
  input: { agentId: unknown; toolId: unknown; expiresAt?: unknown },
  idempotencyKeyInput?: unknown,
) {
  requirePermission(workspace.workspace.role, 'agents:manage');
  const agentId = boundedId(input.agentId, 'agentId');
  const toolId = boundedId(input.toolId, 'toolId');
  if (!Object.hasOwn(input, 'expiresAt')) throw new ApiError(400, 'validation_error', 'expiresAt is required and may be null.');
  const expiresAt = futureExpiry(input.expiresAt);
  const idempotencyKey = boundedId(idempotencyKeyInput, 'Idempotency-Key');
  const requestHash = await digest({ agentId, toolId, expiresAt });

  await pruneExpiredIdempotencyRecords(db, workspace.workspaceId);
  const replay = await grantMutationReplay<ExpiryResponse>(db, workspace.workspaceId, 'agent.grant.expiry', idempotencyKey, requestHash);
  if (replay) return replay;

  const mutationEpoch = await captureWorkspaceMutationEpoch(db, workspace.workspaceId);
  const grant = await readGrant(db, workspace.workspaceId, agentId, toolId);
  const now = new Date().toISOString();
  const auditId = crypto.randomUUID();
  const authorizationChangeId = crypto.randomUUID();
  const entityId = `${agentId}:${toolId}`;
  const response: ExpiryResponse = { agentId, toolId, expiresAt, status: 'updated' };
  const receiptExpiry = new Date(Date.parse(now) + 86_400_000).toISOString();
  const authorizationChanged = grant.expires_at !== expiresAt;
  const auditMetadata = json({ source: 'api', mutationEpoch, previousExpiresAt: grant.expires_at, expiresAt, authorizationInvalidated: authorizationChanged });
  const traceDetail = json({ reason: 'grant_expiry_changed', toolId, previousExpiresAt: grant.expires_at, expiresAt });

  let results: D1Result<unknown>[];
  try {
    const statements: D1PreparedStatement[] = [
      db.prepare(`
        INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at)
        SELECT ?,workspace_id,?,'agent.grant.expiry_updated','agent_tool_grant',?,?,?,?
        FROM agent_tool_grants
        WHERE workspace_id=? AND agent_id=? AND tool_id=? AND expires_at IS ? AND scopes_json=? AND created_at=?
      `).bind(auditId, identity.userId, entityId, auditMetadata, identity.requestId, now, workspace.workspaceId, agentId, toolId, grant.expires_at, grant.scopes_json, grant.created_at),
    ];
    if (authorizationChanged) {
      statements.push(
        db.prepare(`
          UPDATE approval_requests
          SET status='cancelled',decided_by_actor_id=NULL,decided_at=?,decision_id='grant-expiry-changed:' || id || ':' || ?
          WHERE workspace_id=? AND status='pending'
            AND run_id IN (
              SELECT id FROM agent_runs
              WHERE workspace_id=? AND agent_id=? AND tool_id=? AND status IN ('awaiting_approval','authorized','running')
            )
            AND EXISTS (SELECT 1 FROM audit_events WHERE workspace_id=? AND id=?)
        `).bind(now, authorizationChangeId, workspace.workspaceId, workspace.workspaceId, agentId, toolId, workspace.workspaceId, auditId),
        db.prepare(`
          INSERT INTO agent_traces (id,workspace_id,run_id,sequence,event_type,detail_json,created_at)
          SELECT lower(hex(randomblob(16))),r.workspace_id,r.id,
                 COALESCE((SELECT MAX(t.sequence)+1 FROM agent_traces t WHERE t.workspace_id=r.workspace_id AND t.run_id=r.id),1),
                 'grant_expiry_changed',?,?
          FROM agent_runs r
          WHERE r.workspace_id=? AND r.agent_id=? AND r.tool_id=?
            AND r.status IN ('awaiting_approval','authorized','running')
            AND EXISTS (SELECT 1 FROM audit_events WHERE workspace_id=? AND id=?)
        `).bind(traceDetail, now, workspace.workspaceId, agentId, toolId, workspace.workspaceId, auditId),
        db.prepare(`
          UPDATE agent_runs SET status='cancelled',finished_at=?
          WHERE workspace_id=? AND agent_id=? AND tool_id=?
            AND status IN ('awaiting_approval','authorized','running')
            AND EXISTS (SELECT 1 FROM audit_events WHERE workspace_id=? AND id=?)
        `).bind(now, workspace.workspaceId, agentId, toolId, workspace.workspaceId, auditId),
      );
    }
    statements.push(
      db.prepare(`
        UPDATE agent_tool_grants SET expires_at=?
        WHERE workspace_id=? AND agent_id=? AND tool_id=? AND expires_at IS ? AND scopes_json=? AND created_at=?
          AND EXISTS (SELECT 1 FROM audit_events WHERE workspace_id=? AND id=?)
      `).bind(expiresAt, workspace.workspaceId, agentId, toolId, grant.expires_at, grant.scopes_json, grant.created_at, workspace.workspaceId, auditId),
      workspaceMutationFence(db, workspace.workspaceId, mutationEpoch, `agent.grant.expiry:${agentId}:${toolId}:${idempotencyKey}`, now),
      db.prepare(`
        INSERT INTO idempotency_records (workspace_id,operation,key,request_hash,status_code,response_json,created_at,expires_at)
        SELECT ?,'agent.grant.expiry',?,?,200,?,?,?
        FROM audit_events WHERE workspace_id=? AND id=?
      `).bind(workspace.workspaceId, idempotencyKey, requestHash, json(response), now, receiptExpiry, workspace.workspaceId, auditId),
    );
    results = await db.batch(assertD1BatchSize(statements, 'Agent grant expiry update'));
  } catch (error) {
    const committed = await grantMutationReplay<ExpiryResponse>(db, workspace.workspaceId, 'agent.grant.expiry', idempotencyKey, requestHash);
    if (committed) return committed;
    throw normalizeMutationFenceError(error);
  }

  if (Number(results[0]?.meta.changes ?? 0) !== 1) {
    const committed = await grantMutationReplay<ExpiryResponse>(db, workspace.workspaceId, 'agent.grant.expiry', idempotencyKey, requestHash);
    if (committed) return committed;
    throw new ApiError(409, 'grant_state_changed', 'The agent tool grant changed while this request was in progress. Refresh and retry.');
  }
  return { ...response, replayed: false };
}

export async function revokeAgentToolGrant(
  db: D1Database,
  identity: RequestIdentity,
  workspace: WorkspaceContext,
  input: { agentId: unknown; toolId: unknown },
  idempotencyKeyInput?: unknown,
) {
  requirePermission(workspace.workspace.role, 'agents:manage');
  const agentId = boundedId(input.agentId, 'agentId');
  const toolId = boundedId(input.toolId, 'toolId');
  const idempotencyKey = boundedId(idempotencyKeyInput, 'Idempotency-Key');
  const requestHash = await digest({ agentId, toolId });

  await pruneExpiredIdempotencyRecords(db, workspace.workspaceId);
  const replay = await grantMutationReplay<RevokeResponse>(db, workspace.workspaceId, 'agent.grant.revoke', idempotencyKey, requestHash);
  if (replay) return replay;

  const mutationEpoch = await captureWorkspaceMutationEpoch(db, workspace.workspaceId);
  const grant = await readGrant(db, workspace.workspaceId, agentId, toolId);
  const now = new Date().toISOString();
  const auditId = crypto.randomUUID();
  const revocationId = crypto.randomUUID();
  const entityId = `${agentId}:${toolId}`;
  const response: RevokeResponse = { agentId, toolId, status: 'revoked' };
  const receiptExpiry = new Date(Date.parse(now) + 86_400_000).toISOString();
  const auditMetadata = json({
    source: 'api',
    mutationEpoch,
    previousExpiresAt: grant.expires_at,
    cancelledRunStatuses: ['awaiting_approval', 'authorized', 'running'],
  });
  const traceDetail = json({ reason: 'grant_revoked', toolId });

  let results: D1Result<unknown>[];
  try {
    results = await db.batch(assertD1BatchSize([
      db.prepare(`
        INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at)
        SELECT ?,workspace_id,?,'agent.grant.revoked','agent_tool_grant',?,?,?,?
        FROM agent_tool_grants
        WHERE workspace_id=? AND agent_id=? AND tool_id=? AND expires_at IS ? AND scopes_json=? AND created_at=?
      `).bind(auditId, identity.userId, entityId, auditMetadata, identity.requestId, now, workspace.workspaceId, agentId, toolId, grant.expires_at, grant.scopes_json, grant.created_at),
      db.prepare(`
        UPDATE approval_requests
        SET status='cancelled',decided_by_actor_id=NULL,decided_at=?,decision_id='grant-revoked:' || id || ':' || ?
        WHERE workspace_id=? AND status='pending'
          AND run_id IN (
            SELECT id FROM agent_runs
            WHERE workspace_id=? AND agent_id=? AND tool_id=? AND status IN ('awaiting_approval','authorized','running')
          )
          AND EXISTS (SELECT 1 FROM audit_events WHERE workspace_id=? AND id=?)
      `).bind(now, revocationId, workspace.workspaceId, workspace.workspaceId, agentId, toolId, workspace.workspaceId, auditId),
      db.prepare(`
        INSERT INTO agent_traces (id,workspace_id,run_id,sequence,event_type,detail_json,created_at)
        SELECT lower(hex(randomblob(16))),r.workspace_id,r.id,
               COALESCE((SELECT MAX(t.sequence)+1 FROM agent_traces t WHERE t.workspace_id=r.workspace_id AND t.run_id=r.id),1),
               'grant_revoked',?,?
        FROM agent_runs r
        WHERE r.workspace_id=? AND r.agent_id=? AND r.tool_id=?
          AND r.status IN ('awaiting_approval','authorized','running')
          AND EXISTS (SELECT 1 FROM audit_events WHERE workspace_id=? AND id=?)
      `).bind(traceDetail, now, workspace.workspaceId, agentId, toolId, workspace.workspaceId, auditId),
      db.prepare(`
        UPDATE agent_runs SET status='cancelled',finished_at=?
        WHERE workspace_id=? AND agent_id=? AND tool_id=?
          AND status IN ('awaiting_approval','authorized','running')
          AND EXISTS (SELECT 1 FROM audit_events WHERE workspace_id=? AND id=?)
      `).bind(now, workspace.workspaceId, agentId, toolId, workspace.workspaceId, auditId),
      db.prepare(`
        DELETE FROM agent_tool_grants
        WHERE workspace_id=? AND agent_id=? AND tool_id=? AND expires_at IS ? AND scopes_json=? AND created_at=?
          AND EXISTS (SELECT 1 FROM audit_events WHERE workspace_id=? AND id=?)
      `).bind(workspace.workspaceId, agentId, toolId, grant.expires_at, grant.scopes_json, grant.created_at, workspace.workspaceId, auditId),
      workspaceMutationFence(db, workspace.workspaceId, mutationEpoch, `agent.grant.revoke:${agentId}:${toolId}:${idempotencyKey}`, now),
      db.prepare(`
        INSERT INTO idempotency_records (workspace_id,operation,key,request_hash,status_code,response_json,created_at,expires_at)
        SELECT ?,'agent.grant.revoke',?,?,200,?,?,?
        FROM audit_events WHERE workspace_id=? AND id=?
      `).bind(workspace.workspaceId, idempotencyKey, requestHash, json(response), now, receiptExpiry, workspace.workspaceId, auditId),
    ], 'Agent grant revocation'));
  } catch (error) {
    const committed = await grantMutationReplay<RevokeResponse>(db, workspace.workspaceId, 'agent.grant.revoke', idempotencyKey, requestHash);
    if (committed) return committed;
    throw normalizeMutationFenceError(error);
  }

  if (Number(results[0]?.meta.changes ?? 0) !== 1 || Number(results[4]?.meta.changes ?? 0) !== 1) {
    const committed = await grantMutationReplay<RevokeResponse>(db, workspace.workspaceId, 'agent.grant.revoke', idempotencyKey, requestHash);
    if (committed) return committed;
    throw new ApiError(409, 'grant_state_changed', 'The agent tool grant changed while this request was in progress. Refresh and retry.');
  }
  return { ...response, replayed: false };
}
