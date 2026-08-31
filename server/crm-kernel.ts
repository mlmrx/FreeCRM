import { actorKinds, type ActorKind } from '@/lib/multi-edition';
import type { WorkspaceContext } from './control-plane';
import type { RequestIdentity } from './request-context';
import { ApiError } from './request-context';
import { requirePermission } from './authorization';
import { requireCapability } from './capabilities';
import { assertD1BatchSize } from './d1-limits';
import { captureWorkspaceMutationEpoch, normalizeMutationFenceError, workspaceMutationFence } from './mutation-fence';

const workKinds = ['work_item', 'opportunity', 'case', 'artifact', 'goal', 'policy'] as const;
type KernelCreateOperation = 'actor.create' | 'relationship.create' | 'work.create' | 'activity.create';
type KernelIdempotency = { key: unknown; requestBody: string };
type KernelCreateOutcome<T extends Record<string, unknown>> = { data: T; replayed: boolean };
type IdempotencyRow = { request_hash: string; response_json: string };
type PendingKernelReceipt = { operation: string; key: string; requestHash: string; now: string; expiresAt: string };
type KernelReceiptState<T extends Record<string, unknown>> = { replayed: true; data: T } | { replayed: false; receipt: PendingKernelReceipt };

const text = (value: unknown, field: string, max = 240) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ApiError(400, 'validation_error', `${field} is required and must be at most ${max} characters.`);
  return value.trim();
};
const metadata = (value: unknown) => {
  if (value === undefined) return '{}';
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 8_000) throw new ApiError(400, 'validation_error', 'metadata must be a bounded JSON object.');
  return JSON.stringify(value);
};
function audit(db: D1Database, identity: RequestIdentity, workspaceId: string, action: string, type: string, id: string, now: string) {
  return db.prepare('INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at) VALUES (?,?,?,?,?,?,\'{}\',?,?)').bind(crypto.randomUUID(), workspaceId, identity.userId, action, type, id, identity.requestId, now);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseKernelReceipt<T extends Record<string, unknown>>(raw: string): T {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new ApiError(500, 'idempotency_receipt_invalid', 'The saved operation receipt is unreadable; no new mutation was attempted.'); }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'data' in parsed) {
    const data = (parsed as { data?: unknown }).data;
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as T;
  }
  const discarded = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    && (parsed as { result?: { discardedByReset?: unknown } }).result?.discardedByReset === true;
  if (discarded) throw new ApiError(409, 'idempotency_result_discarded', 'That completed operation belongs to data removed by a workspace reset. Use a new idempotency key only if you intend to create it again.');
  throw new ApiError(500, 'idempotency_receipt_invalid', 'The saved operation receipt is invalid; no new mutation was attempted.');
}

async function beginKernelCreate<T extends Record<string, unknown>>(
  db: D1Database,
  workspaceId: string,
  operation: KernelCreateOperation,
  idempotency?: KernelIdempotency,
): Promise<KernelReceiptState<T>> {
  if (!idempotency || typeof idempotency.key !== 'string' || !idempotency.key.trim()) {
    throw new ApiError(400, 'idempotency_key_required', 'Idempotency-Key header is required.');
  }
  const key = idempotency.key.trim();
  if (key.length > 128) throw new ApiError(400, 'validation_error', 'Idempotency-Key must be at most 128 characters.');
  if (typeof idempotency.requestBody !== 'string') throw new ApiError(400, 'validation_error', 'A stable request body is required for idempotency.');

  const namespacedOperation = `kernel.${operation}`;
  const requestHash = await sha256(idempotency.requestBody);
  const now = new Date().toISOString();
  await db.prepare('DELETE FROM idempotency_records WHERE rowid IN (SELECT rowid FROM idempotency_records WHERE workspace_id=? AND expires_at <= ? LIMIT 100)').bind(workspaceId, now).run();
  const existing = await db.prepare('SELECT request_hash,response_json FROM idempotency_records WHERE workspace_id=? AND operation=? AND key=? LIMIT 1').bind(workspaceId, namespacedOperation, key).first<IdempotencyRow>();
  if (existing) {
    if (existing.request_hash !== requestHash) throw new ApiError(409, 'idempotency_conflict', 'That idempotency key was already used with a different request.');
    return { replayed: true, data: parseKernelReceipt<T>(existing.response_json) };
  }
  return {
    replayed: false,
    receipt: {
      operation: namespacedOperation,
      key,
      requestHash,
      now,
      expiresAt: new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString(),
    },
  };
}

async function commitKernelCreate<T extends Record<string, unknown>>(
  db: D1Database,
  workspaceId: string,
  receipt: PendingKernelReceipt,
  statements: D1PreparedStatement[],
  data: T,
  operationLabel: string,
): Promise<KernelCreateOutcome<T>> {
  const responseJson = JSON.stringify({ data });
  statements.push(db.prepare(`
    INSERT INTO idempotency_records (
      workspace_id, operation, key, request_hash, status_code, response_json, created_at, expires_at
    ) VALUES (?, ?, ?, ?, 201, ?, ?, ?)
  `).bind(workspaceId, receipt.operation, receipt.key, receipt.requestHash, responseJson, receipt.now, receipt.expiresAt));
  try {
    await db.batch(assertD1BatchSize(statements, operationLabel));
    return { data, replayed: false };
  } catch (error) {
    // Concurrent retries can both pass preflight. The unique receipt key is the
    // final fence and rolls the losing entity/audit writes back atomically.
    const committed = await db.prepare('SELECT request_hash,response_json FROM idempotency_records WHERE workspace_id=? AND operation=? AND key=? LIMIT 1').bind(workspaceId, receipt.operation, receipt.key).first<IdempotencyRow>();
    if (committed) {
      if (committed.request_hash !== receipt.requestHash) throw new ApiError(409, 'idempotency_conflict', 'That idempotency key was already used with a different request.');
      return { data: parseKernelReceipt<T>(committed.response_json), replayed: true };
    }
    throw normalizeMutationFenceError(error);
  }
}

export async function loadKernel(db: D1Database, workspace: WorkspaceContext) {
  requirePermission(workspace.workspace.role, 'records:read');
  const [actors, relationships, activities, work] = await Promise.all([
    db.prepare('SELECT id,kind,display_name,status,metadata_json,created_at,updated_at FROM actors WHERE workspace_id=? ORDER BY updated_at DESC LIMIT 500').bind(workspace.workspaceId).all(),
    db.prepare('SELECT id,source_actor_id,target_actor_id,relationship_type,valid_from,valid_to,metadata_json,created_at FROM party_relationships WHERE workspace_id=? ORDER BY created_at DESC LIMIT 500').bind(workspace.workspaceId).all(),
    db.prepare('SELECT id,actor_id,subject_type,subject_id,activity_type,occurred_at,summary,metadata_json,created_at FROM timeline_activities WHERE workspace_id=? ORDER BY occurred_at DESC LIMIT 500').bind(workspace.workspaceId).all(),
    db.prepare('SELECT id,kind,title,status,owner_actor_id,data_json,created_at,updated_at FROM work_objects WHERE workspace_id=? ORDER BY updated_at DESC LIMIT 500').bind(workspace.workspaceId).all(),
  ]);
  return { actors: actors.results, relationships: relationships.results, activities: activities.results, workObjects: work.results };
}

export async function createActor(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, input: Record<string, unknown>, idempotency?: KernelIdempotency) {
  requirePermission(workspace.workspace.role, 'records:write');
  if (!actorKinds.includes(input.kind as ActorKind)) throw new ApiError(400, 'validation_error', 'A valid actor kind is required.');
  const name = text(input.displayName, 'displayName');
  const receiptState = await beginKernelCreate<{ id: string; kind: ActorKind; displayName: string; status: string }>(db, workspace.workspaceId, 'actor.create', idempotency);
  if (receiptState.replayed) return { data: receiptState.data, replayed: true };
  const mutationEpoch = await captureWorkspaceMutationEpoch(db, workspace.workspaceId);
  await requireCapability(db, workspace, 'relationships');
  const id = crypto.randomUUID(); const now = receiptState.receipt.now;
  const data = { id, kind: input.kind as ActorKind, displayName: name, status: 'active' };
  return commitKernelCreate(db, workspace.workspaceId, receiptState.receipt, [
    db.prepare("INSERT INTO actors (id,workspace_id,kind,display_name,status,metadata_json,created_at,updated_at) VALUES (?,?,?,?, 'active',?,?,?)").bind(id, workspace.workspaceId, input.kind, name, metadata(input.metadata), now, now),
    audit(db, identity, workspace.workspaceId, 'actor.created', 'actor', id, now),
    workspaceMutationFence(db, workspace.workspaceId, mutationEpoch, `kernel.actor:${id}`, now),
  ], data, 'Kernel actor creation');
}

export async function createRelationship(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, input: Record<string, unknown>, idempotency?: KernelIdempotency) {
  requirePermission(workspace.workspace.role, 'records:write');
  const source = text(input.sourceActorId, 'sourceActorId', 128); const target = text(input.targetActorId, 'targetActorId', 128);
  if (source === target) throw new ApiError(400, 'validation_error', 'A party relationship must connect two different actors.');
  const type = text(input.relationshipType, 'relationshipType', 80);
  const receiptState = await beginKernelCreate<{ id: string; sourceActorId: string; targetActorId: string; relationshipType: string }>(db, workspace.workspaceId, 'relationship.create', idempotency);
  if (receiptState.replayed) return { data: receiptState.data, replayed: true };
  const mutationEpoch = await captureWorkspaceMutationEpoch(db, workspace.workspaceId);
  await requireCapability(db, workspace, 'relationships');
  const found = await db.prepare('SELECT COUNT(*) count FROM actors WHERE workspace_id=? AND id IN (?,?)').bind(workspace.workspaceId, source, target).first<{ count: number }>();
  if (found?.count !== 2) throw new ApiError(404, 'actor_not_found', 'Both actors must exist in this workspace.');
  const id = crypto.randomUUID(); const now = receiptState.receipt.now;
  const data = { id, sourceActorId: source, targetActorId: target, relationshipType: type };
  return commitKernelCreate(db, workspace.workspaceId, receiptState.receipt, [
    db.prepare('INSERT INTO party_relationships (id,workspace_id,source_actor_id,target_actor_id,relationship_type,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)').bind(id, workspace.workspaceId, source, target, type, metadata(input.metadata), now),
    audit(db, identity, workspace.workspaceId, 'relationship.created', 'party_relationship', id, now),
    workspaceMutationFence(db, workspace.workspaceId, mutationEpoch, `kernel.relationship:${id}`, now),
  ], data, 'Kernel relationship creation');
}

export async function createWorkObject(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, input: Record<string, unknown>, idempotency?: KernelIdempotency) {
  requirePermission(workspace.workspace.role, 'records:write');
  if (!workKinds.includes(input.kind as typeof workKinds[number])) throw new ApiError(400, 'validation_error', 'A valid work-object kind is required.');
  const kind = input.kind as typeof workKinds[number];
  const title = text(input.title, 'title'); const owner = input.ownerActorId == null ? null : text(input.ownerActorId, 'ownerActorId', 128);
  const receiptState = await beginKernelCreate<{ id: string; kind: typeof kind; title: string; status: string; ownerActorId: string | null }>(db, workspace.workspaceId, 'work.create', idempotency);
  if (receiptState.replayed) return { data: receiptState.data, replayed: true };
  const mutationEpoch = await captureWorkspaceMutationEpoch(db, workspace.workspaceId);
  if (kind === 'policy') await requireCapability(db, workspace, 'advancedPolicies');
  else if (kind === 'case') await requireCapability(db, workspace, 'service');
  else if (kind === 'opportunity') await requireCapability(db, workspace, 'sales');
  if (owner && !await db.prepare('SELECT id FROM actors WHERE workspace_id=? AND id=?').bind(workspace.workspaceId, owner).first()) throw new ApiError(404, 'actor_not_found', 'Owner actor was not found in this workspace.');
  const id = crypto.randomUUID(); const now = receiptState.receipt.now;
  const data = { id, kind, title, status: 'open', ownerActorId: owner };
  return commitKernelCreate(db, workspace.workspaceId, receiptState.receipt, [
    db.prepare("INSERT INTO work_objects (id,workspace_id,kind,title,status,owner_actor_id,data_json,created_at,updated_at) VALUES (?,?,?,?, 'open',?,?,?,?)").bind(id, workspace.workspaceId, input.kind, title, owner, metadata(input.data), now, now),
    audit(db, identity, workspace.workspaceId, 'work_object.created', String(input.kind), id, now),
    workspaceMutationFence(db, workspace.workspaceId, mutationEpoch, `kernel.work:${id}`, now),
  ], data, 'Kernel work-object creation');
}

export async function createTimelineActivity(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, input: Record<string, unknown>, idempotency?: KernelIdempotency) {
  requirePermission(workspace.workspace.role, 'records:write');
  const actorId = input.actorId == null ? null : text(input.actorId, 'actorId', 128); const subjectType = text(input.subjectType, 'subjectType', 80); const subjectId = text(input.subjectId, 'subjectId', 128); const activityType = text(input.activityType, 'activityType', 80); const summary = text(input.summary, 'summary', 1000);
  const subjectQueries: Record<string, string> = {
    actor: 'SELECT id FROM actors WHERE workspace_id=? AND id=?',
    record: 'SELECT id FROM records WHERE workspace_id=? AND id=?',
    work_object: 'SELECT id FROM work_objects WHERE workspace_id=? AND id=?',
    agent_run: 'SELECT id FROM agent_runs WHERE workspace_id=? AND id=?',
  };
  const subjectQuery = subjectQueries[subjectType];
  if (!subjectQuery) throw new ApiError(400, 'validation_error', 'subjectType must be actor, record, work_object, or agent_run.');
  const occurred = input.occurredAt == null ? new Date() : new Date(String(input.occurredAt)); if (Number.isNaN(occurred.getTime())) throw new ApiError(400, 'validation_error', 'occurredAt must be a valid date.');
  const receiptState = await beginKernelCreate<{ id: string; actorId: string | null; subjectType: string; subjectId: string; activityType: string; occurredAt: string; summary: string }>(db, workspace.workspaceId, 'activity.create', idempotency);
  if (receiptState.replayed) return { data: receiptState.data, replayed: true };
  const mutationEpoch = await captureWorkspaceMutationEpoch(db, workspace.workspaceId);
  if (actorId && !await db.prepare('SELECT id FROM actors WHERE workspace_id=? AND id=?').bind(workspace.workspaceId, actorId).first()) throw new ApiError(404, 'actor_not_found', 'Activity actor was not found in this workspace.');
  if (!await db.prepare(subjectQuery).bind(workspace.workspaceId, subjectId).first()) throw new ApiError(404, 'subject_not_found', 'Activity subject was not found in this workspace.');
  const id = crypto.randomUUID(); const now = receiptState.receipt.now;
  const data = { id, actorId, subjectType, subjectId, activityType, occurredAt: occurred.toISOString(), summary };
  return commitKernelCreate(db, workspace.workspaceId, receiptState.receipt, [
    db.prepare('INSERT INTO timeline_activities (id,workspace_id,actor_id,subject_type,subject_id,activity_type,occurred_at,summary,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id, workspace.workspaceId, actorId, subjectType, subjectId, activityType, occurred.toISOString(), summary, metadata(input.metadata), now),
    audit(db, identity, workspace.workspaceId, 'timeline.activity.created', 'timeline_activity', id, now),
    workspaceMutationFence(db, workspace.workspaceId, mutationEpoch, `kernel.timeline:${id}`, now),
  ], data, 'Kernel timeline activity creation');
}
