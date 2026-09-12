import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { auditCsv, auditLimits, auditOutcome, type AuditEntry } from '@/lib/audit-types';
import { auditQuery, readAuditPage, recordAuditExport } from '@/server/audit';
import type { WorkspaceContext } from '@/server/control-plane';

class Statement {
  constructor(readonly database: Database, readonly sql: string, readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new Statement(this.database, this.sql, values); }
  async all<T>() {
    if (this.database.failNext) { this.database.failNext = false; throw new Error('Synthetic storage failure; private details must not escape'); }
    this.database.queries.push({ sql: this.sql, values: this.values });
    return { success: true, results: this.database.sqlite.prepare(this.sql).all(...this.values as SQLInputValue[]) as T[] };
  }
  async run() {
    if (this.database.failNext) { this.database.failNext = false; throw new Error('Synthetic receipt failure'); }
    const result = this.database.sqlite.prepare(this.sql).run(...this.values as SQLInputValue[]);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}
class Database {
  readonly sqlite = new DatabaseSync(':memory:');
  readonly queries: { sql: string; values: unknown[] }[] = [];
  failNext = false;
  constructor() {
    this.sqlite.exec('PRAGMA foreign_keys=ON');
    const directory = new URL('../drizzle/', import.meta.url);
    for (const file of readdirSync(directory).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
      for (const statement of readFileSync(new URL(file, directory), 'utf8').split('--> statement-breakpoint')) if (statement.trim()) this.sqlite.exec(statement);
    }
    for (const workspace of ['audit-a', 'audit-b']) this.sqlite.prepare("INSERT INTO workspaces (id,owner_user_id,owner_email,name) VALUES (?,?,?,?)").run(workspace, `owner-${workspace}`, `${workspace}@example.test`, workspace);
  }
  prepare(sql: string) { return new Statement(this, sql); }
  d1() { return this as unknown as D1Database; }
}
const opened: Database[] = [];
afterEach(() => { opened.splice(0).forEach((db) => db.sqlite.close()); });
function setup() { const db = new Database(); opened.push(db); return db; }
const now = new Date('2026-09-12T00:00:00.000Z');
const window = { from: '2026-09-01T00:00:00.000Z', to: now.toISOString() };
function context(role: WorkspaceContext['workspace']['role'] = 'owner', workspaceId = 'audit-a'): WorkspaceContext {
  return { workspaceId, workspace: { id: workspaceId, name: 'Synthetic', ownerName: 'Synthetic owner', ownerEmail: 'owner@example.test', role, profile: 'personal', timezone: 'UTC', currency: 'USD', locale: 'en-US', settings: {}, createdAt: window.from, updatedAt: window.to } };
}
function insert(db: Database, number: number, overrides: Partial<{ id: string; workspace: string; at: string; actor: string; action: string; entity: string; metadata: string }> = {}) {
  db.sqlite.prepare('INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,before_json,after_json,metadata_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(overrides.id ?? `event-${String(number).padStart(5, '0')}`, overrides.workspace ?? 'audit-a', overrides.actor ?? 'owner-a', overrides.action ?? 'record.update', 'contact', overrides.entity ?? 'record-a', '{"private":"before"}', '{"private":"after"}', overrides.metadata ?? '{"providerPayload":"private synthetic content"}', 'request-a', overrides.at ?? '2026-09-10T12:00:00.000Z');
}
const query = (fields: Record<string, string | undefined> = {}) => {
  const params = new URLSearchParams(window);
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) params.set(key, value);
  return params;
};

describe('bounded workspace audit history', () => {
  it('uses one tenant/time/id index without COUNT or an unbounded filtered scan', async () => {
    const db = setup(); insert(db, 1);
    const page = await readAuditPage(db.d1(), context(), query(), now);
    expect(page.events).toHaveLength(1);
    expect(page.events[0]).toEqual({ id: 'event-00001', createdAt: '2026-09-10T12:00:00.000Z', actor: 'owner-a', action: 'record.update', family: 'record', outcome: 'unknown', entityType: 'contact', entityId: 'record-a', requestId: 'request-a' });
    expect(JSON.stringify(page)).not.toMatch(/providerPayload|private synthetic|before_json|after_json|metadata/);
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].values.at(-1)).toBe(auditLimits.scanRows + 1);
    const plan = db.sqlite.prepare(`EXPLAIN QUERY PLAN ${db.queries[0].sql}`).all(...db.queries[0].values as SQLInputValue[]);
    expect(JSON.stringify(plan)).toContain('idx_audit_events_workspace_created_id');
    expect(JSON.stringify(plan)).not.toMatch(/USE TEMP B-TREE|SCAN audit_events/);
    expect(page.nextCursor).toBeNull();
  });

  it('fences every page and refuses cursors copied from another tenant', async () => {
    const db = setup();
    for (let index = 0; index < 55; index++) insert(db, index);
    insert(db, 999, { workspace: 'audit-b', actor: 'owner-b' });
    const page = await readAuditPage(db.d1(), context(), query(), now);
    expect(page.events).toHaveLength(50);
    expect(page.events.every((event) => event.actor === 'owner-a')).toBe(true);
    await expect(readAuditPage(db.d1(), context('owner', 'audit-b'), query({ cursor: page.nextCursor! }), now)).rejects.toMatchObject({ status: 400, code: 'invalid_audit_query' });
    expect((await readAuditPage(db.d1(), context('owner', 'audit-b'), query(), now)).events.map((event) => event.actor)).toEqual(['owner-b']);
  });

  it.each(['member', 'operator', 'agent'] as const)('denies %s before reading audit storage', async (role) => {
    const db = setup();
    await expect(readAuditPage(db.d1(), context(role), query(), now)).rejects.toMatchObject({ status: 403 });
    expect(db.queries).toHaveLength(0);
  });

  it('allows auditor viewing but requires data:export as well as audit:read for CSV', async () => {
    const db = setup(); insert(db, 1);
    expect((await readAuditPage(db.d1(), context('auditor'), query(), now)).canExport).toBe(false);
    await expect(readAuditPage(db.d1(), context('auditor'), query({ format: 'csv' }), now)).rejects.toMatchObject({ status: 403 });
    expect((await readAuditPage(db.d1(), context('admin'), query({ format: 'csv' }), now)).canExport).toBe(true);
  });

  it('paginates tied timestamps without duplicates or gaps and retries an identical cursor safely', async () => {
    const db = setup();
    for (let index = 0; index < 123; index++) insert(db, index);
    const first = await readAuditPage(db.d1(), context(), query(), now);
    const params = new URLSearchParams({ cursor: first.nextCursor! });
    const second = await readAuditPage(db.d1(), context(), params, new Date(now.getTime() + 10_000));
    expect(await readAuditPage(db.d1(), context(), params, now)).toEqual(second);
    const third = await readAuditPage(db.d1(), context(), new URLSearchParams({ cursor: second.nextCursor! }), now);
    const ids = [...first.events, ...second.events, ...third.events].map((event) => event.id);
    expect(new Set(ids).size).toBe(123);
    expect(ids).toEqual([...ids].sort().reverse());
    expect(third.nextCursor).toBeNull();
    const plan = db.sqlite.prepare(`EXPLAIN QUERY PLAN ${db.queries[1].sql}`).all(...db.queries[1].values as SQLInputValue[]);
    expect(JSON.stringify(plan)).not.toMatch(/USE TEMP B-TREE|SCAN audit_events/);
  });

  it('advances an empty filtered page within a strict 500-candidate scan budget', async () => {
    const db = setup();
    db.sqlite.exec('BEGIN');
    for (let index = 0; index < 1005; index++) insert(db, index, { actor: index < 5 ? 'rare-actor' : 'other-actor' });
    db.sqlite.exec('COMMIT');
    const first = await readAuditPage(db.d1(), context(), query({ actor: 'rare-actor' }), now);
    expect(first).toMatchObject({ events: [], scanned: 500, partial: false });
    expect(first.nextCursor).toBeTruthy();
    const second = await readAuditPage(db.d1(), context(), new URLSearchParams({ cursor: first.nextCursor! }), now);
    const third = await readAuditPage(db.d1(), context(), new URLSearchParams({ cursor: second.nextCursor! }), now);
    expect(second.scanned).toBe(500);
    expect(third.events).toHaveLength(5);
    expect(third.nextCursor).toBeNull();
    expect(db.queries).toHaveLength(3);
  });

  it('combines exact UTC, actor, action-family, outcome and affected-record filters', async () => {
    const db = setup();
    insert(db, 1, { action: 'agent.approval.rejected' });
    insert(db, 2, { action: 'agent.approval.approved' });
    insert(db, 3, { action: 'agent.approval.rejected', entity: 'record-b' });
    insert(db, 4, { action: 'agent.approval.rejected', actor: 'other-actor' });
    insert(db, 5, { action: 'agent.approval.rejected', at: window.to });
    const page = await readAuditPage(db.d1(), context(), query({ actor: 'owner-a', family: 'agent', outcome: 'rejected', record: 'record-a' }), now);
    expect(page.events.map((event) => event.id)).toEqual(['event-00001']);
    expect(auditOutcome('agent.action.proposed')).toBe('unknown');
    expect(auditOutcome('provider.secret.succeeded')).toBe('unknown');
    expect(auditOutcome('agent.approval.approved')).toBe('approved');
    expect(auditOutcome('agent.run.executed')).toBe('executed');
  });

  it('includes legacy SQLite UTC timestamps and reports malformed rows as partial', async () => {
    const db = setup(); insert(db, 1, { at: '2026-09-01 00:00:00' }); insert(db, 2, { action: 'invalid action with payload' });
    const page = await readAuditPage(db.d1(), context(), query(), now);
    expect(page.events[0].createdAt).toBe(window.from);
    expect(page.partial).toBe(true);
    expect(page.warnings[0]).toContain('1 malformed');
  });

  it('returns a safe retryable storage error and leaves immutable rows untouched', async () => {
    const db = setup(); insert(db, 1); db.failNext = true;
    await expect(readAuditPage(db.d1(), context(), query(), now)).rejects.toMatchObject({ status: 503, code: 'audit_unavailable', message: expect.not.stringContaining('private details') });
    expect((await readAuditPage(db.d1(), context(), query(), now)).events).toHaveLength(1);
    expect(() => db.sqlite.exec("UPDATE audit_events SET action='tampered' WHERE id='event-00001'")).toThrow('append-only');
    expect(() => db.sqlite.exec("DELETE FROM audit_events WHERE id='event-00001'")).toThrow('append-only');
  });

  it('records minimal export preparation evidence and fails closed when receipt insertion fails', async () => {
    const db = setup(); insert(db, 1);
    const page = await readAuditPage(db.d1(), context(), query(), now);
    const identity = { userId: 'owner-a', email: 'synthetic@example.test', displayName: 'Synthetic', runtimeMode: 'device' as const, requestId: 'export-request' };
    await recordAuditExport(db.d1(), context(), identity, page, now);
    const rows = db.sqlite.prepare("SELECT workspace_id,actor_user_id,metadata_json,request_id FROM audit_events WHERE action='audit.export.prepared'").all();
    expect(rows).toEqual([{ workspace_id: 'audit-a', actor_user_id: 'owner-a', metadata_json: JSON.stringify({ source: 'audit-viewer', scope: 'page', returned: 1, scanned: 1, partial: false }), request_id: 'export-request' }]);
    await expect(recordAuditExport(db.d1(), context('auditor'), identity, page, now)).rejects.toMatchObject({ status: 403 });
    db.failNext = true;
    await expect(recordAuditExport(db.d1(), context(), identity, page, now)).rejects.toMatchObject({ status: 503, code: 'audit_export_unavailable' });
    expect(db.sqlite.prepare("SELECT count(*) count FROM audit_events WHERE action='audit.export.prepared'").get()).toMatchObject({ count: 1 });
  });

  it.each([{ workspaceId: 'audit-b' }, { actor: "' OR 1=1" }, { family: 'record.%' }, { outcome: 'success' }, { from: '2026-02-31T00:00:00.000Z' }, { from: '2024-01-01T00:00:00.000Z' }, { to: window.from }, { format: 'xml' }, { cursor: '{}' }, { cursor: 'a'.repeat(2401) }])('rejects invalid query %j', async (fields) => {
    await expect(auditQuery(query(fields), 'audit-a', now)).rejects.toMatchObject({ status: 400 });
  });

  it('rejects repeated parameters and changed filters on an existing cursor', async () => {
    const db = setup(); for (let index = 0; index < 51; index++) insert(db, index);
    const page = await readAuditPage(db.d1(), context(), query(), now);
    await expect(auditQuery(query({ cursor: page.nextCursor!, actor: 'other-actor' }), 'audit-a', now)).rejects.toMatchObject({ status: 400 });
    const repeated = query(); repeated.append('actor', 'one'); repeated.append('actor', 'two');
    await expect(auditQuery(repeated, 'audit-a', now)).rejects.toMatchObject({ status: 400 });
  });
});

describe('audit CSV safety', () => {
  it('escapes formulas, quotes and embedded lines in every column without exporting extra fields', () => {
    const malicious = '=HYPERLINK("https://example.test")';
    const value = { id: malicious, createdAt: '+1', actor: '\t@SUM(1)', action: '-2', family: '  =2', outcome: 'unknown', entityType: 'a,"b"\nc', entityId: null, requestId: '\u0001=1', metadata: 'must not appear' } as AuditEntry;
    const csv = auditCsv([value]);
    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
    for (const raw of ['+1', '\t@SUM(1)', '-2', '  =2', '\u0001=1']) expect(csv).toContain(`"'${raw}"`);
    expect(csv).toContain('"a,""b""\nc"');
    expect(csv).not.toContain('must not appear');
    expect(csv.split('\r\n')[0]).toBe('event_id,created_at_utc,actor_id,action,action_family,outcome,entity_type,entity_id,request_id');
    expect(auditCsv([])).toHaveLength(csv.split('\r\n')[0].length + 2);
  });
});
