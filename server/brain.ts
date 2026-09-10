import { env } from 'cloudflare:workers';
import type { BrainCitation, BrainConversation, BrainMessage, BrainPassage, BrainSaveInput, BrainSnapshot, BrainSource, BrainSourceSummary } from '@/lib/brain-types';
import { chunkText, cosineSimilarity, keywordSearch } from '@/lib/brain-retrieval';
import { BrainAiError, embeddingModelIdentity, embedTexts, generateGroundedAnswer, getOllamaStatus, type OllamaConfig } from './brain-ai';
import { hasPermission, requirePermission } from './authorization';
import type { WorkspaceContext } from './control-plane';
import { ApiError, type RequestIdentity } from './request-context';
import { captureWorkspaceMutationEpoch, normalizeMutationFenceError, workspaceMutationFence } from './mutation-fence';
import { assertD1BatchSize } from './d1-limits';

export const brainLimits = { sources: 200, bodyCharacters: 40_000, conversations: 100, messagesPerConversation: 100, sourceBytes: 3 * 1024 * 1024, messageBytes: 3 * 1024 * 1024 } as const;
type SourceRow = { id: string; title: string; body: string; kind: BrainSource['kind']; source_url: string | null; tags_json: string; pinned: number; version: number; created_at: string; updated_at: string; chunk_count?: number; indexed_chunks?: number };
type ConversationRow = { id: string; title: string; created_at: string; updated_at: string; version: number };
type MessageRow = { id: string; role: BrainMessage['role']; content: string; citations_json: string; mode: BrainMessage['mode']; created_at: string };
type PassageRow = { id: string; source_id: string; title: string; content: string; ordinal: number; version: number; embedding_hex?: string };
type VersionedPassage = BrainPassage & { version: number };
type Receipt = { fingerprint: string; result_json: string; mutation_epoch: number };
type ResultPointer = { sourceId?: string; conversationId?: string; messageIds?: string[]; deleted?: boolean; enabled?: boolean; indexedChunks?: number };

export function brainConfig(): OllamaConfig {
  return {
    baseUrl: env.FREE_CRM_OLLAMA_URL || 'http://127.0.0.1:11434',
    chatModel: env.FREE_CRM_OLLAMA_CHAT_MODEL || 'gemma3:1b',
    embeddingModel: env.FREE_CRM_OLLAMA_EMBED_MODEL || 'embeddinggemma',
  };
}

function text(value: unknown, field: string, maximum: number, required = true): string {
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) {
    throw new ApiError(400, 'validation_error', `${field} must be ${required ? 'non-empty ' : ''}text of at most ${maximum} characters.`);
  }
  return value.trim();
}

export function brainId(value: unknown, field = 'id'): string {
  const id = text(value, field, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(400, 'validation_error', `${field} must be a UUID.`);
  return id;
}

function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new ApiError(400, 'validation_error', 'expectedVersion must be a positive integer.');
  return Number(value);
}

function list(value: unknown, field: string, maximumLength: number): string[] {
  if (!Array.isArray(value) || value.length > 12) throw new ApiError(400, 'validation_error', `${field} must contain at most 12 values.`);
  return [...new Set(value.map((item) => text(item, field, maximumLength)))];
}

export function validateBrainSource(body: Record<string, unknown>): BrainSaveInput {
  const id = brainId(body.id);
  if (!['note', 'clip', 'import'].includes(String(body.kind))) throw new ApiError(400, 'validation_error', 'Choose a note, clip, or text import.');
  let sourceUrl: string | null = null;
  if (body.sourceUrl) {
    sourceUrl = text(body.sourceUrl, 'sourceUrl', 2048);
    let parsed: URL;
    try { parsed = new URL(sourceUrl); } catch { throw new ApiError(400, 'validation_error', 'Source URL must be an HTTP or HTTPS URL.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new ApiError(400, 'validation_error', 'Source URLs cannot contain credentials or executable protocols.');
  }
  if (typeof body.pinned !== 'boolean') throw new ApiError(400, 'validation_error', 'pinned must be a boolean.');
  const relatedSourceIds = list(body.relatedSourceIds, 'relatedSourceIds', 36).map((item) => brainId(item));
  if (relatedSourceIds.includes(id)) throw new ApiError(400, 'validation_error', 'A source cannot link to itself.');
  return {
    id, ...(body.expectedVersion === undefined ? {} : { expectedVersion: version(body.expectedVersion) }),
    title: text(body.title, 'title', 200), body: text(body.body, 'body', brainLimits.bodyCharacters),
    kind: body.kind as BrainSaveInput['kind'], sourceUrl, tags: list(body.tags, 'tags', 40), pinned: body.pinned,
    recordIds: list(body.recordIds, 'recordIds', 128), relatedSourceIds,
  };
}

function sourceSummary(row: SourceRow): BrainSourceSummary {
  return { id: row.id, title: row.title, kind: row.kind, sourceUrl: row.source_url, tags: JSON.parse(row.tags_json), pinned: Boolean(row.pinned), version: row.version, createdAt: row.created_at, updatedAt: row.updated_at, excerpt: row.body.slice(0, 180), chunkCount: row.chunk_count ?? 0, indexedChunks: row.indexed_chunks ?? 0 };
}
function conversation(row: ConversationRow): BrainConversation { return { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at }; }
function message(row: MessageRow): BrainMessage { return { id: row.id, role: row.role, content: row.content, citations: JSON.parse(row.citations_json), mode: row.mode, createdAt: row.created_at }; }
function passage(row: PassageRow): VersionedPassage { return { id: row.id, sourceId: row.source_id, title: row.title, text: row.content, ordinal: row.ordinal, version: row.version }; }

export async function readBrainSource(db: D1Database, workspaceId: string, id: string): Promise<BrainSource> {
  const row = await db.prepare('SELECT s.*,(SELECT count(*) FROM brain_chunks c WHERE c.workspace_id=s.workspace_id AND c.source_id=s.id) chunk_count,(SELECT count(*) FROM brain_chunks c WHERE c.workspace_id=s.workspace_id AND c.source_id=s.id AND c.embedding IS NOT NULL) indexed_chunks FROM brain_sources s WHERE s.workspace_id=? AND s.id=?').bind(workspaceId, id).first<SourceRow>();
  if (!row) throw new ApiError(404, 'source_not_found', 'This knowledge source no longer exists.');
  const links = await db.prepare('SELECT target_id id FROM brain_links WHERE workspace_id=? AND source_id=?').bind(workspaceId, id).all<{ id: string }>();
  const records = await db.prepare('SELECT record_id id FROM brain_record_links WHERE workspace_id=? AND source_id=?').bind(workspaceId, id).all<{ id: string }>();
  return { ...sourceSummary(row), body: row.body, relatedSourceIds: links.results.map((link) => link.id), recordIds: records.results.map((link) => link.id) };
}

export async function readBrainConversation(db: D1Database, workspaceId: string, id: string) {
  const row = await db.prepare('SELECT * FROM brain_conversations WHERE workspace_id=? AND id=?').bind(workspaceId, id).first<ConversationRow>();
  if (!row) throw new ApiError(404, 'conversation_not_found', 'This conversation no longer exists.');
  const messages = await db.prepare('SELECT * FROM brain_messages WHERE workspace_id=? AND conversation_id=? ORDER BY created_at,id LIMIT 100').bind(workspaceId, id).all<MessageRow>();
  return { conversation: conversation(row), messages: messages.results.map(message), version: row.version };
}

async function settings(db: D1Database, workspaceId: string) {
  return await db.prepare('SELECT enabled,revision FROM brain_settings WHERE workspace_id=?').bind(workspaceId).first<{ enabled: number; revision: number }>() ?? { enabled: 0, revision: 0 };
}

export async function readBrainSnapshot(db: D1Database, context: WorkspaceContext, identity: RequestIdentity): Promise<BrainSnapshot> {
  const workspaceId = context.workspaceId;
  const [sources, links, records, conversations, config] = await Promise.all([
    db.prepare('SELECT s.id,s.title,substr(s.body,1,180) body,s.kind,s.source_url,s.tags_json,s.pinned,s.version,s.created_at,s.updated_at,count(c.id) chunk_count,count(c.embedding) indexed_chunks FROM brain_sources s LEFT JOIN brain_chunks c ON c.workspace_id=s.workspace_id AND c.source_id=s.id WHERE s.workspace_id=? GROUP BY s.workspace_id,s.id ORDER BY s.pinned DESC,s.updated_at DESC LIMIT 200').bind(workspaceId).all<SourceRow>(),
    db.prepare("SELECT source_id sourceId,target_id targetId,'source' kind FROM brain_links WHERE workspace_id=? UNION ALL SELECT source_id sourceId,record_id targetId,'record' kind FROM brain_record_links WHERE workspace_id=?").bind(workspaceId, workspaceId).all<BrainSnapshot['links'][number]>(),
    db.prepare('SELECT id,name title,object_type objectType FROM records WHERE workspace_id=? AND archived_at IS NULL ORDER BY name LIMIT 1000').bind(workspaceId).all<BrainSnapshot['records'][number]>(),
    db.prepare('SELECT * FROM brain_conversations WHERE workspace_id=? ORDER BY updated_at DESC LIMIT 100').bind(workspaceId).all<ConversationRow>(),
    settings(db, workspaceId),
  ]);
  const device = identity.runtimeMode === 'device';
  const ai = brainConfig();
  return { workspaceName: context.workspace.name, canWrite: hasPermission(context.workspace.role, 'records:write'), canManage: hasPermission(context.workspace.role, 'workspace:manage'), canExport: hasPermission(context.workspace.role, 'data:export'), sources: sources.results.map(sourceSummary), links: links.results, records: records.results, conversations: conversations.results.map(conversation), ai: { enabled: Boolean(config.enabled), device, chatModel: ai.chatModel, embeddingModel: ai.embeddingModel, detail: device ? 'Local Ollama · opt-in · read-only answers. No cloud provider key required.' : 'Capture and source search work here. Local AI runs only in a device or local Docker workspace.' }, limits: brainLimits };
}

async function keywordPassages(db: D1Database, workspaceId: string, query: string): Promise<VersionedPassage[]> {
  const rows = await db.prepare('SELECT c.id,c.source_id,c.content,c.ordinal,s.title,s.version FROM brain_chunks c JOIN brain_sources s ON s.workspace_id=c.workspace_id AND s.id=c.source_id WHERE c.workspace_id=? ORDER BY c.source_id,c.ordinal LIMIT 8000').bind(workspaceId).all<PassageRow>();
  return keywordSearch(query, rows.results.map(passage), 50) as VersionedPassage[];
}

export async function searchBrain(db: D1Database, workspaceId: string, query: unknown) {
  return { passages: (await keywordPassages(db, workspaceId, text(query, 'search', 2000))).slice(0, 8), mode: 'keyword' as const };
}

function decodeEmbedding(hex: string): number[] {
  if (!hex || hex.length > 8192 || hex.length % 8 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return [];
  const bytes = Uint8Array.from(hex.match(/../g)!, (value) => Number.parseInt(value, 16));
  const view = new DataView(bytes.buffer);
  return Array.from({ length: bytes.length / 4 }, (_, index) => view.getFloat32(index * 4, true));
}
function encodeEmbedding(vector: number[]): ArrayBuffer {
  if (!vector.length || vector.length > 1024 || vector.some((n) => !Number.isFinite(n))) throw new ApiError(502, 'invalid_embedding', 'The embedding model returned an unsupported vector.');
  const buffer = new ArrayBuffer(vector.length * 4);
  const view = new DataView(buffer);
  vector.forEach((n, index) => view.setFloat32(index * 4, n, true));
  return buffer;
}

async function retrieve(db: D1Database, workspaceId: string, query: string, ai: boolean, signal?: AbortSignal): Promise<VersionedPassage[]> {
  const lexical = await keywordPassages(db, workspaceId, query);
  if (!ai) return lexical.slice(0, 8);
  const config = brainConfig();
  let vector: number[];
  let modelIdentity: string;
  try {
    modelIdentity = await embeddingModelIdentity(config, true, signal);
    [vector] = await embedTexts(config, [query], true, signal);
    if (await embeddingModelIdentity(config, true, signal) !== modelIdentity) throw new BrainAiError('embedding_model_changed', 'The embedding model changed during retrieval. Reindex your sources.');
  }
  catch (error) {
    if (signal?.aborted) throw error;
    // A missing local embedding model does not turn ordinary source search into pretend semantic search.
    if (error instanceof BrainAiError) return lexical.slice(0, 8);
    throw error;
  }
  let semantic: (VersionedPassage & { score: number })[] = [];
  // Paging packed float32 vectors keeps the local Worker well below its memory limit.
  for (let offset = 0; offset < 8000; offset += 400) {
    signal?.throwIfAborted();
    const rows = await db.prepare('SELECT c.id,c.source_id,c.content,c.ordinal,s.title,s.version,hex(c.embedding) embedding_hex FROM brain_chunks c JOIN brain_sources s ON s.workspace_id=c.workspace_id AND s.id=c.source_id WHERE c.workspace_id=? AND c.embedding_model=? ORDER BY c.source_id,c.ordinal LIMIT 400 OFFSET ?').bind(workspaceId, modelIdentity, offset).all<PassageRow>();
    semantic = [...semantic, ...rows.results.map((row) => ({ ...passage(row), score: cosineSimilarity(vector, decodeEmbedding(row.embedding_hex ?? '')) }))].filter((p) => p.score >= 0.3).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 50);
    if (rows.results.length < 400) break;
  }
  const fused = new Map<string, VersionedPassage & { score: number }>();
  for (const ranking of [lexical, semantic]) ranking.forEach((p, index) => fused.set(p.id, { ...p, score: (fused.get(p.id)?.score ?? 0) + 1 / (60 + index + 1) }));
  return [...fused.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 8);
}

async function fingerprint(value: unknown) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function purgeCitingConversations(db: D1Database, workspaceId: string, sourceId: string) {
  // A model-selected citation is not complete provenance. Purge any conversation
  // supplied this source as context, even when the model did not cite it. Keep
  // citation fallback for messages written before context tracking was added.
  return db.prepare("DELETE FROM brain_conversations WHERE workspace_id=? AND id IN (SELECT m.conversation_id FROM brain_messages m WHERE m.workspace_id=? AND (EXISTS(SELECT 1 FROM json_each(m.context_source_ids_json) dependency WHERE dependency.value=?) OR EXISTS(SELECT 1 FROM json_each(m.citations_json) citation WHERE json_extract(citation.value,'$.sourceId')=?)))").bind(workspaceId, workspaceId, sourceId, sourceId);
}

async function materialize(db: D1Database, workspaceId: string, result: ResultPointer) {
  if (result.messageIds && result.conversationId) {
    const thread = await readBrainConversation(db, workspaceId, result.conversationId);
    const messages = thread.messages.filter((item) => result.messageIds!.includes(item.id));
    if (messages.length !== result.messageIds.length) throw new ApiError(410, 'brain_result_removed', 'The result was removed. No operation was repeated.');
    return { messages };
  }
  if (result.sourceId) return readBrainSource(db, workspaceId, result.sourceId);
  if (result.conversationId) return (await readBrainConversation(db, workspaceId, result.conversationId)).conversation;
  return result;
}

/** Each write, optimistic-version guard, receipt, audit and reset fence commits as one D1 batch. */
export async function mutateBrain(db: D1Database, context: WorkspaceContext, identity: RequestIdentity, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const action = text(body.action, 'action', 40);
  const allowed = ['source.save', 'source.delete', 'source.index', 'conversation.create', 'conversation.delete', 'ask', 'settings.update', 'status'];
  if (!allowed.includes(action)) throw new ApiError(400, 'unknown_operation', 'Unknown second-brain operation.');
  requirePermission(context.workspace.role, action === 'settings.update' ? 'workspace:manage' : action === 'status' ? 'records:read' : 'records:write');
  const device = identity.runtimeMode === 'device';
  if (action === 'status') return getOllamaStatus(brainConfig(), device, signal);
  const workspaceId = context.workspaceId;
  const operationId = brainId(body.operationId, 'operationId');
  const payloadHash = await fingerprint(body);
  const epoch = await captureWorkspaceMutationEpoch(db, workspaceId);
  async function replay() {
    const prior = await db.prepare('SELECT fingerprint,result_json,mutation_epoch FROM brain_receipts WHERE workspace_id=? AND operation_id=?').bind(workspaceId, operationId).first<Receipt>();
    if (!prior) return null;
    if (prior.fingerprint !== payloadHash) throw new ApiError(409, 'idempotency_conflict', 'That operation ID was already used for a different request.');
    if (prior.mutation_epoch !== epoch) throw new ApiError(409, 'brain_result_reset', 'A workspace reset discarded this operation. It was not repeated.');
    return { result: await materialize(db, workspaceId, JSON.parse(prior.result_json)) };
  }
  const previous = await replay();
  if (previous) return previous.result;
  const now = new Date().toISOString();
  let result: ResultPointer = {};
  let first: D1PreparedStatement;
  const after: D1PreparedStatement[] = [];
  let entityId: string | null = null;

  if (action === 'source.save') {
    const source = validateBrainSource(body);
    entityId = source.id;
    if (source.expectedVersion !== undefined) {
      first = db.prepare('UPDATE brain_sources SET title=?,body=?,kind=?,source_url=?,tags_json=?,pinned=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND version=?').bind(source.title, source.body, source.kind, source.sourceUrl ?? null, JSON.stringify(source.tags), Number(source.pinned), now, workspaceId, source.id, source.expectedVersion);
      after.push(purgeCitingConversations(db, workspaceId, source.id));
    } else {
      first = db.prepare('INSERT INTO brain_sources (workspace_id,id,title,body,kind,source_url,tags_json,pinned,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?)').bind(workspaceId, source.id, source.title, source.body, source.kind, source.sourceUrl ?? null, JSON.stringify(source.tags), Number(source.pinned), now, now);
    }
    after.push(db.prepare('DELETE FROM brain_chunks WHERE workspace_id=? AND source_id=?').bind(workspaceId, source.id), db.prepare('DELETE FROM brain_links WHERE workspace_id=? AND source_id=?').bind(workspaceId, source.id), db.prepare('DELETE FROM brain_record_links WHERE workspace_id=? AND source_id=?').bind(workspaceId, source.id));
    const chunks = chunkText(source.body);
    if (chunks.length > 40) throw new ApiError(400, 'source_too_many_chunks', 'This text exceeds the supported passage capacity. Split it into smaller sources.');
    for (let start = 0; start < chunks.length; start += 10) {
      const page = chunks.slice(start, start + 10);
      after.push(db.prepare(`INSERT INTO brain_chunks (workspace_id,id,source_id,ordinal,content) VALUES ${page.map(() => '(?,?,?,?,?)').join(',')}`).bind(...page.flatMap((content, index) => [workspaceId, crypto.randomUUID(), source.id, start + index, content])));
    }
    if (source.relatedSourceIds.length) after.push(db.prepare(`INSERT INTO brain_links (workspace_id,source_id,target_id) VALUES ${source.relatedSourceIds.map(() => '(?,?,?)').join(',')}`).bind(...source.relatedSourceIds.flatMap((id) => [workspaceId, source.id, id])));
    if (source.recordIds.length) after.push(db.prepare(`INSERT INTO brain_record_links (workspace_id,source_id,record_id) VALUES ${source.recordIds.map(() => '(?,?,?)').join(',')}`).bind(...source.recordIds.flatMap((id) => [workspaceId, source.id, id])));
    result = { sourceId: source.id };
  } else if (action === 'source.delete') {
    entityId = brainId(body.id);
    first = db.prepare('DELETE FROM brain_sources WHERE workspace_id=? AND id=? AND version=?').bind(workspaceId, entityId, version(body.expectedVersion));
    after.push(purgeCitingConversations(db, workspaceId, entityId));
    result = { deleted: true };
  } else if (action === 'conversation.create') {
    entityId = brainId(body.id);
    first = db.prepare('INSERT INTO brain_conversations (workspace_id,id,title,version,created_at,updated_at) VALUES (?,?,?,0,?,?)').bind(workspaceId, entityId, text(body.title, 'title', 200), now, now);
    result = { conversationId: entityId };
  } else if (action === 'conversation.delete') {
    entityId = brainId(body.id);
    first = db.prepare('DELETE FROM brain_conversations WHERE workspace_id=? AND id=?').bind(workspaceId, entityId);
    result = { deleted: true };
  } else if (action === 'settings.update') {
    if (typeof body.enabled !== 'boolean') throw new ApiError(400, 'validation_error', 'enabled must be a boolean.');
    if (body.enabled && !device) throw new ApiError(409, 'local_ai_device_only', 'Use a local device or Docker workspace to enable Ollama.');
    first = db.prepare('INSERT INTO brain_settings (workspace_id,enabled,revision,updated_at) VALUES (?,?,1,?) ON CONFLICT(workspace_id) DO UPDATE SET enabled=excluded.enabled,revision=revision+1,updated_at=excluded.updated_at').bind(workspaceId, Number(body.enabled), now);
    result = { enabled: body.enabled };
  } else if (action === 'source.index') {
    entityId = brainId(body.id);
    const policy = await settings(db, workspaceId);
    if (!policy.enabled || !device) throw new ApiError(409, 'local_ai_disabled', 'Enable local AI in your device workspace first.');
    const source = await readBrainSource(db, workspaceId, entityId);
    const rows = await db.prepare('SELECT id,content FROM brain_chunks WHERE workspace_id=? AND source_id=? ORDER BY ordinal').bind(workspaceId, entityId).all<{ id: string; content: string }>();
    const config = brainConfig();
    const modelIdentity = await embeddingModelIdentity(config, device, signal);
    const vectors = await embedTexts(config, rows.results.map((row) => row.content), device, signal);
    if (await embeddingModelIdentity(config, device, signal) !== modelIdentity) throw new ApiError(409, 'embedding_model_changed', 'The embedding model changed during indexing. Retry with a stable local model.');
    first = db.prepare('UPDATE brain_sources SET updated_at=updated_at WHERE workspace_id=? AND id=? AND version=? AND EXISTS(SELECT 1 FROM brain_settings WHERE workspace_id=? AND enabled=1 AND revision=?)').bind(workspaceId, entityId, source.version, workspaceId, policy.revision);
    for (let start = 0; start < rows.results.length; start += 10) {
      const page = rows.results.slice(start, start + 10);
      after.push(db.prepare(`INSERT INTO brain_chunks (workspace_id,id,source_id,ordinal,content,embedding,embedding_model) VALUES ${page.map(() => '(?,?,?,?,?,?,?)').join(',')} ON CONFLICT(workspace_id,id) DO UPDATE SET embedding=excluded.embedding,embedding_model=excluded.embedding_model`).bind(...page.flatMap((row, index) => [workspaceId, row.id, entityId!, start + index, row.content, encodeEmbedding(vectors[start + index]), modelIdentity])));
    }
    result = { indexedChunks: rows.results.length };
  } else {
    entityId = brainId(body.conversationId, 'conversationId');
    const question = text(body.question, 'question', 2000);
    if (body.mode !== 'search' && body.mode !== 'ollama') throw new ApiError(400, 'validation_error', 'Choose source search or local Ollama.');
    const useAi = body.mode === 'ollama';
    const policy = await settings(db, workspaceId);
    if (useAi && (!policy.enabled || !device)) throw new ApiError(409, 'local_ai_disabled', 'Enable local AI in your device workspace first.');
    const thread = await readBrainConversation(db, workspaceId, entityId);
    if (thread.messages.length >= brainLimits.messagesPerConversation) throw new ApiError(409, 'conversation_full', 'Start a new conversation; this one has reached 100 messages.');
    const previousQuestion = thread.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const query = `${question}\n${previousQuestion}`.slice(0, 2000);
    const passages = await retrieve(db, workspaceId, query, useAi, signal);
    const generated = useAi ? await generateGroundedAnswer(brainConfig(), question, passages, thread.messages.slice(-4).map(({ role, content }) => ({ role, content })), device, signal) : null;
    const citations: BrainCitation[] = passages.filter((p) => !generated || generated.citationIds.includes(p.id)).map(({ id, sourceId, title, text: quote, ordinal, version: revision }) => ({ id, sourceId, title, text: quote, ordinal, version: revision }));
    const answer = (generated?.answer ?? (passages.length ? `Source search — not an AI-generated answer. Found ${passages.length} relevant passages. Read the sources below.` : 'No matching sources yet. Capture a relevant note or try a more specific search.')).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, '');
    const questionId = crypto.randomUUID();
    const answerId = crypto.randomUUID();
    // Optimistic conversation version, policy revision, and source versions all guard the final commit.
    const uniqueSources = [...new Map(passages.map((p) => [p.sourceId, p.version])).entries()];
    const contextSourceIds = JSON.stringify(uniqueSources.map(([sourceId]) => sourceId));
    const sourceGuard = uniqueSources.length ? ` AND (SELECT count(*) FROM brain_sources WHERE workspace_id=? AND (${uniqueSources.map(() => '(id=? AND version=?)').join(' OR ')}))=?` : '';
    first = db.prepare(`UPDATE brain_conversations SET version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND version=?${useAi ? ' AND EXISTS(SELECT 1 FROM brain_settings WHERE workspace_id=? AND enabled=1 AND revision=?)' : ''}${sourceGuard}`).bind(new Date().toISOString(), workspaceId, entityId, thread.version, ...(useAi ? [workspaceId, policy.revision] : []), ...(uniqueSources.length ? [workspaceId, ...uniqueSources.flat(), uniqueSources.length] : []));
    const questionTime = new Date().toISOString();
    const answerTime = new Date(Date.parse(questionTime) + 1).toISOString();
    after.push(db.prepare('INSERT INTO brain_messages (workspace_id,id,conversation_id,role,content,citations_json,context_source_ids_json,mode,created_at) VALUES (?,?,?,\'user\',?,\'[]\',\'[]\',\'question\',?),(?,?,?,\'assistant\',?,?,?,?,?)').bind(workspaceId, questionId, entityId, question, questionTime, workspaceId, answerId, entityId, answer, JSON.stringify(citations), contextSourceIds, useAi ? 'ollama' : 'search', answerTime));
    result = { conversationId: entityId, messageIds: [questionId, answerId] };
  }
  signal?.throwIfAborted();
  try {
    await db.batch(assertD1BatchSize([
      first,
      db.prepare('INSERT INTO brain_receipts (workspace_id,operation_id,fingerprint,action,result_json,affected,mutation_epoch,created_at) VALUES (?,?,?,?,?,changes(),?,?)').bind(workspaceId, operationId, payloadHash, action, JSON.stringify(result), epoch, now),
      ...after,
      db.prepare("INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at) VALUES (?,?,?,?,'knowledge',?,'{\"source\":\"second-brain\"}',?,?)").bind(crypto.randomUUID(), workspaceId, identity.userId, `brain.${action}`, entityId, identity.requestId, now),
      workspaceMutationFence(db, workspaceId, epoch, `brain:${operationId}`, now),
    ], `Second brain ${action}`));
  } catch (error) {
    const recovered = await replay();
    if (recovered) return recovered.result;
    throw normalizeBrainError(error);
  }
  return materialize(db, workspaceId, result);
}

export function normalizeBrainError(error: unknown): unknown {
  if (error instanceof BrainAiError) return new ApiError(503, error.code, error.message);
  if (error instanceof Error && error.name === 'AbortError') return new ApiError(499, 'request_cancelled', 'The request was cancelled. Refresh the conversation before retrying.');
  const description = String(error);
  if (description.includes('brain_write_conflict')) return new ApiError(409, 'brain_write_conflict', 'The source, conversation, or AI setting changed while this request was running. Refresh before retrying; your changes were not applied.');
  if (description.includes('brain_capacity')) return new ApiError(409, 'brain_capacity', 'This knowledge library or conversation has reached its supported capacity. Export and remove items you no longer need.');
  if (description.includes('FOREIGN KEY constraint failed')) return new ApiError(409, 'brain_link_unavailable', 'A linked source or CRM record is not available in this workspace.');
  if (description.includes('UNIQUE constraint failed')) return new ApiError(409, 'brain_id_conflict', 'This identifier already exists. Refresh before retrying.');
  return normalizeMutationFenceError(error);
}

export async function exportBrain(db: D1Database, context: WorkspaceContext, identity: RequestIdentity) {
  requirePermission(context.workspace.role, 'data:export');
  const workspaceId = context.workspaceId;
  // batch() gives the export a single transactional snapshot, without model indexes or credentials.
  const [sources, links, recordLinks, conversations, messages] = await db.batch([
    db.prepare('SELECT id,title,body,kind,source_url,tags_json,pinned,version,created_at,updated_at FROM brain_sources WHERE workspace_id=? ORDER BY id').bind(workspaceId),
    db.prepare('SELECT source_id,target_id FROM brain_links WHERE workspace_id=?').bind(workspaceId),
    db.prepare('SELECT source_id,record_id FROM brain_record_links WHERE workspace_id=?').bind(workspaceId),
    db.prepare('SELECT id,title,created_at,updated_at FROM brain_conversations WHERE workspace_id=? ORDER BY id').bind(workspaceId),
    db.prepare('SELECT id,conversation_id,role,content,citations_json,context_source_ids_json,mode,created_at FROM brain_messages WHERE workspace_id=? ORDER BY created_at,id').bind(workspaceId),
    db.prepare("INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,metadata_json,request_id,created_at) VALUES (?,?,?,'brain.export','knowledge','{}',?,?)").bind(crypto.randomUUID(), workspaceId, identity.userId, identity.requestId, new Date().toISOString()),
  ]);
  return { format: 'free-crm-second-brain', version: 1, exportedAt: new Date().toISOString(), sources: sources.results, links: links.results, recordLinks: recordLinks.results, conversations: conversations.results, messages: messages.results };
}
