import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendIdempotentOperation } from '@/lib/idempotent-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

function apiResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('idempotent browser operations', () => {
  it('keeps one proposal key across an unresolved 5xx and later retry, then rotates after success', async () => {
    const calls: Array<{ key: string; body: Record<string, unknown> }> = [];
    const responses = [
      apiResponse(504, { error: { message: 'Unknown outcome' } }),
      apiResponse(504, { error: { message: 'Unknown outcome' } }),
      apiResponse(200, { data: { runId: 'run-1', replayed: true } }),
      apiResponse(200, { data: { runId: 'run-2', replayed: false } }),
    ];
    vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => {
      calls.push({ key: new Headers(init?.headers).get('idempotency-key') ?? '', body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return responses.shift()!;
    }));
    const payload = { operation: 'action.propose', agentId: 'agent-1', summary: 'Review relationships' };

    await expect(sendIdempotentOperation('/api/v1/agents/actions', payload, { keyInBody: 'idempotencyKey' })).rejects.toThrow('Unknown outcome');
    await expect(sendIdempotentOperation('/api/v1/agents/actions', payload, { keyInBody: 'idempotencyKey' })).resolves.toMatchObject({ runId: 'run-1', replayed: true });
    await expect(sendIdempotentOperation('/api/v1/agents/actions', payload, { keyInBody: 'idempotencyKey' })).resolves.toMatchObject({ runId: 'run-2', replayed: false });

    expect(new Set(calls.slice(0, 3).map((call) => call.key))).toHaveLength(1);
    expect(calls.slice(0, 3).every((call) => call.body.idempotencyKey === call.key)).toBe(true);
    expect(calls[3].key).not.toBe(calls[2].key);
  });

  it('sends connector keys only in the header and clears them after a definitive rejection', async () => {
    const keys: string[] = [];
    const bodies: Record<string, unknown>[] = [];
    const responses = [
      apiResponse(400, { error: { message: 'Rejected' } }),
      apiResponse(200, { data: { status: 'connected' } }),
    ];
    vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => {
      keys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return responses.shift()!;
    }));
    const payload = { operation: 'connect', connectorKey: 'csv' };

    await expect(sendIdempotentOperation('/api/v1/connectors', payload)).rejects.toThrow('Rejected');
    await expect(sendIdempotentOperation('/api/v1/connectors', payload)).resolves.toMatchObject({ status: 'connected' });

    expect(keys[1]).not.toBe(keys[0]);
    expect(bodies.every((body) => !('idempotencyKey' in body))).toBe(true);
  });

  it('recovers a key after reload from session storage without persisting request data', async () => {
    const values = new Map<string, string>();
    const sessionStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    } satisfies Storage;
    vi.stubGlobal('window', { sessionStorage });
    const keys: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => {
      keys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
      return apiResponse(503, { error: { message: 'Outcome unknown' } });
    }));
    const payload = { operation: 'connect', connectorKey: 'webhook-simulator', privateMarker: 'private-value-must-not-be-stored' };

    await expect(sendIdempotentOperation('/api/v1/connectors/reload-test', payload)).rejects.toThrow('Outcome unknown');
    const stored = values.get('free-crm.idempotency.v1') ?? '';
    expect(stored).not.toContain('private-value-must-not-be-stored');
    expect(stored).not.toContain('webhook-simulator');

    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => {
      keys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
      return apiResponse(200, { data: { status: 'connected', replayed: true } });
    }));
    const reloaded = await import('@/lib/idempotent-client');
    await expect(reloaded.sendIdempotentOperation('/api/v1/connectors/reload-test', payload)).resolves.toMatchObject({ replayed: true });
    expect(keys[1]).toBe(keys[0]);
  });

  it.each([
    ['empty', new Response(null, { status: 204 })],
    ['malformed', new Response('{truncated', { status: 200, headers: { 'content-type': 'application/json' } })],
    ['missing data', apiResponse(200, { ok: true })],
  ])('retains the key when a 2xx response is %s', async (_label, invalidResponse) => {
    const keys: string[] = [];
    const responses = [invalidResponse, apiResponse(200, { data: { status: 'connected', replayed: true } })];
    vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => {
      keys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
      return responses.shift()!;
    }));
    const payload = { operation: 'connect', connectorKey: `receipt-${_label}` };

    await expect(sendIdempotentOperation('/api/v1/connectors', payload)).rejects.toThrow('Outcome unknown');
    await expect(sendIdempotentOperation('/api/v1/connectors', payload)).resolves.toMatchObject({ replayed: true });
    expect(keys[1]).toBe(keys[0]);
  });
});
