import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDocumentFile, uploadDocumentFile } from '@/lib/file-client';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('file mutation browser recovery keys', () => {
  const storage = new MemoryStorage();
  const originalWindow = globalThis.window;

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: storage },
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  });

  it('reuses an upload UUID after an ambiguous response and stores no file name or bytes', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Storage pending' } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { id: 'document-a' } }), { status: 201 }));
    const file = new File(['private customer contents'], 'customer-list.txt', {
      type: 'text/plain',
      lastModified: 1_777_777_777_000,
    });

    await expect(uploadDocumentFile('workspace-a', file)).rejects.toThrow('Storage pending');
    const stored = storage.getItem('free-crm.file-operations.v1:workspace-a');
    expect(stored).toBeTruthy();
    expect(stored).not.toContain('customer-list.txt');
    expect(stored).not.toContain('private customer contents');

    await expect(uploadDocumentFile('workspace-a', file)).resolves.toMatchObject({ ok: true });
    const operationKeys = fetchMock.mock.calls.map((call) => new Headers(call[1]?.headers).get('idempotency-key'));
    expect(new Set(operationKeys).size).toBe(1);
    expect(storage.getItem('free-crm.file-operations.v1:workspace-a')).toBe('[]');
  });

  it('reuses a delete UUID after an ambiguous server response', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Completion unknown' } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { id: 'document-a', deleted: true }, replayed: true }), { status: 200 }));

    await expect(deleteDocumentFile('workspace-a', 'document-a')).rejects.toThrow('Completion unknown');
    await expect(deleteDocumentFile('workspace-a', 'document-a')).resolves.toMatchObject({ result: { deleted: true } });
    const operationKeys = fetchMock.mock.calls.map((call) => new Headers(call[1]?.headers).get('idempotency-key'));
    expect(operationKeys[0]).toBe(operationKeys[1]);
  });
});
