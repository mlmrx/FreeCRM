import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportBrain, mutateBrain, readBrainConversation, readBrainSnapshot, readBrainSource, searchBrain } from '@/server/brain';
import * as ai from '@/server/brain-ai';
import type { WorkspaceContext } from '@/server/control-plane';
import type { RequestIdentity } from '@/server/request-context';
import type { BrainSource } from '@/lib/brain-types';

class Statement {
  constructor(readonly sqlite: DatabaseSync, readonly sql: string, readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new Statement(this.sqlite, this.sql, values); }
  params() { return this.values.map((value) => value instanceof ArrayBuffer ? new Uint8Array(value) : value) as SQLInputValue[]; }
  async first<T>() { return (this.sqlite.prepare(this.sql).get(...this.params()) as T | undefined) ?? null; }
  async all<T>() { return { success: true, results: this.sqlite.prepare(this.sql).all(...this.params()) as T[], meta: { changes: 0 } }; }
  async run<T>() {
    // All read batches in this service use SELECT. Avoid columns(), which needs
    // Node 22.16 while the supported CI runtime starts at Node 22.13.
    if (/^\s*SELECT\b/i.test(this.sql)) return this.all<T>();
    const statement = this.sqlite.prepare(this.sql);
    const result = statement.run(...this.params());
    return { success: true, results: [] as T[], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

class TestDatabase {
  readonly sqlite = new DatabaseSync(':memory:');
  beforeNextBatch: (() => void) | undefined;
  constructor(throughMigration = Number.POSITIVE_INFINITY) {
    this.sqlite.exec('PRAGMA foreign_keys=ON');
    const directory = new URL('../drizzle/', import.meta.url);
    for (const name of readdirSync(directory).filter((name) => /^\d{4}_.+\.sql$/.test(name) && Number.parseInt(name.slice(0, 4), 10) <= throughMigration).sort()) {
      for (const statement of readFileSync(new URL(name, directory), 'utf8').split('--> statement-breakpoint')) {
        if (statement.trim()) this.sqlite.exec(statement);
      }
    }
  }
  prepare(sql: string) { return new Statement(this.sqlite, sql); }
  async batch<T>(statements: D1PreparedStatement[]) {
    const before = this.beforeNextBatch;
    this.beforeNextBatch = undefined;
    before?.();
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements as unknown as Statement[]) results.push(await statement.run<T>());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  d1() { return this as unknown as D1Database; }
  count(table: string, workspaceId: string) {
    return Number((this.sqlite.prepare(`SELECT count(*) count FROM ${table} WHERE workspace_id=?`).get(workspaceId) as { count: number }).count);
  }
}

const open: TestDatabase[] = [];
const now = '2026-09-09T12:00:00.000Z';
const embeddingIdentity = `embeddinggemma@${'a'.repeat(64)}`;

function fixture(role: WorkspaceContext['workspace']['role'] = 'owner') {
  const db = new TestDatabase();
  open.push(db);
  const identity: RequestIdentity = { userId: 'brain-owner', email: 'brain-owner@example.test', displayName: 'Synthetic owner', requestId: 'brain-test', runtimeMode: 'device' };
  const context = tenant(db, 'workspace-a', role);
  return { db, identity, context, write: (body: Record<string, unknown>, signal?: AbortSignal) => mutateBrain(db.d1(), context, identity, body, signal) };
}

function tenant(db: TestDatabase, workspaceId: string, role: WorkspaceContext['workspace']['role'] = 'owner'): WorkspaceContext {
  db.sqlite.prepare("INSERT INTO workspaces (id,owner_user_id,owner_email,owner_name,name,profile,timezone,currency,locale,settings_json,created_at,updated_at) VALUES (?,?,?,'Synthetic owner',?,'personal','UTC','USD','en-US','{}',?,?)")
    .run(workspaceId, `owner-${workspaceId}`, `${workspaceId}@example.test`, workspaceId, now, now);
  return { workspaceId, workspace: { id: workspaceId, name: workspaceId, ownerEmail: `${workspaceId}@example.test`, ownerName: 'Synthetic owner', role, profile: 'personal', timezone: 'UTC', currency: 'USD', locale: 'en-US', settings: {}, createdAt: now, updatedAt: now } };
}

function record(db: TestDatabase, workspaceId: string, id = crypto.randomUUID()) {
  db.sqlite.prepare("INSERT INTO records (id,workspace_id,object_type,name,owner_user_id) VALUES (?,?,'contact','Synthetic contact','brain-owner')").run(id, workspaceId);
  return id;
}

function capture(overrides: Record<string, unknown> = {}) {
  return { action: 'source.save', operationId: crypto.randomUUID(), id: crypto.randomUUID(), title: 'Launch notes', body: 'The synthetic Aurora launch is on Tuesday. Rowan owns follow-up.', kind: 'note', sourceUrl: null, tags: ['launch'], pinned: false, recordIds: [], relatedSourceIds: [], ...overrides };
}

async function thread(write: (body: Record<string, unknown>) => Promise<unknown>) {
  const id = crypto.randomUUID();
  await write({ action: 'conversation.create', operationId: crypto.randomUUID(), id, title: 'Launch questions' });
  return id;
}

function ask(conversationId: string, overrides: Record<string, unknown> = {}) {
  return { action: 'ask', operationId: crypto.randomUUID(), conversationId, question: 'When is the Aurora launch?', mode: 'search', ...overrides };
}

/** Advance through the real reset epoch guard, then complete maintenance before the stale write resumes. */
function advanceEpoch(db: TestDatabase, workspaceId: string) {
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const lease = crypto.randomUUID();
  db.sqlite.prepare("INSERT INTO workspace_maintenance_sessions (workspace_id,purpose,token,mode,operation_id,status,lease_token,lease_expires_at) VALUES (?,'reset',?,'clean',?,'running',?,'2099-01-01T00:00:00.000Z')").run(workspaceId, token, id, lease);
  db.sqlite.prepare("INSERT INTO workspace_reset_operations (workspace_id,operation_id,mode,token,lease_token,status) VALUES (?,?,'clean',?,?,'running')").run(workspaceId, id, token, lease);
  db.sqlite.prepare('UPDATE workspaces SET mutation_epoch=mutation_epoch+1 WHERE id=?').run(workspaceId);
  db.sqlite.prepare("UPDATE workspace_reset_operations SET status='completed',response_json='{}' WHERE workspace_id=? AND operation_id=?").run(workspaceId, id);
  db.sqlite.prepare("UPDATE workspace_maintenance_sessions SET status='completed',response_json='{}',lease_token=NULL,lease_expires_at=NULL WHERE workspace_id=? AND purpose='reset'").run(workspaceId);
}

beforeEach(() => {
  vi.spyOn(ai, 'embeddingModelIdentity').mockResolvedValue(embeddingIdentity);
  vi.spyOn(ai, 'embedTexts').mockImplementation(async (_config, texts) => texts.map(() => [1, 0, 0]));
  vi.spyOn(ai, 'generateGroundedAnswer').mockImplementation(async (_config, _question, passages) => ({ answer: 'The launch is on Tuesday.', citationIds: passages.map((p) => p.id) }));
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const db of open.splice(0)) db.sqlite.close();
});

describe('second brain real SQLite persistence', () => {
  it('upgrades existing conversations additively and bounds dependency JSON without dropping protection triggers', () => {
    const db = new TestDatabase(17);
    open.push(db);
    const context = tenant(db, 'upgrade-workspace');
    const conversationId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    db.sqlite.prepare("INSERT INTO brain_conversations (workspace_id,id,title) VALUES (?,?,'Existing conversation')").run(context.workspaceId, conversationId);
    db.sqlite.prepare("INSERT INTO brain_messages (workspace_id,id,conversation_id,role,content,mode,created_at) VALUES (?,?,?,'assistant','Existing answer','search',?)").run(context.workspaceId, messageId, conversationId, now);
    for (const statement of readFileSync(new URL('../drizzle/0018_brain_context_dependencies.sql', import.meta.url), 'utf8').split('--> statement-breakpoint')) {
      if (statement.trim()) db.sqlite.exec(statement);
    }
    expect(db.sqlite.prepare('SELECT content,context_source_ids_json FROM brain_messages WHERE workspace_id=? AND id=?').get(context.workspaceId, messageId)).toEqual({ content: 'Existing answer', context_source_ids_json: '[]' });
    const update = db.sqlite.prepare('UPDATE brain_messages SET context_source_ids_json=? WHERE workspace_id=? AND id=?');
    expect(() => update.run('{}', context.workspaceId, messageId)).toThrow('brain_message_context_sources');
    expect(() => update.run(JSON.stringify(Array.from({ length: 9 }, () => crypto.randomUUID())), context.workspaceId, messageId)).toThrow('brain_message_context_sources');
    expect(() => update.run(JSON.stringify(['x'.repeat(513)]), context.workspaceId, messageId)).toThrow('brain_message_context_sources');
    const triggers = db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='brain_messages'").all().map((row) => row.name);
    expect(triggers).toEqual(expect.arrayContaining(['brain_messages_capacity', 'brain_message_bytes_insert', 'brain_message_bytes_update']));
  });

  it('captures, reloads, updates and links sources to actual CRM records', async () => {
    const { db, context, identity, write } = fixture();
    const linked = capture({ title: 'Related thought' });
    await write(linked);
    const recordId = record(db, context.workspaceId);
    const body = capture({ recordIds: [recordId], relatedSourceIds: [linked.id], sourceUrl: 'https://example.test/reference' });
    const saved = await write(body) as BrainSource;
    expect(saved).toMatchObject({ id: body.id, version: 1, recordIds: [recordId], relatedSourceIds: [linked.id], chunkCount: 1, indexedChunks: 0 });
    expect(await readBrainSource(db.d1(), context.workspaceId, body.id)).toEqual(saved);
    await write({ ...body, operationId: crypto.randomUUID(), expectedVersion: 1, title: 'Updated launch', pinned: true });
    const snapshot = await readBrainSnapshot(db.d1(), context, identity);
    expect(snapshot.sources[0]).toMatchObject({ id: body.id, title: 'Updated launch', pinned: true, version: 2 });
    expect(snapshot.records).toContainEqual({ id: recordId, title: 'Synthetic contact', objectType: 'contact' });
    expect(snapshot.links).toEqual(expect.arrayContaining([{ sourceId: body.id, targetId: linked.id, kind: 'source' }, { sourceId: body.id, targetId: recordId, kind: 'record' }]));
    expect(db.count('audit_events', context.workspaceId)).toBe(3);
    expect(db.count('brain_receipts', context.workspaceId)).toBe(3);
    expect(ai.embedTexts).not.toHaveBeenCalled();
  });

  it('replays an exact operation without duplicating audit, chunks or rows, and rejects changed payloads', async () => {
    const { db, context, write } = fixture();
    const body = capture();
    const original = await write(body);
    expect(await write(body)).toEqual(original);
    expect(db.count('brain_sources', context.workspaceId)).toBe(1);
    expect(db.count('brain_chunks', context.workspaceId)).toBe(1);
    expect(db.count('audit_events', context.workspaceId)).toBe(1);
    await expect(write({ ...body, body: 'A different request' })).rejects.toMatchObject({ status: 409, code: 'idempotency_conflict' });
    expect((await readBrainSource(db.d1(), context.workspaceId, body.id)).body).toBe(body.body);
  });

  it('rolls back stale optimistic writes before chunks, links, audit and receipts change', async () => {
    const { db, context, write } = fixture();
    const body = capture();
    await write(body);
    await write({ ...body, operationId: crypto.randomUUID(), expectedVersion: 1, body: 'Current updated source' });
    const before = await readBrainSource(db.d1(), context.workspaceId, body.id);
    const stale = { ...body, operationId: crypto.randomUUID(), expectedVersion: 1, body: 'Stale overwrite' };
    await expect(write(stale)).rejects.toMatchObject({ status: 409, code: 'brain_write_conflict' });
    expect(await readBrainSource(db.d1(), context.workspaceId, body.id)).toEqual(before);
    expect(db.count('brain_receipts', context.workspaceId)).toBe(2);
    expect(db.count('audit_events', context.workspaceId)).toBe(2);
  });

  it.each(['source', 'record'] as const)('enforces actual foreign keys for cross-workspace %s links and rolls back the new source', async (kind) => {
    const { db, context, identity, write } = fixture();
    const other = tenant(db, 'workspace-b');
    const foreign = capture({ title: 'Private tenant B source' });
    await mutateBrain(db.d1(), other, identity, foreign);
    const foreignRecord = record(db, other.workspaceId);
    const body = capture(kind === 'source' ? { relatedSourceIds: [foreign.id] } : { recordIds: [foreignRecord] });
    await expect(write(body)).rejects.toMatchObject({ status: 409, code: 'brain_link_unavailable' });
    expect(db.count('brain_sources', context.workspaceId)).toBe(0);
    expect(db.count('brain_receipts', context.workspaceId)).toBe(0);
    expect(db.count('audit_events', context.workspaceId)).toBe(0);
    expect(await readBrainSource(db.d1(), other.workspaceId, foreign.id)).toMatchObject({ title: 'Private tenant B source' });
  });

  it('never returns another workspace source, conversation, search result, graph edge or export', async () => {
    const { db, context, identity } = fixture();
    const other = tenant(db, 'workspace-b');
    const foreignWrite = (body: Record<string, unknown>) => mutateBrain(db.d1(), other, identity, body);
    const foreign = capture({ body: 'Tenant B secret canary grapefruit.', title: 'Private tenant B source' });
    await foreignWrite(foreign);
    const conversationId = await thread(foreignWrite);
    await foreignWrite(ask(conversationId, { question: 'grapefruit' }));
    await expect(readBrainSource(db.d1(), context.workspaceId, foreign.id)).rejects.toMatchObject({ status: 404, code: 'source_not_found' });
    await expect(readBrainConversation(db.d1(), context.workspaceId, conversationId)).rejects.toMatchObject({ status: 404, code: 'conversation_not_found' });
    expect(await searchBrain(db.d1(), context.workspaceId, 'grapefruit')).toEqual({ mode: 'keyword', passages: [] });
    const snapshot = await readBrainSnapshot(db.d1(), context, identity);
    expect(snapshot).toMatchObject({ sources: [], links: [], records: [], conversations: [] });
    const exported = await exportBrain(db.d1(), context, identity);
    expect(exported).toMatchObject({ sources: [], links: [], recordLinks: [], conversations: [], messages: [] });
    expect(JSON.stringify(exported)).not.toContain('grapefruit');
  });

  it('persists honest non-AI source-search conversations and replays the same two message ids', async () => {
    const { db, context, write } = fixture();
    const source = capture();
    await write(source);
    const conversationId = await thread(write);
    const request = ask(conversationId);
    const result = await write(request);
    expect(await write(request)).toEqual(result);
    const stored = await readBrainConversation(db.d1(), context.workspaceId, conversationId);
    expect(stored.version).toBe(1);
    expect(stored.messages).toHaveLength(2);
    expect(stored.messages[0]).toMatchObject({ role: 'user', content: request.question, mode: 'question', citations: [] });
    expect(stored.messages[1]).toMatchObject({ role: 'assistant', mode: 'search', citations: [expect.objectContaining({ sourceId: source.id, version: 1, text: source.body })] });
    expect(stored.messages[1].content).toContain('not an AI-generated answer');
    expect(ai.embedTexts).not.toHaveBeenCalled();
    expect(ai.generateGroundedAnswer).not.toHaveBeenCalled();
  });

  it('keeps an unsupported question as a no-evidence answer, not a fabricated source', async () => {
    const { db, context, write } = fixture();
    const conversationId = await thread(write);
    await write(ask(conversationId, { question: 'unseenquestion' }));
    const stored = await readBrainConversation(db.d1(), context.workspaceId, conversationId);
    expect(stored.messages[1]).toMatchObject({ mode: 'search', citations: [] });
    expect(stored.messages[1].content).toContain('No matching sources');
  });

  it.each(['edit', 'delete'] as const)('%s removes citing conversations and their messages but preserves unrelated conversations', async (operation) => {
    const { db, context, write } = fixture();
    const source = capture();
    await write(source);
    const cited = await thread(write);
    const unrelated = await thread(write);
    await write(ask(cited));
    if (operation === 'edit') await write({ ...source, operationId: crypto.randomUUID(), expectedVersion: 1, body: 'Revised material' });
    else await write({ action: 'source.delete', operationId: crypto.randomUUID(), id: source.id, expectedVersion: 1 });
    await expect(readBrainConversation(db.d1(), context.workspaceId, cited)).rejects.toMatchObject({ code: 'conversation_not_found' });
    expect((await readBrainConversation(db.d1(), context.workspaceId, unrelated)).messages).toEqual([]);
    expect(db.count('brain_messages', context.workspaceId)).toBe(0);
    if (operation === 'delete') await expect(readBrainSource(db.d1(), context.workspaceId, source.id)).rejects.toMatchObject({ code: 'source_not_found' });
    else expect((await readBrainSource(db.d1(), context.workspaceId, source.id)).version).toBe(2);
  });

  it.each(['edit', 'delete'] as const)('%s also purges a conversation that consumed a source the model omitted from citations', async (operation) => {
    const { db, context, identity, write } = fixture();
    const citedSource = capture({ title: 'Aurora timing', body: 'The Aurora launch is Tuesday.' });
    const contextOnlySource = capture({ title: 'Aurora private note', body: 'Aurora private follow-up belongs to Rowan.' });
    await write(citedSource);
    await write(contextOnlySource);
    await write({ action: 'settings.update', operationId: crypto.randomUUID(), enabled: true });
    const conversationId = await thread(write);
    vi.mocked(ai.generateGroundedAnswer).mockImplementationOnce(async (_config, _question, passages) => {
      expect(passages.map((passage) => passage.sourceId)).toEqual(expect.arrayContaining([citedSource.id, contextOnlySource.id]));
      return { answer: 'The Aurora launch is Tuesday and Rowan owns follow-up.', citationIds: passages.filter((passage) => passage.sourceId === citedSource.id).map((passage) => passage.id) };
    });
    await write(ask(conversationId, { mode: 'ollama', contextSourceIds: ['caller-cannot-set-dependencies'] }));
    const stored = await readBrainConversation(db.d1(), context.workspaceId, conversationId);
    expect(stored.messages[1].citations.map((citation) => citation.sourceId)).toEqual([citedSource.id]);
    const dependencies = db.sqlite.prepare("SELECT context_source_ids_json ids FROM brain_messages WHERE workspace_id=? AND conversation_id=? AND role='assistant'").get(context.workspaceId, conversationId) as { ids: string };
    expect(JSON.parse(dependencies.ids)).toEqual(expect.arrayContaining([citedSource.id, contextOnlySource.id]));
    expect(JSON.parse(dependencies.ids)).toHaveLength(2);
    const exported = await exportBrain(db.d1(), context, identity);
    expect(exported.messages).toContainEqual(expect.objectContaining({ context_source_ids_json: dependencies.ids }));
    expect(JSON.stringify(exported)).not.toContain('embedding');
    if (operation === 'edit') await write({ ...contextOnlySource, operationId: crypto.randomUUID(), expectedVersion: 1, body: 'An updated note with no old private follow-up.' });
    else await write({ action: 'source.delete', operationId: crypto.randomUUID(), id: contextOnlySource.id, expectedVersion: 1 });
    await expect(readBrainConversation(db.d1(), context.workspaceId, conversationId)).rejects.toMatchObject({ code: 'conversation_not_found' });
    expect(db.count('brain_messages', context.workspaceId)).toBe(0);
    expect(await readBrainSource(db.d1(), context.workspaceId, citedSource.id)).toMatchObject({ version: 1 });
  });

  it('keeps citation-based erasure for legacy messages with empty context metadata', async () => {
    const { db, context, write } = fixture();
    const source = capture();
    await write(source);
    const conversationId = await thread(write);
    await write(ask(conversationId));
    db.sqlite.prepare("UPDATE brain_messages SET context_source_ids_json='[]' WHERE workspace_id=? AND conversation_id=?").run(context.workspaceId, conversationId);
    await write({ action: 'source.delete', operationId: crypto.randomUUID(), id: source.id, expectedVersion: 1 });
    await expect(readBrainConversation(db.d1(), context.workspaceId, conversationId)).rejects.toMatchObject({ code: 'conversation_not_found' });
  });

  it('leaves cited history untouched when a stale deletion is rejected', async () => {
    const { db, context, write } = fixture();
    const source = capture();
    await write(source);
    const conversationId = await thread(write);
    await write(ask(conversationId));
    await expect(write({ action: 'source.delete', operationId: crypto.randomUUID(), id: source.id, expectedVersion: 2 })).rejects.toMatchObject({ code: 'brain_write_conflict' });
    expect((await readBrainConversation(db.d1(), context.workspaceId, conversationId)).messages).toHaveLength(2);
  });
});

describe('second brain policy, indexing and race fences', () => {
  it('rejects unsafe control characters but preserves ordinary line breaks and tabs', async () => {
    const { db, context, write } = fixture();
    for (const code of [0, 1, 8, 11, 12, 14, 31]) {
      await expect(write(capture({ body: `bad${String.fromCharCode(code)}text` }))).rejects.toMatchObject({ status: 400, code: 'validation_error' });
    }
    const source = capture({ body: 'First line\nSecond\tcolumn\r\nThird line' });
    await write(source);
    expect((await readBrainSource(db.d1(), context.workspaceId, source.id)).body).toBe(source.body);
    expect(db.count('brain_sources', context.workspaceId)).toBe(1);
  });

  it('enforces source and conversation count caps with database triggers and normalized errors', async () => {
    const { db, context, write } = fixture();
    const insertSource = db.sqlite.prepare("INSERT INTO brain_sources (workspace_id,id,title,body) VALUES (?,?,'Synthetic','x')");
    for (let i = 0; i < 200; i++) insertSource.run(context.workspaceId, crypto.randomUUID());
    await expect(write(capture())).rejects.toMatchObject({ status: 409, code: 'brain_capacity' });
    expect(db.count('brain_sources', context.workspaceId)).toBe(200);
    expect(db.count('brain_receipts', context.workspaceId)).toBe(0);
    const insertConversation = db.sqlite.prepare("INSERT INTO brain_conversations (workspace_id,id,title) VALUES (?,?,'Synthetic')");
    for (let i = 0; i < 100; i++) insertConversation.run(context.workspaceId, crypto.randomUUID());
    await expect(thread(write)).rejects.toMatchObject({ status: 409, code: 'brain_capacity' });
    expect(db.count('brain_conversations', context.workspaceId)).toBe(100);
  });

  it('caps cumulative source UTF-8 bytes on INSERT and UPDATE without consuming another tenant budget', async () => {
    const { db, context, identity, write } = fixture();
    const insertSource = db.sqlite.prepare("INSERT INTO brain_sources (workspace_id,id,title,body) VALUES (?,?,'X',?)");
    for (let i = 0; i < 78; i++) insertSource.run(context.workspaceId, crypto.randomUUID(), 'é'.repeat(20_000));
    const small = capture({ title: 'Small source', body: 'Small' });
    await write(small);
    await expect(write(capture({ body: 'é'.repeat(20_000) }))).rejects.toMatchObject({ code: 'brain_capacity' });
    await expect(write({ ...small, operationId: crypto.randomUUID(), expectedVersion: 1, body: 'é'.repeat(20_000) })).rejects.toMatchObject({ code: 'brain_capacity' });
    expect((await readBrainSource(db.d1(), context.workspaceId, small.id)).body).toBe('Small');
    const other = tenant(db, 'workspace-b');
    expect(await mutateBrain(db.d1(), other, identity, capture({ body: 'é'.repeat(20_000) }))).toMatchObject({ version: 1 });
  });

  it('enforces message count and cumulative byte limits inside SQLite, including updates', async () => {
    const { db, context, write } = fixture();
    const first = await thread(write);
    const second = await thread(write);
    const insertMessage = db.sqlite.prepare("INSERT INTO brain_messages (workspace_id,id,conversation_id,role,content,citations_json,mode,created_at) VALUES (?,?,?,'assistant',?,'[]','search',?)");
    for (let i = 0; i < 131; i++) insertMessage.run(context.workspaceId, crypto.randomUUID(), i < 70 ? first : second, 'x'.repeat(24_000), now);
    expect(() => insertMessage.run(context.workspaceId, crypto.randomUUID(), second, 'x'.repeat(2000), now)).toThrow('brain_capacity_message_bytes');
    const shortId = crypto.randomUUID();
    insertMessage.run(context.workspaceId, shortId, second, 'x', now);
    expect(() => db.sqlite.prepare('UPDATE brain_messages SET content=? WHERE workspace_id=? AND id=?').run('x'.repeat(2000), context.workspaceId, shortId)).toThrow('brain_capacity_message_bytes');
    expect(db.sqlite.prepare('SELECT content FROM brain_messages WHERE workspace_id=? AND id=?').get(context.workspaceId, shortId)).toEqual({ content: 'x' });
    for (let i = 70; i < 100; i++) insertMessage.run(context.workspaceId, crypto.randomUUID(), first, 'x', now);
    expect(() => insertMessage.run(context.workspaceId, crypto.randomUUID(), first, 'x', now)).toThrow('brain_capacity_messages');
    await expect(write(ask(first))).rejects.toMatchObject({ code: 'conversation_full' });
  });

  it('denies read-only writes and member settings/export before touching database or model', async () => {
    const { db, context, identity } = fixture('member');
    await expect(mutateBrain({} as D1Database, context, identity, { action: 'settings.update', enabled: true })).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    await expect(exportBrain({} as D1Database, context, identity)).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    const auditor = { ...context, workspace: { ...context.workspace, role: 'auditor' as const } };
    await expect(mutateBrain(db.d1(), auditor, identity, capture())).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    expect(ai.embedTexts).not.toHaveBeenCalled();
  });

  it.each(['authjs', 'cloudflare-access'] as const)('blocks enabling and calling local AI in %s while allowing capture', async (runtimeMode) => {
    const { db, context, identity } = fixture();
    const cloud = { ...identity, runtimeMode };
    const write = (body: Record<string, unknown>) => mutateBrain(db.d1(), context, cloud, body);
    const source = capture();
    await write(source);
    await expect(write({ action: 'settings.update', operationId: crypto.randomUUID(), enabled: true })).rejects.toMatchObject({ code: 'local_ai_device_only' });
    await expect(write({ action: 'source.index', operationId: crypto.randomUUID(), id: source.id })).rejects.toMatchObject({ code: 'local_ai_disabled' });
    const conversationId = await thread(write);
    await expect(write(ask(conversationId, { mode: 'ollama' }))).rejects.toMatchObject({ code: 'local_ai_disabled' });
    expect(ai.embedTexts).not.toHaveBeenCalled();
    expect(ai.generateGroundedAnswer).not.toHaveBeenCalled();
    expect((await readBrainSnapshot(db.d1(), context, cloud)).ai).toMatchObject({ device: false, enabled: false });
  });

  it('stores real float32 embedding blobs only after opt-in and invalidates them on source edit', async () => {
    const { db, context, write } = fixture();
    const source = capture();
    await write(source);
    await expect(write({ action: 'source.index', operationId: crypto.randomUUID(), id: source.id })).rejects.toMatchObject({ code: 'local_ai_disabled' });
    await write({ action: 'settings.update', operationId: crypto.randomUUID(), enabled: true });
    expect(await write({ action: 'source.index', operationId: crypto.randomUUID(), id: source.id })).toEqual({ indexedChunks: 1 });
    const stored = db.sqlite.prepare('SELECT hex(embedding) vector,embedding_model model FROM brain_chunks WHERE workspace_id=?').get(context.workspaceId);
    expect(stored).toEqual({ vector: '0000803F0000000000000000', model: embeddingIdentity });
    expect((await readBrainSource(db.d1(), context.workspaceId, source.id)).indexedChunks).toBe(1);
    await write({ ...source, operationId: crypto.randomUUID(), expectedVersion: 1, body: 'A new source body' });
    expect((await readBrainSource(db.d1(), context.workspaceId, source.id)).indexedChunks).toBe(0);
  });

  it('refuses to commit vectors if model weights change behind the same tag during indexing', async () => {
    const { db, context, write } = fixture();
    const source = capture();
    await write(source);
    await write({ action: 'settings.update', operationId: crypto.randomUUID(), enabled: true });
    vi.mocked(ai.embeddingModelIdentity)
      .mockResolvedValueOnce(embeddingIdentity)
      .mockResolvedValueOnce(`embeddinggemma@${'b'.repeat(64)}`);
    await expect(write({ action: 'source.index', operationId: crypto.randomUUID(), id: source.id }))
      .rejects.toMatchObject({ status: 409, code: 'embedding_model_changed' });
    expect((await readBrainSource(db.d1(), context.workspaceId, source.id)).indexedChunks).toBe(0);
    expect(db.count('brain_receipts', context.workspaceId)).toBe(2);
    expect(db.count('audit_events', context.workspaceId)).toBe(2);
  });

  it('ignores vectors from an old same-tag digest until sources are reindexed with the new weights', async () => {
    const { db, context, write } = fixture();
    const source = capture();
    await write(source);
    await write({ action: 'settings.update', operationId: crypto.randomUUID(), enabled: true });
    await write({ action: 'source.index', operationId: crypto.randomUUID(), id: source.id });
    const query = 'quasarrefraction';
    expect((await searchBrain(db.d1(), context.workspaceId, query)).passages).toEqual([]);
    const updatedIdentity = `embeddinggemma@${'b'.repeat(64)}`;
    vi.mocked(ai.embeddingModelIdentity).mockResolvedValue(updatedIdentity);
    const conversationId = await thread(write);
    await write(ask(conversationId, { mode: 'ollama', question: query }));
    expect(vi.mocked(ai.generateGroundedAnswer).mock.lastCall?.[2]).toEqual([]);
    expect((await readBrainConversation(db.d1(), context.workspaceId, conversationId)).messages[1].citations).toEqual([]);

    await write({ action: 'source.index', operationId: crypto.randomUUID(), id: source.id });
    const freshConversation = await thread(write);
    await write(ask(freshConversation, { mode: 'ollama', question: query }));
    expect(vi.mocked(ai.generateGroundedAnswer).mock.lastCall?.[2]).toEqual([expect.objectContaining({ sourceId: source.id })]);
    expect(db.sqlite.prepare('SELECT embedding_model model FROM brain_chunks WHERE workspace_id=?').get(context.workspaceId)).toEqual({ model: updatedIdentity });
  });

  it('discards an in-flight index after the emergency stop changes policy revision', async () => {
    const { db, context, write } = fixture();
    const source = capture();
    await write(source);
    await write({ action: 'settings.update', operationId: crypto.randomUUID(), enabled: true });
    vi.mocked(ai.embedTexts).mockImplementationOnce(async () => {
      await write({ action: 'settings.update', operationId: crypto.randomUUID(), enabled: false });
      return [[1, 0, 0]];
    });
    await expect(write({ action: 'source.index', operationId: crypto.randomUUID(), id: source.id })).rejects.toMatchObject({ code: 'brain_write_conflict' });
    expect((await readBrainSource(db.d1(), context.workspaceId, source.id)).indexedChunks).toBe(0);
    expect(db.count('brain_receipts', context.workspaceId)).toBe(3);
  });

  it('discards an in-flight AI answer if policy is stopped or its evidence changes', async () => {
    for (const race of ['stop', 'edit'] as const) {
      const { db, context, write } = fixture();
      const source = capture();
      await write(source);
      await write({ action: 'settings.update', operationId: crypto.randomUUID(), enabled: true });
      const conversationId = await thread(write);
      vi.mocked(ai.generateGroundedAnswer).mockImplementationOnce(async (_config, _question, passages) => {
        if (race === 'stop') await write({ action: 'settings.update', operationId: crypto.randomUUID(), enabled: false });
        else await write({ ...source, operationId: crypto.randomUUID(), expectedVersion: 1, body: 'Completely revised evidence' });
        return { answer: 'A stale answer that must never persist', citationIds: passages.map((p) => p.id) };
      });
      await expect(write(ask(conversationId, { mode: 'ollama' }))).rejects.toMatchObject({ code: 'brain_write_conflict' });
      expect((await readBrainConversation(db.d1(), context.workspaceId, conversationId)).messages).toEqual([]);
      expect(db.count('brain_messages', context.workspaceId)).toBe(0);
    }
  });

  it('rejects a conversation race without appending a second stale pair', async () => {
    const { db, context, write } = fixture();
    await write(capture());
    const conversationId = await thread(write);
    db.beforeNextBatch = () => { db.sqlite.prepare('UPDATE brain_conversations SET version=version+1 WHERE workspace_id=? AND id=?').run(context.workspaceId, conversationId); };
    await expect(write(ask(conversationId))).rejects.toMatchObject({ code: 'brain_write_conflict' });
    expect((await readBrainConversation(db.d1(), context.workspaceId, conversationId)).messages).toEqual([]);
  });

  it('rolls back a write if a real reset advances the epoch before its commit', async () => {
    const { db, context, write } = fixture();
    db.beforeNextBatch = () => advanceEpoch(db, context.workspaceId);
    await expect(write(capture())).rejects.toMatchObject({ status: 409, code: 'workspace_mutation_stale' });
    expect(db.count('brain_sources', context.workspaceId)).toBe(0);
    expect(db.count('brain_receipts', context.workspaceId)).toBe(0);
    expect(db.count('audit_events', context.workspaceId)).toBe(0);
  });

  it('rejects replay across a reset epoch and refuses to resurrect an already-deleted source', async () => {
    const { db, context, write } = fixture();
    const source = capture();
    await write(source);
    await write({ action: 'source.delete', operationId: crypto.randomUUID(), id: source.id, expectedVersion: 1 });
    await expect(write(source)).rejects.toMatchObject({ code: 'source_not_found' });
    advanceEpoch(db, context.workspaceId);
    await expect(write(source)).rejects.toMatchObject({ status: 409, code: 'brain_result_reset' });
    expect(db.count('brain_sources', context.workspaceId)).toBe(0);
  });

  it('exports a consistent readable snapshot without vectors and records a separate audit event', async () => {
    const { db, context, identity, write } = fixture();
    const source = capture();
    await write(source);
    const conversationId = await thread(write);
    await write(ask(conversationId));
    const exported = await exportBrain(db.d1(), context, identity);
    expect(exported).toMatchObject({ format: 'free-crm-second-brain', version: 1, sources: [expect.objectContaining({ id: source.id, body: source.body })], conversations: [expect.objectContaining({ id: conversationId })] });
    expect(exported.messages).toHaveLength(2);
    expect(JSON.stringify(exported)).not.toContain('embedding');
    expect(db.count('audit_events', context.workspaceId)).toBe(4);
  });
});
