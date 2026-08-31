import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeResetRequest, loadCloudSnapshot, prepareResetRequest, readPendingResetRequest, sendCommand, sendKernelCreate } from '@/lib/cloud-client';

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

describe('command transport retries', () => {
  it('reuses the exact caller key and body once after an ambiguous server failure', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'internal_error' } }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { id: 'record-1' }, replayed: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendCommand('record.create', { name: 'Northstar', objectType: 'company' }, 'stable-operation-key')).resolves.toMatchObject({
      ok: true,
      result: { id: 'record-1' },
      replayed: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0][1];
    const second = fetchMock.mock.calls[1][1];
    expect(new Headers(first?.headers).get('idempotency-key')).toBe('stable-operation-key');
    expect(new Headers(second?.headers).get('idempotency-key')).toBe('stable-operation-key');
    expect(second?.body).toBe(first?.body);
  });

  it('does not retry a definitive client error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'validation_error', message: 'Invalid' } }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendCommand('record.create', {}, 'stable-operation-key')).rejects.toThrow('Invalid');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps an implicit caller key across an ambiguous failure and clears it after success', async () => {
    const failure = () => new Response(JSON.stringify({ error: { code: 'internal_error', message: 'Unknown outcome' } }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
    const success = () => new Response(JSON.stringify({ ok: true, result: { id: 'record-1' }, replayed: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce(success())
      .mockResolvedValueOnce(success());
    vi.stubGlobal('fetch', fetchMock);
    const payload = { name: 'Ambiguous create', objectType: 'company' };

    await expect(sendCommand('record.create', payload)).rejects.toThrow('Unknown outcome');
    await expect(sendCommand('record.create', payload)).resolves.toMatchObject({ replayed: true });
    await expect(sendCommand('record.create', payload)).resolves.toMatchObject({ replayed: true });

    const keys = fetchMock.mock.calls.map((call) => new Headers(call[1]?.headers).get('idempotency-key'));
    expect(keys[0]).toBe(keys[1]);
    expect(keys[1]).toBe(keys[2]);
    expect(keys[3]).not.toBe(keys[2]);
  });
});

describe('kernel create transport retries', () => {
  it('reuses one caller key and exact body for automatic and manual ambiguous retries', async () => {
    const failure = () => new Response(JSON.stringify({ error: { code: 'internal_error', message: 'Unknown outcome' } }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
    const success = () => new Response(JSON.stringify({ data: { id: 'actor-1' }, replayed: true }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce(success())
      .mockResolvedValueOnce(success());
    vi.stubGlobal('fetch', fetchMock);
    const payload = { kind: 'human', displayName: 'Ada' };

    await expect(sendKernelCreate('actor.create', payload)).rejects.toThrow('Unknown outcome');
    await expect(sendKernelCreate('actor.create', payload)).resolves.toMatchObject({ data: { id: 'actor-1' }, replayed: true });
    await expect(sendKernelCreate('actor.create', payload)).resolves.toMatchObject({ data: { id: 'actor-1' }, replayed: true });

    const keys = fetchMock.mock.calls.map((call) => new Headers(call[1]?.headers).get('idempotency-key'));
    const bodies = fetchMock.mock.calls.map((call) => call[1]?.body);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[1]).toBe(keys[2]);
    expect(keys[3]).not.toBe(keys[2]);
    expect(bodies[0]).toBe(bodies[1]);
    expect(bodies[1]).toBe(bodies[2]);
    expect(JSON.parse(String(bodies[0]))).toEqual({ kind: 'human', displayName: 'Ada', operation: 'actor.create' });
  });

  it('recovers an unresolved key after reload without persisting the request payload', async () => {
    const sessionStorage = new MemoryStorage();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: new MemoryStorage(), sessionStorage } });
    const failure = () => new Response(JSON.stringify({ error: { code: 'internal_error', message: 'Unknown outcome' } }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'actor-1' }, replayed: true }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const payload = { kind: 'human', displayName: 'Sensitive display name' };

    await expect(sendKernelCreate('actor.create', payload)).rejects.toThrow('Unknown outcome');
    expect(sessionStorage.length).toBe(1);
    const persistedStorageKey = sessionStorage.key(0)!;
    const persistedValue = sessionStorage.getItem(persistedStorageKey)!;
    expect(`${persistedStorageKey}${persistedValue}`).not.toContain('Sensitive display name');
    expect(JSON.parse(persistedValue)).toEqual({ key: expect.any(String), createdAt: expect.any(Number) });

    vi.resetModules();
    const reloadedClient = await import('@/lib/cloud-client');
    await expect(reloadedClient.sendKernelCreate('actor.create', payload)).resolves.toMatchObject({ data: { id: 'actor-1' }, replayed: true });

    const keys = fetchMock.mock.calls.map((call) => new Headers(call[1]?.headers).get('idempotency-key'));
    expect(keys[0]).toBe(keys[1]);
    expect(keys[1]).toBe(keys[2]);
    expect(sessionStorage.length).toBe(0);
  });
});
