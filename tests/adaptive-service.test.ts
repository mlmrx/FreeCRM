import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportAdaptive, mutateAdaptive, readAdaptiveSnapshot } from '@/server/adaptive';
import { adaptivePackCatalog } from '@/lib/adaptive-catalog';
import * as scout from '@/server/capability-scout';
import * as ai from '@/server/brain-ai';
import { editableAdaptiveSettings } from '@/lib/adaptive-client';
import type { AdaptiveRelease, AdaptiveSignal } from '@/lib/adaptive-types';
import type { WorkspaceContext } from '@/server/control-plane';
import type { RequestIdentity } from '@/server/request-context';

class Statement {
  constructor(readonly sqlite: DatabaseSync, readonly sql: string, readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new Statement(this.sqlite, this.sql, values); }
  params() { return this.values.map((value) => value instanceof ArrayBuffer ? new Uint8Array(value) : value) as SQLInputValue[]; }
  async first<T>() { return (this.sqlite.prepare(this.sql).get(...this.params()) as T | undefined) ?? null; }
  async all<T>() { return { success: true, results: this.sqlite.prepare(this.sql).all(...this.params()) as T[], meta: { changes: 0 } }; }
  async run<T>() {
    // SELECT detection preserves the supported Node 22.13 SQLite runtime.
    if (/^\s*SELECT\b/i.test(this.sql)) return this.all<T>();
    const result = this.sqlite.prepare(this.sql).run(...this.params());
    return { success: true, results: [] as T[], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

class TestDatabase {
  readonly sqlite = new DatabaseSync(':memory:');
  beforeNextBatch: (() => void) | undefined;
  constructor(throughMigration = Number.POSITIVE_INFINITY) {
    this.sqlite.exec('PRAGMA foreign_keys=ON');
    const directory = new URL('../drizzle/', import.meta.url);
    for (const name of readdirSync(directory).filter((name) => /^\d{4}_.+\.sql$/.test(name) && Number(name.slice(0, 4)) <= throughMigration).sort()) {
      for (const statement of readFileSync(new URL(name, directory), 'utf8').split('--> statement-breakpoint')) if (statement.trim()) this.sqlite.exec(statement);
    }
  }
  prepare(sql: string) { return new Statement(this.sqlite, sql); }
  async batch<T>(statements: D1PreparedStatement[]) {
    const before = this.beforeNextBatch; this.beforeNextBatch = undefined; before?.();
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements as unknown as Statement[]) results.push(await statement.run<T>());
      this.sqlite.exec('COMMIT'); return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  d1() { return this as unknown as D1Database; }
  count(table: string, workspaceId: string) { return Number((this.sqlite.prepare(`SELECT count(*) count FROM ${table} WHERE workspace_id=?`).get(workspaceId) as { count: number }).count); }
}

const open: TestDatabase[] = [];
const now = '2026-09-09T12:00:00.000Z';
function tenant(db: TestDatabase, workspaceId: string, role: WorkspaceContext['workspace']['role'] = 'owner'): WorkspaceContext {
  db.sqlite.prepare("INSERT INTO workspaces (id,owner_user_id,owner_email,owner_name,name,profile,timezone,currency,locale,settings_json,created_at,updated_at) VALUES (?,?,?,'Synthetic owner',?,'personal','UTC','USD','en-US','{}',?,?)")
    .run(workspaceId, `owner-${workspaceId}`, `${workspaceId}@example.test`, workspaceId, now, now);
  return { workspaceId, workspace: { id: workspaceId, name: workspaceId, ownerEmail: `${workspaceId}@example.test`, ownerName: 'Synthetic owner', role, profile: 'personal', timezone: 'UTC', currency: 'USD', locale: 'en-US', settings: {}, createdAt: now, updatedAt: now } };
}
function fixture(role: WorkspaceContext['workspace']['role'] = 'owner') {
  const db = new TestDatabase(); open.push(db);
  const context = tenant(db, 'adaptive-a', role);
  const identity: RequestIdentity = { userId: 'adaptive-owner', email: 'adaptive-owner@example.test', displayName: 'Synthetic owner', requestId: 'adaptive-test', runtimeMode: 'device' };
  const read = () => readAdaptiveSnapshot(db.d1(), context, identity);
  const write = (body: Record<string, unknown>) => mutateAdaptive(db.d1(), context, identity, { operationId: crypto.randomUUID(), ...body });
  const settings = async (overrides: Record<string, unknown> = {}) => {
    const snapshot = await read();
    return write({ action: 'settings.update', ...editableAdaptiveSettings(snapshot.settings), expectedRevision: snapshot.settings.revision, ...overrides });
  };
  return { db, context, identity, read, write, settings };
}
function source(db: TestDatabase, workspaceId = 'adaptive-a', body = 'I will send the synthetic launch outline tomorrow.') {
  const id = crypto.randomUUID();
  db.sqlite.prepare("INSERT INTO brain_sources (workspace_id,id,title,body,kind,tags_json,pinned,version,created_at,updated_at) VALUES (?,?,'Synthetic launch notes',?,'note','[]',0,1,?,?)").run(workspaceId, id, body, now, now);
  return id;
}
function record(db: TestDatabase, workspaceId = 'adaptive-a', objectType = 'task', status = 'open', dueAt: string | null = '2026-09-08T12:00:00.000Z', updatedAt = now) {
  const id = crypto.randomUUID();
  db.sqlite.prepare('INSERT INTO records (workspace_id,id,object_type,name,status,due_at,owner_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(workspaceId, id, objectType, 'Synthetic relationship work', status, dueAt, 'adaptive-owner', updatedAt, updatedAt);
  return id;
}
function followup(signal: AdaptiveSignal, overrides: Record<string, unknown> = {}) {
  return { action: 'followup.create', signalId: signal.id, fingerprint: signal.fingerprint, title: 'Review synthetic launch outline', dueAt: '2026-09-12T12:00:00.000Z', followUpDays: 3, ...overrides };
}
function announcement(overrides: Partial<AdaptiveRelease> = {}): AdaptiveRelease {
  return { id: 'twenty-123', projectId: 'twenty', title: 'Synthetic sales pipeline improvements', version: 'v1.0.0', body: 'Synthetic vendor announcement about sales pipelines.', url: 'https://github.com/twentyhq/twenty/releases/tag/v1.0.0', publishedAt: '2026-09-08T00:00:00.000Z', fetchedAt: now, topics: ['sales'], suggestedPackIds: ['pipeline-watch'], ...overrides };
}
function advanceEpoch(db: TestDatabase, workspaceId: string) {
  const id = crypto.randomUUID(); const token = crypto.randomUUID(); const lease = crypto.randomUUID();
  db.sqlite.prepare("INSERT INTO workspace_maintenance_sessions (workspace_id,purpose,token,mode,operation_id,status,lease_token,lease_expires_at) VALUES (?,'reset',?,'clean',?,'running',?,'2099-01-01T00:00:00.000Z')").run(workspaceId, token, id, lease);
  db.sqlite.prepare("INSERT INTO workspace_reset_operations (workspace_id,operation_id,mode,token,lease_token,status) VALUES (?,?,'clean',?,?,'running')").run(workspaceId, id, token, lease);
  db.sqlite.prepare('UPDATE workspaces SET mutation_epoch=mutation_epoch+1 WHERE id=?').run(workspaceId);
  db.sqlite.prepare("UPDATE workspace_reset_operations SET status='completed',response_json='{}' WHERE workspace_id=? AND operation_id=?").run(workspaceId, id);
  db.sqlite.prepare("UPDATE workspace_maintenance_sessions SET status='completed',response_json='{}',lease_token=NULL,lease_expires_at=NULL WHERE workspace_id=? AND purpose='reset'").run(workspaceId);
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(now)); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); for (const db of open.splice(0)) db.sqlite.close(); });

describe('adaptive CRM real SQLite persistence', () => {
  it('reads live private signals without writing, scanning, or enabling learning', async () => {
    const f = fixture(); const sourceId = source(f.db); const overdueId = record(f.db);
    const foreign = tenant(f.db, 'adaptive-b'); source(f.db, foreign.workspaceId, 'I will send the foreign tenant secret.');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const snapshot = await f.read();
    expect(snapshot.settings).toMatchObject({ learningEnabled: false, autoAdapt: false, watchEnabled: false, paused: false, revision: 0 });
    expect(snapshot.signals).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'commitment', evidence: [expect.objectContaining({ id: sourceId })] }), expect.objectContaining({ kind: 'overdue-task', evidence: [expect.objectContaining({ id: overdueId })] })]));
    expect(JSON.stringify(snapshot)).not.toContain('foreign tenant secret');
    expect(snapshot.observationCount).toBe(0); expect(f.db.count('adaptive_settings', 'adaptive-a')).toBe(0); expect(f.db.count('audit_events', 'adaptive-a')).toBe(0); expect(fetcher).not.toHaveBeenCalled();
  });

  it('surfaces the next active signals after all five highest-ranked suggestions are dismissed', async () => {
    const f = fixture();
    for (let index = 0; index < 5; index++) record(f.db);
    const nextIds = [source(f.db), source(f.db), source(f.db), source(f.db), source(f.db)];
    const initial = await f.read(); expect(initial.settings.digestSize).toBe(5); expect(initial.signals.every((item) => item.kind === 'overdue-task')).toBe(true);
    for (const signal of initial.signals) await f.write({ action: 'feedback', signalId: signal.id, fingerprint: signal.fingerprint, value: 'dismissed' });
    const snapshot = await f.read();
    const active = snapshot.signals.filter((item) => ['new', 'useful'].includes(item.state));
    expect(active).toHaveLength(5); expect(active.every((item) => item.kind === 'commitment' && nextIds.includes(item.evidence[0].id))).toBe(true);
    expect(snapshot.signals.filter((item) => item.state === 'dismissed')).toHaveLength(5);
    expect(snapshot.metrics.activeSignals).toBe(5);
  });

  it.each(['auditor', 'agent'] as const)('permits private reads but denies %s feed writes and exports', async (role) => {
    const f = fixture(role); const id = source(f.db); const snapshot = await f.read();
    expect(snapshot.canWrite).toBe(false);
    await expect(f.write({ action: 'feedback', signalId: `commitment:${id}:0`, fingerprint: snapshot.signals[0].fingerprint, value: 'useful' })).rejects.toMatchObject({ status: 403 });
    await expect(exportAdaptive(f.db.d1(), f.context, f.identity)).rejects.toMatchObject({ status: 403 });
    expect(f.db.count('adaptive_receipts', 'adaptive-a')).toBe(0);
  });

  it('requires management permission for settings, packs and forgetting', async () => {
    const f = fixture('member');
    await expect(f.settings({ learningEnabled: true })).rejects.toMatchObject({ status: 403 });
    await expect(f.write({ action: 'learning.forget', expectedRevision: 0, confirm: 'FORGET' })).rejects.toMatchObject({ status: 403 });
    await expect(f.write({ action: 'pack.set', id: adaptivePackCatalog[0].id, version: '1.0.0', enabled: false, expectedRevision: 0 })).rejects.toMatchObject({ status: 403 });
  });

  it('stores explicit feedback but learns only with consent and three distinct signals', async () => {
    const f = fixture(); source(f.db); source(f.db); source(f.db);
    const initial = await f.read();
    await f.write({ action: 'feedback', signalId: initial.signals[0].id, fingerprint: initial.signals[0].fingerprint, value: 'useful' });
    expect(f.db.count('adaptive_observations', 'adaptive-a')).toBe(0);
    await f.settings({ learningEnabled: true, autoAdapt: true });
    for (const [index, signal] of initial.signals.entries()) {
      await f.write({ action: 'feedback', signalId: signal.id, fingerprint: signal.fingerprint, value: 'useful' });
      const snapshot = await f.read();
      expect(snapshot.learning.find((item) => item.topic === 'relationships')?.status).toBe(index < 2 ? 'learning' : 'applied');
    }
    const snapshot = await f.read(); expect(snapshot.observationCount).toBe(3);
    const feedbackRows = f.db.sqlite.prepare('SELECT * FROM adaptive_feedback').all();
    const memoryRows = f.db.sqlite.prepare('SELECT * FROM adaptive_observations').all();
    expect(JSON.stringify([feedbackRows, memoryRows])).not.toContain('synthetic launch outline');
  });

  it('deduplicates observations, excludes expired memory, and honors pinned timing', async () => {
    const f = fixture(); source(f.db); await f.settings({ learningEnabled: true, autoAdapt: true, followUpPinned: true, followUpDays: 9 });
    const signal = (await f.read()).signals[0];
    for (let i = 0; i < 4; i++) await f.write({ action: 'feedback', signalId: signal.id, fingerprint: signal.fingerprint, value: 'useful' });
    expect(f.db.count('adaptive_observations', 'adaptive-a')).toBe(1);
    f.db.sqlite.prepare("UPDATE adaptive_observations SET observed_at='2026-08-01T00:00:00.000Z'").run();
    const snapshot = await f.read();
    expect(snapshot.learning.find((item) => item.topic === 'relationships')?.status).toBe('learning');
    expect(snapshot.effectiveFollowUpDays).toBe(9);
  });

  it('pauses observations, scans and assisted tasks while private reading continues', async () => {
    const f = fixture(); source(f.db); await f.settings({ learningEnabled: true, autoAdapt: true, paused: true, watchEnabled: true, watchProjects: ['twenty'] });
    const signal = (await f.read()).signals[0]; const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await f.write({ action: 'feedback', signalId: signal.id, fingerprint: signal.fingerprint, value: 'useful' });
    await expect(f.write(followup(signal))).rejects.toMatchObject({ status: 409 });
    await f.write({ action: 'refresh' });
    expect(fetcher).not.toHaveBeenCalled(); expect(f.db.count('adaptive_observations', 'adaptive-a')).toBe(0);
    expect((await f.read()).refresh.scanStatus).toBe('paused');
  });

  it('invalidates saved feedback and rejects actions after source edits or deletion', async () => {
    const f = fixture(); const sourceId = source(f.db); const signal = (await f.read()).signals[0];
    await f.write({ action: 'feedback', signalId: signal.id, fingerprint: signal.fingerprint, value: 'dismissed' });
    f.db.sqlite.prepare('UPDATE brain_sources SET body=?,version=version+1 WHERE workspace_id=? AND id=?').run('I will prepare the changed synthetic plan.', 'adaptive-a', sourceId);
    const updated = (await f.read()).signals.find((item) => item.id === signal.id)!;
    expect(updated.state).toBe('new'); expect(updated.fingerprint).not.toBe(signal.fingerprint);
    await expect(f.write(followup(signal))).rejects.toMatchObject({ status: 409 });
    await expect(f.write({ action: 'feedback', signalId: signal.id, fingerprint: signal.fingerprint, value: 'useful' })).rejects.toMatchObject({ status: 409 });
    f.db.sqlite.prepare('DELETE FROM brain_sources WHERE workspace_id=? AND id=?').run('adaptive-a', sourceId);
    expect((await f.read()).signals).toHaveLength(0);
    const exported = JSON.stringify(await exportAdaptive(f.db.d1(), f.context, f.identity));
    expect(exported).not.toContain('synthetic launch outline'); expect(exported).not.toContain('changed synthetic plan');
  });

  it('creates one real follow-up with provenance and returns safe replay results', async () => {
    const f = fixture(); source(f.db); await f.settings({ learningEnabled: true });
    const signal = (await f.read()).signals[0]; const payload = followup(signal, { operationId: crypto.randomUUID() });
    const first = await f.write(payload); const again = await f.write(payload);
    expect(again).toEqual(first);
    const rows = f.db.sqlite.prepare("SELECT * FROM records WHERE workspace_id='adaptive-a' AND object_type='task'").all();
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ name: payload.title, due_at: payload.dueAt });
    expect(JSON.stringify(rows[0])).toContain(signal.id);
    expect(f.db.count('adaptive_observations', 'adaptive-a')).toBe(1);
    await expect(f.write({ ...payload, title: 'Changed retry title' })).rejects.toMatchObject({ status: 409 });
    await expect(f.write(followup(signal))).rejects.toMatchObject({ status: 409 });
    expect(f.db.count('records', 'adaptive-a')).toBe(1);
    const receipts = JSON.stringify(f.db.sqlite.prepare('SELECT result_json FROM adaptive_receipts').all());
    expect(receipts).not.toContain(payload.title); expect(receipts).not.toContain('synthetic launch outline');
  });

  it('atomically rejects a follow-up when source version changes between read and commit', async () => {
    const f = fixture(); const id = source(f.db); const signal = (await f.read()).signals[0];
    f.db.beforeNextBatch = () => { f.db.sqlite.prepare('UPDATE brain_sources SET version=version+1 WHERE workspace_id=? AND id=?').run('adaptive-a', id); };
    await expect(f.write(followup(signal))).rejects.toMatchObject({ status: 409 });
    expect(f.db.count('records', 'adaptive-a')).toBe(0); expect(f.db.count('adaptive_receipts', 'adaptive-a')).toBe(0); expect(f.db.count('audit_events', 'adaptive-a')).toBe(0);
  });

  it('links accepted activity follow-ups to the current record and fences record-version races', async () => {
    const f = fixture(); const activityId = record(f.db, 'adaptive-a', 'activity', 'scheduled', '2026-09-10T12:00:00.000Z');
    let signal = (await f.read()).signals[0]; expect(signal.kind).toBe('upcoming-activity');
    f.db.beforeNextBatch = () => { f.db.sqlite.prepare('UPDATE records SET version=version+1 WHERE workspace_id=? AND id=?').run('adaptive-a', activityId); };
    await expect(f.write(followup(signal))).rejects.toMatchObject({ status: 409 }); expect(f.db.count('records', 'adaptive-a')).toBe(1);
    signal = (await f.read()).signals[0]; const result = await f.write(followup(signal)) as { recordId: string };
    expect(f.db.sqlite.prepare("SELECT source_id,target_id,relationship FROM record_links WHERE workspace_id='adaptive-a'").all()).toEqual([{ source_id: activityId, target_id: result.recordId, relationship: 'follow_up' }]);
  });

  it('atomically rejects stale settings revisions and a reset racing with an assisted task', async () => {
    const f = fixture(); source(f.db); await f.settings();
    const snapshot = await f.read();
    await expect(f.settings({ expectedRevision: 0 })).rejects.toMatchObject({ status: 409 });
    const before = f.db.count('adaptive_receipts', 'adaptive-a');
    f.db.beforeNextBatch = () => advanceEpoch(f.db, 'adaptive-a');
    await expect(f.write(followup(snapshot.signals[0]))).rejects.toMatchObject({ status: 409 });
    expect(f.db.count('records', 'adaptive-a')).toBe(0); expect(f.db.count('adaptive_receipts', 'adaptive-a')).toBe(before);
  });

  it('forgets learned observations with explicit confirmation and preserves created tasks', async () => {
    const f = fixture(); source(f.db); await f.settings({ learningEnabled: true, autoAdapt: true });
    const signal = (await f.read()).signals[0]; await f.write(followup(signal));
    const snapshot = await f.read();
    await expect(f.write({ action: 'learning.forget', expectedRevision: snapshot.settings.revision, confirm: 'yes' })).rejects.toMatchObject({ status: 400 });
    await f.write({ action: 'learning.forget', expectedRevision: snapshot.settings.revision, confirm: 'FORGET' });
    expect(f.db.count('adaptive_observations', 'adaptive-a')).toBe(0); expect(f.db.count('records', 'adaptive-a')).toBe(1);
    expect((await f.read()).learning.every((item) => item.status === 'learning')).toBe(true);
  });

  it('activates only reviewed packs and rolls their real feed effect back', async () => {
    const f = fixture(); source(f.db); const pack = adaptivePackCatalog.find((item) => item.id === 'commitment-review')!;
    let snapshot = await f.read(); expect(snapshot.signals.some((item) => item.kind === 'commitment')).toBe(true);
    await expect(f.write({ action: 'pack.set', id: 'download-untrusted-code', version: '1.0.0', enabled: true, expectedRevision: snapshot.settings.revision })).rejects.toMatchObject({ status: 400 });
    await f.write({ action: 'pack.set', id: pack.id, version: pack.version, enabled: false, expectedRevision: snapshot.settings.revision });
    snapshot = await f.read(); expect(snapshot.signals.some((item) => item.kind === 'commitment')).toBe(false);
    await f.write({ action: 'pack.rollback', id: pack.id, expectedRevision: snapshot.settings.revision });
    snapshot = await f.read(); expect(snapshot.signals.some((item) => item.kind === 'commitment')).toBe(true);
  });

  it('exports private portable state with an audited receipt and no cross-tenant content', async () => {
    const f = fixture(); source(f.db); await f.settings({ goals: 'Synthetic owner goal' });
    const foreign = tenant(f.db, 'adaptive-b'); source(f.db, foreign.workspaceId, 'I will retain the other tenant secret.');
    const exported = JSON.stringify(await exportAdaptive(f.db.d1(), f.context, f.identity));
    expect(exported).toContain('Synthetic owner goal'); expect(exported).not.toContain('other tenant secret');
    expect(f.db.sqlite.prepare("SELECT count(*) count FROM audit_events WHERE workspace_id='adaptive-a' AND action LIKE '%export%'").get()).toMatchObject({ count: 1 });
  });

  it('requires explicit scan opt-in, limits refresh frequency, and keeps private goals out of scout inputs', async () => {
    const f = fixture(); const release = announcement(); const scan = vi.spyOn(scout, 'fetchCapabilityReleases').mockResolvedValue({ releases: [release], errors: [] });
    expect(await f.write({ action: 'refresh' })).toMatchObject({ refreshed: false }); expect(scan).not.toHaveBeenCalled();
    await f.settings({ watchEnabled: true, watchProjects: ['twenty'], focus: 'sales', goals: 'Synthetic private sales goal' });
    const operationId = crypto.randomUUID();
    expect(await f.write({ action: 'refresh', operationId })).toMatchObject({ refreshed: true });
    expect(scan).toHaveBeenCalledExactlyOnceWith(['twenty'], undefined);
    let snapshot = await f.read();
    expect(snapshot.releases).toHaveLength(1); expect(snapshot.signals[0]).toMatchObject({ kind: 'release', certainty: 'vendor-announcement', topic: 'sales' });
    expect(snapshot.signals[0].why).toContain('focus'); expect(snapshot.refresh.scanStatus).toBe('waiting');
    // Published and fetched timestamps intentionally differ, as they do for real releases.
    await f.write({ action: 'feedback', signalId: snapshot.signals[0].id, fingerprint: snapshot.signals[0].fingerprint, value: 'useful' });
    expect(await f.write({ action: 'refresh', operationId })).toMatchObject({ refreshed: true });
    expect(await f.write({ action: 'refresh' })).toMatchObject({ refreshed: false }); expect(scan).toHaveBeenCalledTimes(1);
    await f.settings({ watchEnabled: false }); snapshot = await f.read();
    expect(snapshot.signals.some((item) => item.kind === 'release')).toBe(false);
  });

  it('creates local idempotent proposals, preserves active proposal sources and retains inventory during provider errors', async () => {
    const f = fixture(); const release = announcement(); const scan = vi.spyOn(scout, 'fetchCapabilityReleases').mockResolvedValue({ releases: [release], errors: [] });
    await f.settings({ watchEnabled: true, watchProjects: ['twenty'] }); await f.write({ action: 'refresh' });
    const created = await f.write({ action: 'proposal.create', releaseId: release.id }) as { proposalId: string };
    expect(await f.write({ action: 'proposal.create', releaseId: release.id })).toEqual(created);
    expect(f.db.count('adaptive_proposals', 'adaptive-a')).toBe(1); expect(f.db.count('records', 'adaptive-a')).toBe(0);
    expect((await f.read()).proposals[0].problem).toContain('local proposal');
    vi.setSystemTime(new Date('2026-09-09T19:00:00.000Z')); scan.mockResolvedValueOnce({ releases: [], errors: [{ projectId: 'twenty', code: 'unavailable' }] });
    await f.write({ action: 'refresh' }); let snapshot = await f.read();
    expect(snapshot.releases).toHaveLength(1); expect(snapshot.settings.lastScanError).toContain('unavailable'); expect(snapshot.refresh.nextScanAt).toBe('2026-09-09T19:15:00.000Z');
    vi.setSystemTime(new Date('2026-09-10T02:00:00.000Z')); scan.mockResolvedValueOnce({ releases: [], errors: [] });
    await f.write({ action: 'refresh' }); expect((await f.read()).releases).toHaveLength(1);
    await f.write({ action: 'proposal.dismiss', id: created.proposalId });
    vi.setSystemTime(new Date('2026-09-10T09:00:00.000Z')); scan.mockResolvedValueOnce({ releases: [], errors: [] });
    await f.write({ action: 'refresh' }); snapshot = await f.read();
    expect(snapshot.releases).toHaveLength(0); expect(snapshot.proposals).toHaveLength(0);
  });

  it('rejects foreign release proposals and unknown operations without storing caller evidence', async () => {
    const f = fixture(); source(f.db); const other = tenant(f.db, 'adaptive-b');
    f.db.sqlite.prepare('INSERT INTO adaptive_settings (workspace_id,updated_at) VALUES (?,?)').run(other.workspaceId, now);
    f.db.sqlite.prepare('INSERT INTO adaptive_releases (workspace_id,id,project_id,title,version,body,url,published_at,fetched_at) VALUES (?,?,?,?,?,?,?,?,?)').run(other.workspaceId, 'foreign-release', 'twenty', 'Synthetic foreign release', 'v1', 'Synthetic foreign announcement', announcement().url, now, now);
    await expect(f.write({ action: 'proposal.create', releaseId: 'foreign-release' })).rejects.toMatchObject({ status: 404 });
    await expect(f.write({ action: 'execute.downloaded.code', script: 'untrusted content' })).rejects.toMatchObject({ status: 400 });
    const signal = (await f.read()).signals[0];
    await f.write({ action: 'feedback', signalId: signal.id, fingerprint: signal.fingerprint, value: 'useful', workspaceId: other.workspaceId, topic: 'sensitive-trait', evidence: [{ title: 'Untrusted fake evidence', body: 'Caller supplied private text' }] });
    expect(f.db.count('adaptive_feedback', 'adaptive-a')).toBe(1); expect(f.db.count('adaptive_feedback', 'adaptive-b')).toBe(0);
    expect(JSON.stringify(f.db.sqlite.prepare('SELECT * FROM adaptive_feedback').all())).not.toContain('Caller supplied');
  });

  it('adapts unpinned follow-up timing only after three separately accepted tasks', async () => {
    const f = fixture(); source(f.db); source(f.db); source(f.db); await f.settings({ learningEnabled: true, autoAdapt: true });
    const signals = (await f.read()).signals;
    for (const [index, signal] of signals.entries()) {
      await f.write(followup(signal, { followUpDays: 7, dueAt: '2026-09-16T12:00:00.000Z' }));
      expect((await f.read()).effectiveFollowUpDays).toBe(index < 2 ? 3 : 7);
    }
    await f.settings({ followUpPinned: true, followUpDays: 11 }); expect((await f.read()).effectiveFollowUpDays).toBe(11);
  });

  it('rolls back the complete task, consent row and receipt when append-only audit insertion fails', async () => {
    const f = fixture(); source(f.db); const signal = (await f.read()).signals[0];
    f.db.sqlite.exec("CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON audit_events WHEN NEW.action='adaptive.followup.create' BEGIN SELECT RAISE(ABORT,'synthetic audit unavailable'); END;");
    await expect(f.write(followup(signal))).rejects.toThrow('synthetic audit unavailable');
    for (const table of ['records', 'adaptive_settings', 'adaptive_feedback', 'adaptive_receipts', 'audit_events']) expect(f.db.count(table, 'adaptive-a')).toBe(0);
  });

  it('rejects a policy revision change during task creation and reset-era replays', async () => {
    const f = fixture(); source(f.db); await f.settings({ learningEnabled: true }); const signal = (await f.read()).signals[0];
    f.db.beforeNextBatch = () => { f.db.sqlite.prepare("UPDATE adaptive_settings SET paused=1,revision=revision+1 WHERE workspace_id='adaptive-a'").run(); };
    await expect(f.write(followup(signal))).rejects.toMatchObject({ status: 409 }); expect(f.db.count('records', 'adaptive-a')).toBe(0);
    await f.settings({ paused: false }); const payload = followup((await f.read()).signals[0], { operationId: crypto.randomUUID() }); await f.write(payload);
    advanceEpoch(f.db, 'adaptive-a'); f.db.sqlite.prepare("DELETE FROM adaptive_settings WHERE workspace_id='adaptive-a'").run();
    await expect(f.write(payload)).rejects.toMatchObject({ status: 409, code: 'adaptive_result_reset' });
    expect(f.db.count('records', 'adaptive-a')).toBe(1); expect((await f.read()).settings.learningEnabled).toBe(false);
  });

  it('refuses to replay a removed task or bypass duplicate creation by changing feedback', async () => {
    const f = fixture(); source(f.db); const signal = (await f.read()).signals[0]; const payload = followup(signal, { operationId: crypto.randomUUID() });
    await f.write(payload);
    await expect(f.write({ action: 'feedback', signalId: signal.id, fingerprint: signal.fingerprint, value: 'new' })).rejects.toMatchObject({ status: 409 });
    f.db.sqlite.prepare("UPDATE records SET archived_at=? WHERE workspace_id='adaptive-a' AND object_type='task'").run(now);
    await expect(f.write(payload)).rejects.toMatchObject({ status: 410, code: 'adaptive_result_removed' });
    expect(f.db.count('records', 'adaptive-a')).toBe(1);
  });

  it('does not lose task deduplication when bounded feedback retention removes an actioned row', async () => {
    const f = fixture(); source(f.db); const signal = (await f.read()).signals[0];
    await f.write(followup(signal));
    // The feedback retention prune can remove any old row after 1000 signals.
    f.db.sqlite.prepare('DELETE FROM adaptive_feedback WHERE workspace_id=? AND signal_id=?').run('adaptive-a', signal.id);
    await expect(f.write(followup(signal))).rejects.toMatchObject({ status: 409 });
    expect(f.db.count('records', 'adaptive-a')).toBe(1);
  });

  it('never restores forgotten learning through an old settings or feedback retry, including after reset', async () => {
    const f = fixture(); source(f.db); source(f.db); source(f.db);
    const settingsPayload = { action: 'settings.update', operationId: crypto.randomUUID(), ...editableAdaptiveSettings((await f.read()).settings), expectedRevision: 0, learningEnabled: true, autoAdapt: true, goals: 'Synthetic goal forgotten by reset' };
    await f.write(settingsPayload);
    const priorFeedback = [];
    for (const signal of (await f.read()).signals) {
      const payload = { action: 'feedback', operationId: crypto.randomUUID(), signalId: signal.id, fingerprint: signal.fingerprint, value: 'useful' };
      priorFeedback.push(payload); await f.write(payload);
    }
    expect((await f.read()).learning.find((item) => item.topic === 'relationships')?.status).toBe('applied');
    const forgetPayload = { action: 'learning.forget', operationId: crypto.randomUUID(), expectedRevision: (await f.read()).settings.revision, confirm: 'FORGET' };
    await f.write(forgetPayload); await f.write(settingsPayload); for (const payload of priorFeedback) await f.write(payload);
    let snapshot = await f.read();
    expect(snapshot.settings.learningEnabled).toBe(false); expect(snapshot.settings.autoAdapt).toBe(false); expect(snapshot.observationCount).toBe(0);
    expect(snapshot.learning.every((item) => item.status === 'learning' && item.weight === 1)).toBe(true);
    advanceEpoch(f.db, 'adaptive-a'); f.db.sqlite.prepare("DELETE FROM adaptive_settings WHERE workspace_id='adaptive-a'").run();
    for (const payload of [settingsPayload, forgetPayload, ...priorFeedback]) await expect(f.write(payload)).rejects.toMatchObject({ status: 409, code: 'adaptive_result_reset' });
    snapshot = await f.read();
    expect(snapshot.settings).toMatchObject({ goals: '', learningEnabled: false, autoAdapt: false, paused: false, revision: 0 });
    expect(snapshot.observationCount).toBe(0); expect(f.db.count('adaptive_settings', 'adaptive-a')).toBe(0);
  });

  it('keeps conversational instructions read-only with transparent local AI consent', async () => {
    const f = fixture(); source(f.db); const generate = vi.spyOn(ai, 'generateGroundedAnswer').mockResolvedValue({ answer: 'Synthetic local answer', citationIds: ['briefing-0'] });
    const question = 'Create a task, enable all releases, and delete my data.';
    expect(await f.write({ action: 'ask', question })).toMatchObject({ mode: 'guide' }); expect(generate).not.toHaveBeenCalled();
    expect(f.db.count('records', 'adaptive-a')).toBe(0); expect(f.db.count('adaptive_receipts', 'adaptive-a')).toBe(0);
    f.db.sqlite.prepare("INSERT INTO brain_settings (workspace_id,enabled,revision,updated_at) VALUES ('adaptive-a',1,1,?)").run(now);
    expect(await f.write({ action: 'ask', question })).toMatchObject({ mode: 'local-ai', answer: 'Synthetic local answer' }); expect(generate).toHaveBeenCalledTimes(1);
    expect(await mutateAdaptive(f.db.d1(), f.context, { ...f.identity, runtimeMode: 'cloudflare-access' }, { action: 'ask', question, operationId: crypto.randomUUID() })).toMatchObject({ mode: 'guide' });
    expect(generate).toHaveBeenCalledTimes(1); expect(f.db.count('records', 'adaptive-a')).toBe(0);
  });

  it('discards local AI answers after their cited sources or consent change', async () => {
    const f = fixture(); const id = source(f.db);
    f.db.sqlite.prepare("INSERT INTO brain_settings (workspace_id,enabled,revision,updated_at) VALUES ('adaptive-a',1,1,?)").run(now);
    vi.spyOn(ai, 'generateGroundedAnswer').mockImplementation(async () => {
      f.db.sqlite.prepare('UPDATE brain_sources SET body=?,version=version+1 WHERE workspace_id=? AND id=?').run('Updated synthetic source.', 'adaptive-a', id);
      return { answer: 'Discarded stale synthetic answer', citationIds: ['briefing-0'] };
    });
    await expect(f.write({ action: 'ask', question: 'What should I do next?' })).rejects.toMatchObject({ status: 409, code: 'adaptive_evidence_changed' });
    expect(f.db.count('adaptive_receipts', 'adaptive-a')).toBe(0);
  });

  it('rejects calendar-invalid and timezone-ambiguous task due dates', async () => {
    const f = fixture(); source(f.db); const signal = (await f.read()).signals[0];
    await expect(f.write(followup(signal, { dueAt: '2027-02-30T12:00:00.000Z' }))).rejects.toMatchObject({ status: 400 });
    await expect(f.write(followup(signal, { dueAt: '2026-09-12T12:00:00' }))).rejects.toMatchObject({ status: 400 });
    expect(f.db.count('records', 'adaptive-a')).toBe(0);
  });

  it('discards an in-flight scan if consent is revoked before commit', async () => {
    const f = fixture(); await f.settings({ watchEnabled: true, watchProjects: ['twenty'] });
    const beforeReceipts = f.db.count('adaptive_receipts', 'adaptive-a');
    vi.spyOn(scout, 'fetchCapabilityReleases').mockImplementation(async () => {
      f.db.sqlite.prepare("UPDATE adaptive_settings SET watch_enabled=0,revision=revision+1 WHERE workspace_id='adaptive-a'").run();
      return { releases: [announcement()], errors: [] };
    });
    await expect(f.write({ action: 'refresh' })).rejects.toMatchObject({ status: 409 });
    expect(f.db.count('adaptive_releases', 'adaptive-a')).toBe(0); expect(f.db.count('adaptive_receipts', 'adaptive-a')).toBe(beforeReceipts);
    expect((await f.read()).settings.watchEnabled).toBe(false);
  });

  it('excludes expired or future observations from portable exports', async () => {
    const f = fixture(); await f.settings({ learningEnabled: true });
    for (const [label, observedAt] of [['expired', '2026-08-01T00:00:00.000Z'], ['future', '2026-09-10T00:00:00.000Z'], ['current', now]]) {
      f.db.sqlite.prepare("INSERT INTO adaptive_observations (workspace_id,id,signal_id,topic,outcome,observed_at) VALUES ('adaptive-a',?,?,'relationships','useful',?)").run(crypto.randomUUID(), `synthetic-${label}`, observedAt);
    }
    const exported = await exportAdaptive(f.db.d1(), f.context, f.identity) as unknown as { observations: { signal_id: string }[] };
    expect(exported.observations.map((item) => item.signal_id)).toEqual(['synthetic-current']);
  });

  it('discards a local answer when AI consent is disabled and re-enabled during inference', async () => {
    const f = fixture(); source(f.db);
    f.db.sqlite.prepare("INSERT INTO brain_settings (workspace_id,enabled,revision,updated_at) VALUES ('adaptive-a',1,1,?)").run(now);
    vi.spyOn(ai, 'generateGroundedAnswer').mockImplementation(async () => {
      f.db.sqlite.prepare("UPDATE brain_settings SET enabled=0,revision=revision+1 WHERE workspace_id='adaptive-a'").run();
      f.db.sqlite.prepare("UPDATE brain_settings SET enabled=1,revision=revision+1 WHERE workspace_id='adaptive-a'").run();
      return { answer: 'Discarded answer generated across a consent change', citationIds: ['briefing-0'] };
    });
    await expect(f.write({ action: 'ask', question: 'What should I review?' })).rejects.toMatchObject({ status: 409 });
  });

  it('discards a local answer when a workspace reset completes during inference', async () => {
    const f = fixture(); source(f.db);
    f.db.sqlite.prepare("INSERT INTO brain_settings (workspace_id,enabled,revision,updated_at) VALUES ('adaptive-a',1,1,?)").run(now);
    vi.spyOn(ai, 'generateGroundedAnswer').mockImplementation(async () => {
      advanceEpoch(f.db, 'adaptive-a');
      return { answer: 'Discarded answer from the previous workspace epoch', citationIds: ['briefing-0'] };
    });
    await expect(f.write({ action: 'ask', question: 'What should I review?' })).rejects.toMatchObject({ status: 409 });
  });
});
