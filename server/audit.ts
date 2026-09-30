import { auditLimits, auditOutcome, auditOutcomes, type AuditEntry, type AuditFilters, type AuditPage } from '@/lib/audit-types';
import { hasPermission, requirePermission } from './authorization';
import type { WorkspaceContext } from './control-plane';
import { ApiError, type RequestIdentity } from './request-context';

const DAY = 86_400_000;
const allowedParameters = new Set(['from', 'to', 'actor', 'family', 'outcome', 'record', 'cursor', 'format']);
const identifier = /^[A-Za-z0-9._:-]{1,240}$/;
type Position = { at: string; id: string };
type Cursor = { version: 1; scope: string; filters: AuditFilters; after: Position };
type Row = { id: string; created_at: string; actor_user_id: string; action: string; entity_type: string; entity_id: string | null; request_id: string };

function invalid(message: string): never { throw new ApiError(400, 'invalid_audit_query', message); }
function instant(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalid('Use complete UTC timestamps for the audit date range.');
  return value;
}
function boundedIdentifier(value: string, name: string): string {
  if (value && !identifier.test(value)) invalid(`${name} must be an identifier of at most 240 characters.`);
  return value;
}
function filtersFrom(params: URLSearchParams, fallback: Partial<AuditFilters>, now: Date): AuditFilters {
  const to = instant(params.get('to') ?? fallback.to ?? now.toISOString());
  const from = instant(params.get('from') ?? fallback.from ?? new Date(Date.parse(to) - auditLimits.defaultDays * DAY).toISOString());
  if (Date.parse(from) >= Date.parse(to) || Date.parse(to) - Date.parse(from) > auditLimits.windowDays * DAY) invalid(`Choose an increasing date range of at most ${auditLimits.windowDays} days.`);
  const actor = boundedIdentifier((params.get('actor') ?? fallback.actor ?? '').trim(), 'Actor');
  const record = boundedIdentifier((params.get('record') ?? fallback.record ?? '').trim(), 'Record');
  const family = (params.get('family') ?? fallback.family ?? '').trim();
  if (family && !/^[a-z][a-z0-9_-]{0,39}$/.test(family)) invalid('Action family must be a lowercase name of at most 40 characters.');
  const outcome = params.get('outcome') ?? fallback.outcome ?? '';
  if (outcome && !(auditOutcomes as readonly string[]).includes(outcome)) invalid('Choose a supported audit outcome.');
  return { from, to, actor, family, outcome: outcome as AuditFilters['outcome'], record };
}
function decodeCursor(value: string): Cursor {
  try {
    if (!value || value.length > auditLimits.cursorCharacters || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Cursor>;
    if (parsed.version !== 1 || !/^[a-f0-9]{64}$/.test(parsed.scope ?? '') || !parsed.filters || !parsed.after
      || typeof parsed.after.at !== 'string' || !/^\d{4}-\d{2}-\d{2}[ T][\d:.]+Z?$/.test(parsed.after.at) || parsed.after.at.length > 32
      || typeof parsed.after.id !== 'string' || !identifier.test(parsed.after.id)) throw new Error();
    // Re-validate the cursor's complete query, not merely the caller's overrides.
    const canonical = filtersFrom(new URLSearchParams(parsed.filters as Record<string, string>), {}, new Date());
    if (JSON.stringify(canonical) !== JSON.stringify(parsed.filters)) throw new Error();
    return parsed as Cursor;
  } catch { return invalid('This audit cursor is invalid. Start a new search.'); }
}
function encodeCursor(cursor: Cursor): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(cursor)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
async function scopeFor(workspaceId: string, filters: AuditFilters): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([workspaceId, filters])));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function auditQuery(params: URLSearchParams, workspaceId: string, now = new Date()) {
  for (const key of params.keys()) if (!allowedParameters.has(key) || params.getAll(key).length !== 1) invalid('Unsupported or repeated audit query parameter.');
  if (params.has('format') && !['json', 'csv'].includes(params.get('format')!)) invalid('Audit format must be json or csv.');
  const cursor = params.has('cursor') ? decodeCursor(params.get('cursor')!) : null;
  const filters = filtersFrom(params, cursor?.filters ?? {}, now);
  const scope = await scopeFor(workspaceId, filters);
  if (cursor && cursor.scope !== scope) invalid('This audit cursor belongs to a different search. Start a new search.');
  if (cursor && (cursor.after.at.slice(0, 10) < filters.from.slice(0, 10) || cursor.after.at.slice(0, 10) > filters.to.slice(0, 10))) invalid('This audit cursor is outside the selected date range.');
  return { filters, scope, after: cursor?.after ?? null, csv: params.get('format') === 'csv' };
}

function entry(row: Row): AuditEntry | null {
  const timestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.created_at) ? row.created_at.replace(' ', 'T') + '.000Z' : row.created_at;
  if (!identifier.test(row.id) || !Number.isFinite(Date.parse(timestamp)) || !/^[a-z][a-z0-9._-]{0,119}$/.test(row.action)) return null;
  const safeId = (value: string | null) => value === null ? null : identifier.test(value) ? value : '[unavailable]';
  return { id: row.id, createdAt: new Date(timestamp).toISOString(), actor: safeId(row.actor_user_id)!, action: row.action, family: row.action.split('.')[0], outcome: auditOutcome(row.action), entityType: /^[a-z][a-z0-9_-]{0,79}$/.test(row.entity_type) ? row.entity_type : '[unavailable]', entityId: safeId(row.entity_id), requestId: safeId(row.request_id)! };
}

/** One bounded indexed candidate scan, never a filtered full-table scan or COUNT. */
export async function readAuditPage(db: D1Database, context: WorkspaceContext, params: URLSearchParams, now = new Date()): Promise<AuditPage> {
  requirePermission(context.workspace.role, 'audit:read');
  if (params.get('format') === 'csv') requirePermission(context.workspace.role, 'data:export');
  const query = await auditQuery(params, context.workspaceId, now);
  const { filters, after } = query;
  const clauses = ['workspace_id = ?', 'created_at >= ?', 'created_at < ?'];
  // Coarse day bounds include older SQLite UTC timestamps; exact UTC filtering
  // happens inside the bounded candidate page without defeating the index.
  const values: (string | number)[] = [context.workspaceId, filters.from.slice(0, 10), filters.to.slice(0, 10) + '~'];
  if (after) { clauses.push('(created_at, id) < (?, ?)'); values.push(after.at, after.id); }
  values.push(auditLimits.scanRows + 1);
  let rows: Row[];
  try {
    const result = await db.prepare(`SELECT substr(id,1,241) AS id, substr(created_at,1,33) AS created_at, substr(actor_user_id,1,241) AS actor_user_id, substr(action,1,121) AS action, substr(entity_type,1,81) AS entity_type, substr(entity_id,1,241) AS entity_id, substr(request_id,1,241) AS request_id FROM audit_events INDEXED BY idx_audit_events_workspace_created_id WHERE ${clauses.join(' AND ')} ORDER BY audit_events.created_at DESC, audit_events.id DESC LIMIT ?`).bind(...values).all<Row>();
    if (!result.success) throw new Error();
    rows = result.results;
  } catch { throw new ApiError(503, 'audit_unavailable', 'Audit history could not be loaded. Retry this page; no records were changed.'); }
  const events: AuditEntry[] = [];
  let scanned = 0;
  let skipped = 0;
  let last: Row | null = null;
  for (const row of rows.slice(0, auditLimits.scanRows)) {
    scanned += 1;
    last = row;
    const event = entry(row);
    if (!event) { skipped += 1; continue; }
    if (event.createdAt < filters.from || event.createdAt >= filters.to || (filters.actor && event.actor !== filters.actor)
      || (filters.family && event.family !== filters.family) || (filters.outcome && event.outcome !== filters.outcome) || (filters.record && event.entityId !== filters.record)) continue;
    events.push(event);
    if (events.length === auditLimits.pageSize) break;
  }
  const remaining = rows.length > scanned;
  const canContinue = last && identifier.test(last.id) && /^\d{4}-\d{2}-\d{2}[ T][\d:.]+Z?$/.test(last.created_at) && last.created_at.length <= 32;
  const nextCursor = remaining && last && canContinue ? encodeCursor({ version: 1, scope: query.scope, filters, after: { at: last.created_at, id: last.id } }) : null;
  const warnings = skipped ? [`${skipped} malformed audit ${skipped === 1 ? 'entry was' : 'entries were'} omitted from this page.`] : [];
  if (remaining && !canContinue) warnings.push('History could not continue past an invalid stored cursor. Narrow the date range or ask the owner to inspect the database.');
  return { events, filters, nextCursor, scanned, scanLimit: auditLimits.scanRows, pageSize: auditLimits.pageSize, partial: warnings.length > 0, warnings, canExport: hasPermission(context.workspace.role, 'data:export') };
}

/** Receipt confirms preparation, never successful download or complete history. */
export async function recordAuditExport(db: D1Database, context: WorkspaceContext, identity: RequestIdentity, page: AuditPage, now = new Date()): Promise<void> {
  requirePermission(context.workspace.role, 'audit:read');
  requirePermission(context.workspace.role, 'data:export');
  try {
    const result = await db.prepare("INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at) VALUES (?,?,?,'audit.export.prepared','workspace',?,?,?,?)")
      .bind(crypto.randomUUID(), context.workspaceId, identity.userId, context.workspaceId, JSON.stringify({ source: 'audit-viewer', scope: 'page', returned: page.events.length, scanned: page.scanned, partial: page.partial }), identity.requestId, now.toISOString()).run();
    if (!result.success) throw new Error();
  } catch { throw new ApiError(503, 'audit_export_unavailable', 'The export audit receipt could not be recorded. Retry the export; no CSV was released.'); }
}
