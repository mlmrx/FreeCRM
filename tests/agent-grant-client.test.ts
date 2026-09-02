import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isAgentToolGrantUsable,
  renewedAgentGrantExpiry,
  revokeAgentToolGrant,
  setAgentToolGrantExpiry,
} from '@/lib/agent-grant-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

function response(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('agent grant browser client', () => {
  it('calculates a canonical 30-day renewal and fails closed on invalid expiry state', () => {
    const now = Date.parse('2026-09-01T12:00:00.000Z');
    expect(renewedAgentGrantExpiry(now)).toBe('2026-10-01T12:00:00.000Z');
    expect(isAgentToolGrantUsable({ enabled: true, expiresAt: null }, now)).toBe(true);
    expect(isAgentToolGrantUsable({ enabled: true, expiresAt: '2026-09-01T12:00:00.001Z' }, now)).toBe(true);
    expect(isAgentToolGrantUsable({ enabled: true, expiresAt: '2026-09-01T12:00:00.000Z' }, now)).toBe(false);
    expect(isAgentToolGrantUsable({ enabled: true, expiresAt: 'invalid' }, now)).toBe(false);
    expect(isAgentToolGrantUsable({ enabled: false, expiresAt: null }, now)).toBe(false);
  });

  it('sends expiry and revoke operations with idempotency keys and validates their receipts', async () => {
    const calls: Array<{ key: string; body: Record<string, unknown> }> = [];
    const expiresAt = '2026-10-01T12:00:00.000Z';
    const replies = [
      response({ agentId: 'agent-a', toolId: 'tool-a', expiresAt, status: 'updated', replayed: false }),
      response({ agentId: 'agent-a', toolId: 'tool-a', status: 'revoked', replayed: false }),
    ];
    vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => {
      calls.push({ key: new Headers(init?.headers).get('idempotency-key') ?? '', body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return replies.shift()!;
    }));

    await expect(setAgentToolGrantExpiry('agent-a', 'tool-a', expiresAt)).resolves.toMatchObject({ status: 'updated' });
    await expect(revokeAgentToolGrant('agent-a', 'tool-a')).resolves.toMatchObject({ status: 'revoked' });
    expect(calls.every((call) => /^[0-9a-f-]{36}$/i.test(call.key))).toBe(true);
    expect(calls.map((call) => call.body.operation)).toEqual(['grant.expiry.set', 'grant.revoke']);
  });

  it('retains the expiry mutation key when a 2xx receipt does not match the requested grant', async () => {
    const keys: string[] = [];
    const expiresAt = '2026-10-01T12:00:00.000Z';
    const replies = [
      response({ agentId: 'another-agent', toolId: 'tool-a', expiresAt, status: 'updated', replayed: false }),
      response({ agentId: 'agent-a', toolId: 'tool-a', expiresAt, status: 'updated', replayed: true }),
    ];
    vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => {
      keys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
      return replies.shift()!;
    }));

    await expect(setAgentToolGrantExpiry('agent-a', 'tool-a', expiresAt)).rejects.toThrow('Outcome unknown');
    await expect(setAgentToolGrantExpiry('agent-a', 'tool-a', expiresAt)).resolves.toMatchObject({ replayed: true });
    expect(keys[1]).toBe(keys[0]);
  });
});
