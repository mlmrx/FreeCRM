import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeResetRequest, loadCloudSnapshot, prepareResetRequest, readPendingResetRequest } from '@/lib/cloud-client';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function installWindow(storage: Storage) {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
  vi.unstubAllGlobals();
});

describe('durable browser reset requests', () => {
  it('reuses the operation and HTTP idempotency key only for an explicit resume', () => {
    installWindow(new MemoryStorage());
    const first = prepareResetRequest('workspace-a', 'clean');
    const fresh = prepareResetRequest('workspace-a', 'clean');
    expect(fresh.operationId).not.toBe(first.operationId);

    const resumed = prepareResetRequest('workspace-a', 'clean', fresh.operationId);
    expect(resumed).toEqual(fresh);
    expect(readPendingResetRequest('workspace-a')).toEqual(fresh);
  });

  it('clears only the matching completed operation', () => {
    installWindow(new MemoryStorage());
    const pending = prepareResetRequest('workspace-a', 'demo');
    completeResetRequest('workspace-a', crypto.randomUUID());
    expect(readPendingResetRequest('workspace-a')).toEqual(pending);
    completeResetRequest('workspace-a', pending.operationId);
    expect(readPendingResetRequest('workspace-a')).toBeNull();
  });

  it('continues past malformed entries when finding an operation before bootstrap', () => {
    const storage = new MemoryStorage();
    installWindow(storage);
    storage.setItem('free-crm.reset.v1:broken', '{');
    const pending = prepareResetRequest('workspace-a', 'clean');
    expect(readPendingResetRequest()).toEqual(pending);
  });

  it('still prepares a reset when browser storage is unavailable', () => {
    const unavailable = {
      length: 0,
      clear: () => { throw new Error('unavailable'); },
      getItem: () => { throw new Error('unavailable'); },
      key: () => null,
      removeItem: () => { throw new Error('unavailable'); },
      setItem: () => { throw new Error('unavailable'); },
    } satisfies Storage;
    installWindow(unavailable);
    expect(() => prepareResetRequest('workspace-a', 'clean')).not.toThrow();
  });

  it('requests the exact receipt after an interrupted reset even when storage is unavailable', async () => {
    const unavailable = {
      length: 0,
      clear: () => { throw new Error('unavailable'); },
      getItem: () => { throw new Error('unavailable'); },
      key: () => null,
      removeItem: () => { throw new Error('unavailable'); },
      setItem: () => { throw new Error('unavailable'); },
    } satisfies Storage;
    installWindow(unavailable);
    const operationId = crypto.randomUUID();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { resetReceipt: { operationId } } }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadCloudSnapshot({ resetOperationId: operationId })).resolves.toMatchObject({ resetReceipt: { operationId } });

    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/bootstrap?resetOperationId=${operationId}`, expect.objectContaining({ cache: 'no-store' }));
  });

  it('asks bootstrap for the exact pending operation receipt', async () => {
    installWindow(new MemoryStorage());
    const pending = prepareResetRequest('workspace-a', 'clean');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: {} }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await loadCloudSnapshot();

    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/bootstrap?resetOperationId=${pending.operationId}`, expect.objectContaining({ cache: 'no-store' }));
  });
});
