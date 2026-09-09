import type { BrainSaveInput, BrainSource } from './brain-types';

export class BrainClientError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}

/** Private request bodies live only for this mounted session, never in browser storage. */
export function createBrainClient(fetcher: typeof fetch = fetch) {
  const pending = new Map<string, string>();
  async function request<T>(query = '', init?: RequestInit): Promise<T> {
    const response = await fetcher(`/api/v1/brain${query}`, { credentials: 'same-origin', cache: 'no-store', ...init });
    const json = await response.json() as { data?: T; error?: { message?: string; code?: string } | string } | null;
    if (!response.ok) {
      const error = typeof json?.error === 'object' ? json.error : undefined;
      throw new BrainClientError(error?.message ?? (typeof json?.error === 'string' ? json.error : 'The request could not be completed.'), response.status, error?.code ?? 'request_failed');
    }
    if (!json || typeof json.data !== 'object' || !json.data) throw new Error('The server returned an incomplete receipt. Outcome unknown; retry this exact action.');
    return json.data;
  }
  return {
    get: <T>(query = '', signal?: AbortSignal) => request<T>(query, { signal }),
    async post<T>(payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
      const key = JSON.stringify(payload);
      let operationId = pending.get(key);
      if (!operationId) {
        if (pending.size >= 64) throw new Error('Too many unresolved requests. Reload after checking that your work was saved.');
        operationId = crypto.randomUUID();
        pending.set(key, operationId);
      }
      try {
        const data = await request<T>('', { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, operationId }) });
        pending.delete(key);
        return data;
      } catch (error) {
        // A received client rejection is definitive; network failures and 5xx may have committed.
        if (error instanceof BrainClientError && error.status >= 400 && error.status < 500) pending.delete(key);
        throw error;
      }
    },
    clear: () => pending.clear(),
  };
}

export function sourceToDraft(source: BrainSource): BrainSaveInput {
  return { id: source.id, expectedVersion: source.version, title: source.title, body: source.body, kind: source.kind, sourceUrl: source.sourceUrl, tags: source.tags, pinned: source.pinned, recordIds: source.recordIds, relatedSourceIds: source.relatedSourceIds };
}

export function normalizedBrainDraft(draft: BrainSaveInput): BrainSaveInput {
  const tags = [...new Set(draft.tags.map((tag) => tag.trim()).filter(Boolean))];
  if (tags.length > 12 || tags.some((tag) => tag.length > 40)) throw new Error('Use up to 12 tags, each at most 40 characters.');
  if (draft.recordIds.length > 12 || draft.relatedSourceIds.length > 12) throw new Error('Connect up to 12 sources and 12 CRM records per note.');
  if (!draft.title.trim() || draft.title.length > 200 || !draft.body.trim() || draft.body.length > 40000) throw new Error('Add a title (up to 200 characters) and text (up to 40,000 characters).');
  if (draft.sourceUrl && !safeSourceUrl(draft.sourceUrl)) throw new Error('Use an HTTP or HTTPS source URL without embedded credentials.');
  return { ...draft, tags };
}

export function appendBrainMessages(current: import('./brain-types').BrainMessage[], received: import('./brain-types').BrainMessage[]) {
  const existing = new Set(current.map((entry) => entry.id));
  return [...current, ...received.filter((entry) => !existing.has(entry.id))];
}

export function sourceMarkdown(source: BrainSource | BrainSaveInput): string {
  return `# ${source.title}\n\n${source.sourceUrl ? `Source: ${source.sourceUrl}\n\n` : ''}${source.tags.length ? `Tags: ${source.tags.join(', ')}\n\n` : ''}${source.body}\n`;
}

export function downloadFilename(title: string): string {
  return `${title.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'knowledge-note'}.md`;
}

export function safeSourceUrl(value: string | null | undefined): string | undefined {
  try {
    const url = new URL(value ?? '');
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
