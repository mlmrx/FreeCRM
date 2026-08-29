import { actorKinds, type ActorKind } from '@/lib/multi-edition';
import type { WorkspaceContext } from './control-plane';
import type { RequestIdentity } from './request-context';
import { ApiError } from './request-context';
import { requirePermission } from './authorization';

const workKinds = ['work_item', 'opportunity', 'case', 'artifact', 'goal', 'policy'] as const;
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

export async function createActor(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, input: Record<string, unknown>) {
  requirePermission(workspace.workspace.role, 'records:write');
  if (!actorKinds.includes(input.kind as ActorKind)) throw new ApiError(400, 'validation_error', 'A valid actor kind is required.');
  const name = text(input.displayName, 'displayName');
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await db.batch([db.prepare("INSERT INTO actors (id,workspace_id,kind,display_name,status,metadata_json,created_at,updated_at) VALUES (?,?,?,?, 'active',?,?,?)").bind(id, workspace.workspaceId, input.kind, name, metadata(input.metadata), now, now), audit(db, identity, workspace.workspaceId, 'actor.created', 'actor', id, now)]);
  return { id, kind: input.kind, displayName: name, status: 'active' };
}

export async function createRelationship(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, input: Record<string, unknown>) {
  requirePermission(workspace.workspace.role, 'records:write');
  const source = text(input.sourceActorId, 'sourceActorId', 128); const target = text(input.targetActorId, 'targetActorId', 128);
  if (source === target) throw new ApiError(400, 'validation_error', 'A party relationship must connect two different actors.');
  const type = text(input.relationshipType, 'relationshipType', 80); const id = crypto.randomUUID(); const now = new Date().toISOString();
  const found = await db.prepare('SELECT COUNT(*) count FROM actors WHERE workspace_id=? AND id IN (?,?)').bind(workspace.workspaceId, source, target).first<{ count: number }>();
  if (found?.count !== 2) throw new ApiError(404, 'actor_not_found', 'Both actors must exist in this workspace.');
  await db.batch([db.prepare('INSERT INTO party_relationships (id,workspace_id,source_actor_id,target_actor_id,relationship_type,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)').bind(id, workspace.workspaceId, source, target, type, metadata(input.metadata), now), audit(db, identity, workspace.workspaceId, 'relationship.created', 'party_relationship', id, now)]);
  return { id, sourceActorId: source, targetActorId: target, relationshipType: type };
}

export async function createWorkObject(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, input: Record<string, unknown>) {
  requirePermission(workspace.workspace.role, 'records:write');
  if (!workKinds.includes(input.kind as typeof workKinds[number])) throw new ApiError(400, 'validation_error', 'A valid work-object kind is required.');
  const title = text(input.title, 'title'); const owner = input.ownerActorId == null ? null : text(input.ownerActorId, 'ownerActorId', 128); const id = crypto.randomUUID(); const now = new Date().toISOString();
  if (owner && !await db.prepare('SELECT id FROM actors WHERE workspace_id=? AND id=?').bind(workspace.workspaceId, owner).first()) throw new ApiError(404, 'actor_not_found', 'Owner actor was not found in this workspace.');
  await db.batch([db.prepare("INSERT INTO work_objects (id,workspace_id,kind,title,status,owner_actor_id,data_json,created_at,updated_at) VALUES (?,?,?,?, 'open',?,?,?,?)").bind(id, workspace.workspaceId, input.kind, title, owner, metadata(input.data), now, now), audit(db, identity, workspace.workspaceId, 'work_object.created', String(input.kind), id, now)]);
  return { id, kind: input.kind, title, status: 'open', ownerActorId: owner };
}

export async function createTimelineActivity(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, input: Record<string, unknown>) {
  requirePermission(workspace.workspace.role, 'records:write');
  const actorId = input.actorId == null ? null : text(input.actorId, 'actorId', 128); const subjectType = text(input.subjectType, 'subjectType', 80); const subjectId = text(input.subjectId, 'subjectId', 128); const activityType = text(input.activityType, 'activityType', 80); const summary = text(input.summary, 'summary', 1000);
  if (actorId && !await db.prepare('SELECT id FROM actors WHERE workspace_id=? AND id=?').bind(workspace.workspaceId, actorId).first()) throw new ApiError(404, 'actor_not_found', 'Activity actor was not found in this workspace.');
  const occurred = input.occurredAt == null ? new Date() : new Date(String(input.occurredAt)); if (Number.isNaN(occurred.getTime())) throw new ApiError(400, 'validation_error', 'occurredAt must be a valid date.');
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await db.batch([db.prepare('INSERT INTO timeline_activities (id,workspace_id,actor_id,subject_type,subject_id,activity_type,occurred_at,summary,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id, workspace.workspaceId, actorId, subjectType, subjectId, activityType, occurred.toISOString(), summary, metadata(input.metadata), now), audit(db, identity, workspace.workspaceId, 'timeline.activity.created', 'timeline_activity', id, now)]);
  return { id, actorId, subjectType, subjectId, activityType, occurredAt: occurred.toISOString(), summary };
}
