import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import BrainPage from '@/app/brain/page';
import { brainSourceChangePrompt, brainSourceContextNotice, BrainMessageCard, KnowledgeGraph } from '@/app/brain/brain-workspace';
import { appendBrainMessages, BrainClientError, createBrainClient, downloadFilename, normalizedBrainDraft, safeSourceUrl, sourceMarkdown, sourceToDraft } from '@/lib/brain-client';
import type { BrainMessage, BrainSnapshot, BrainSource } from '@/lib/brain-types';

const source: BrainSource = { id: 'source-a', title: 'A thought worth keeping', body: 'My original text.\n<script>not executable</script>', kind: 'note', sourceUrl: 'https://example.org/article', tags: ['research'], pinned: true, version: 2, createdAt: '2026-09-09T00:00:00Z', updatedAt: '2026-09-09T00:00:00Z', excerpt: 'My original text.', chunkCount: 1, indexedChunks: 0, recordIds: ['record-a'], relatedSourceIds: ['source-b'] };
const snapshot: BrainSnapshot = { workspaceName: 'Private workspace', canWrite: true, canManage: true, canExport: true, sources: [source, { ...source, id: 'source-b', title: 'Another thought' }], links: [{ sourceId: 'source-a', targetId: 'source-b', kind: 'source' }, { sourceId: 'source-a', targetId: 'record-a', kind: 'record' }], records: [{ id: 'record-a', title: 'My relationship', objectType: 'contact' }], conversations: [], ai: { enabled: false, device: true, chatModel: 'gemma3:1b', embeddingModel: 'embeddinggemma', detail: 'Local AI is optional.' }, limits: { sources: 200, bodyCharacters: 40000, conversations: 100, messagesPerConversation: 100, sourceBytes: 3145728, messageBytes: 3145728 } };
const answer: BrainMessage = { id: 'answer-a', role: 'assistant', mode: 'search', content: 'A passage, not an AI answer. <script>alert(1)</script>', createdAt: source.createdAt, citations: [{ id: 'citation-a', sourceId: source.id, title: '<img src=x onerror=alert(1)>', text: '<script>plain evidence</script>', ordinal: 0, version: 2 }] };
const ok = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });

describe('second brain workspace rendering', () => {
  it.each(['save', 'delete'] as const)('discloses context-based conversation removal before %s, without promising all copies disappear', (action) => {
    const prompt = brainSourceChangePrompt(action, source.title);
    expect(prompt).toContain(brainSourceContextNotice);
    expect(prompt).toContain('used this source as context');
    expect(prompt).toContain('even if the answer did not cite it');
    expect(prompt).toContain('Copies in other notes and downloaded exports are not removed');
    expect(prompt).toContain('Export first');
    expect(prompt).toContain('cannot be undone');
    expect(prompt).not.toContain('cannot linger');
    if (action === 'delete') expect(prompt).toContain(source.title);
  });

  it('bounds desktop conversation height independently of the graph while preserving mobile layout', () => {
    const css = readFileSync(new URL('../app/brain/brain.module.css', import.meta.url), 'utf8');
    const desktop = css.split('@media (min-width: 1001px) {')[1]?.split('@media (min-width: 1800px)')[0];
    expect(desktop).toBeDefined();
    expect(desktop).toContain('.layout { overflow: clip; }');
    expect(desktop).toContain('position: sticky; top: 16px; align-self: start;');
    expect(desktop).toContain('max-height: calc(100dvh - 32px)');
    expect(desktop).toContain('.chatMessages { min-height: 0; max-height: none; flex: 1 1 0; }');
    expect(desktop).toContain('.chatHead, .conversationPicker, .composer { flex-shrink: 0; }');
    expect(css.split('@media (max-width: 690px)')[1]).not.toContain('position: sticky');
  });

  it('renders a private loading shell without inventing knowledge or AI availability', () => {
    const html = renderToStaticMarkup(createElement(BrainPage));
    expect(html).toContain('Making room for your thoughts.');
    expect(html).toContain('Loading your private library');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('localStorage');
    expect(html).not.toContain('AI is ready');
  });

  it('escapes model output and source citations and distinguishes source search', () => {
    const html = renderToStaticMarkup(createElement(BrainMessageCard, { entry: answer, onSource: () => undefined }));
    expect(html).toContain('SOURCE SEARCH · NOT AN AI-GENERATED ANSWER');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('Open source · version 2');
    const ai = renderToStaticMarkup(createElement(BrainMessageCard, { entry: { ...answer, mode: 'ollama' }, onSource: () => undefined }));
    expect(ai).toContain('LOCAL AI · CHECK THE SOURCES');
  });

  it('renders actual typed connections with an accessible list and transparent graph cap', () => {
    const html = renderToStaticMarkup(createElement(KnowledgeGraph, { snapshot, onSource: () => undefined }));
    expect(html).toContain('Knowledge graph, 2 sources and 1 CRM records');
    expect(html).toContain('Connections · accessible list');
    expect(html).toContain('My relationship');
    expect(html).toContain('Another thought');
    expect(html.match(/<line /g)).toHaveLength(2);
    expect(html).toContain('No inferred relationships');
    expect(html).toContain('30 sources and 12 records');
  });

  it('does not fill an empty graph with pretend knowledge', () => {
    const html = renderToStaticMarkup(createElement(KnowledgeGraph, { snapshot: { ...snapshot, sources: [], links: [], records: [] }, onSource: () => undefined }));
    expect(html).toContain('Capture your first note');
    expect(html).not.toContain('<svg');
  });
});

describe('private brain request client', () => {
  it('retains the exact operation ID after a transport failure without browser storage', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('Network failed')).mockResolvedValueOnce(ok({ deleted: true })).mockResolvedValueOnce(ok({ deleted: true }));
    const client = createBrainClient(fetcher);
    const payload = { action: 'source.delete', id: 'private-id', expectedVersion: 2 };
    await expect(client.post(payload)).rejects.toThrow('Network failed');
    await client.post(payload);
    await client.post(payload);
    const bodies = fetcher.mock.calls.map((call) => JSON.parse(call[1]?.body as string));
    expect(bodies[0].operationId).toBe(bodies[1].operationId);
    expect(bodies[2].operationId).not.toBe(bodies[1].operationId);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store', method: 'POST' });
  });

  it('keeps ambiguous 5xx and malformed-success operation IDs for safe retry', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Retry later', code: 'unavailable' } }), { status: 503 })).mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(ok({ enabled: true }));
    const client = createBrainClient(fetcher);
    const payload = { action: 'settings.update', enabled: true };
    await expect(client.post(payload)).rejects.toThrow('Retry later');
    await expect(client.post(payload)).rejects.toThrow('incomplete receipt');
    await client.post(payload);
    const ids = fetcher.mock.calls.map((call) => JSON.parse(call[1]?.body as string).operationId);
    expect(new Set(ids).size).toBe(1);
  });

  it('retains cancellation ID and forwards the caller abort signal', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new DOMException('Stopped', 'AbortError')).mockResolvedValueOnce(ok({ messages: [] }));
    const client = createBrainClient(fetcher);
    const payload = { action: 'ask', conversationId: 'one', question: 'What did I learn?', mode: 'search' };
    await expect(client.post(payload, controller.signal)).rejects.toThrow('Stopped');
    await client.post(payload);
    expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string).operationId).toBe(JSON.parse(fetcher.mock.calls[1][1]?.body as string).operationId);
  });

  it('retires rejected client requests and exposes conflict status without discarding the draft', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'The source changed.', code: 'version_conflict' } }), { status: 409 })).mockResolvedValueOnce(ok(source));
    const client = createBrainClient(fetcher);
    const payload = { action: 'source.save', ...sourceToDraft(source) };
    try { await client.post(payload); expect.unreachable(); } catch (error) { expect(error).toBeInstanceOf(BrainClientError); expect(error).toMatchObject({ status: 409, code: 'version_conflict' }); }
    expect(payload.body).toBe(source.body);
    await client.post(payload);
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string).operationId).not.toBe(JSON.parse(fetcher.mock.calls[1][1]?.body as string).operationId);
  });

  it('uses credentialed no-store GET for private reads and clears session retries on teardown', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(ok(snapshot)).mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(ok({ deleted: true }));
    const client = createBrainClient(fetcher);
    expect(await client.get()).toEqual(snapshot);
    expect(fetcher.mock.calls[0]).toEqual(['/api/v1/brain', expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' })]);
    await expect(client.post({ action: 'conversation.delete', id: 'one' })).rejects.toThrow();
    client.clear();
    await client.post({ action: 'conversation.delete', id: 'one' });
    expect(JSON.parse(fetcher.mock.calls[1][1]?.body as string).operationId).not.toBe(JSON.parse(fetcher.mock.calls[2][1]?.body as string).operationId);
  });
});

describe('knowledge portability and editor safety', () => {
  it('retains source version, links, and original text when preparing a write', () => {
    const draft = sourceToDraft(source);
    expect(draft).toMatchObject({ id: source.id, expectedVersion: 2, body: source.body, recordIds: ['record-a'], relatedSourceIds: ['source-b'] });
    expect(draft).not.toHaveProperty('indexedChunks');
    expect(sourceMarkdown(source)).toContain(source.body);
    expect(sourceMarkdown(source)).toContain('Source: https://example.org/article');
    expect(sourceMarkdown(source)).toContain('Tags: research');
    expect(downloadFilename('../../private<>: title')).toBe('private-title.md');
    expect(downloadFilename('🐻')).toBe('knowledge-note.md');
  });

  it('validates tag/link limits before posting and normalizes only tag whitespace', () => {
    const draft = sourceToDraft(source);
    expect(normalizedBrainDraft({ ...draft, tags: [' research ', '', 'research'] }).tags).toEqual(['research']);
    expect(() => normalizedBrainDraft({ ...draft, tags: Array.from({ length: 13 }, (_, index) => `${index}`) })).toThrow('12 tags');
    expect(() => normalizedBrainDraft({ ...draft, tags: ['a'.repeat(41)] })).toThrow('40 characters');
    expect(() => normalizedBrainDraft({ ...draft, recordIds: Array(13).fill('record') })).toThrow('12 sources');
    expect(() => normalizedBrainDraft({ ...draft, relatedSourceIds: Array(13).fill('source') })).toThrow('12 sources');
    expect(() => normalizedBrainDraft({ ...draft, body: 'a'.repeat(40001) })).toThrow('40,000');
    expect(() => normalizedBrainDraft({ ...draft, sourceUrl: 'javascript:alert(1)' })).toThrow('HTTP or HTTPS');
    expect(normalizedBrainDraft(draft).body).toBe(source.body);
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///private/key', ['https://', 'user', ':', 'synthetic-password', '@example.org/'].join(''), 'not-a-url', null])('never makes %s an executable source link', (url) => {
    expect(safeSourceUrl(url)).toBeUndefined();
  });

  it('allows ordinary HTTP(S) source attribution without fetching the page', () => {
    expect(safeSourceUrl('https://example.org/article')).toBe('https://example.org/article');
    expect(safeSourceUrl('http://example.org/article')).toBe('http://example.org/article');
  });

  it('appends new answer pairs and deduplicates replayed receipts without losing history', () => {
    const next = { ...answer, id: 'answer-b' };
    expect(appendBrainMessages([answer], [answer, next])).toEqual([answer, next]);
    expect(appendBrainMessages([answer, next], [answer, next])).toEqual([answer, next]);
  });
});
