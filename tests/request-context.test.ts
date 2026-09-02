import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  ApiError,
  errorResponse,
  getRequestIdentity,
  normalizeAccessTeamDomain,
  readJsonObject,
  requireActivatedRuntime,
  requireMachineWebhookIngress,
  requireSafeMutation,
} from '@/server/request-context';

const managedKeys = [
  'FREE_CRM_LOCAL_MODE',
  'FREE_CRM_AUTH_MODE',
  'FREE_CRM_ACCESS_TEAM_DOMAIN',
  'FREE_CRM_ACCESS_AUD',
  'FREE_CRM_OWNER_EMAIL',
] as const;

afterEach(() => {
  for (const key of managedKeys) delete env[key];
  vi.restoreAllMocks();
});

describe('request identity boundaries', () => {
  it('uses a fixed owner locally and ignores spoofed identity headers', async () => {
    env.FREE_CRM_LOCAL_MODE = 'true';
    const identity = await getRequestIdentity(new Request('http://127.0.0.1:3477/api/v1/bootstrap', {
      headers: {
        'oai-authenticated-user-id': 'attacker',
        'oai-authenticated-user-email': 'attacker@example.test',
      },
    }));
    expect(identity).toMatchObject({ userId: 'local-development-user', email: 'owner@free-crm.local', runtimeMode: 'device' });
    await expect(getRequestIdentity(new Request('https://crm.example.test/api/v1/bootstrap'))).rejects.toMatchObject({
      status: 403,
      code: 'local_mode_denied',
    });
  });

  it('accepts only the configured Cloudflare Access owner', async () => {
    env.FREE_CRM_AUTH_MODE = 'cloudflare-access';
    env.FREE_CRM_ACCESS_TEAM_DOMAIN = 'free-crm.cloudflareaccess.com';
    env.FREE_CRM_ACCESS_AUD = 'audience_123';
    env.FREE_CRM_OWNER_EMAIL = 'owner@example.test';
    const request = new Request('https://crm.example.test/api/v1/bootstrap', {
      headers: { 'cf-access-jwt-assertion': 'synthetic-token' },
    });
    const identity = await getRequestIdentity(request, async () => ({
      sub: 'stable-provider-subject',
      email: 'OWNER@example.test',
      name: 'Owner',
    }));
    expect(identity.email).toBe('owner@example.test');
    expect(identity.userId).toMatch(/^cloudflare:[0-9a-f]{64}$/);
    expect(identity.runtimeMode).toBe('cloudflare-access');

    await expect(getRequestIdentity(request, async () => ({
      sub: 'another-subject',
      email: 'other@example.test',
    }))).rejects.toMatchObject({ status: 403, code: 'access_denied' });
  });

  it('normalizes only HTTPS Cloudflare Access team domains', () => {
    expect(normalizeAccessTeamDomain('TEAM.cloudflareaccess.com')).toBe('https://team.cloudflareaccess.com');
    for (const invalid of ['http://team.cloudflareaccess.com', 'https://team.example.test', 'https://user@team.cloudflareaccess.com']) {
      expect(() => normalizeAccessTeamDomain(invalid)).toThrow(ApiError);
    }
  });
});

describe('mutation and JSON request fences', () => {
  it('accepts same-origin JSON and rejects cross-site, cross-origin, and wrong content types', async () => {
    await expect(requireSafeMutation(new Request('https://crm.example.test/api/v1/commands', {
      method: 'POST',
      headers: { origin: 'https://crm.example.test', 'content-type': 'application/json; charset=utf-8' },
    }), 'application/json')).resolves.toBeUndefined();
    await expect(requireSafeMutation(new Request('https://crm.example.test/api/v1/commands', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' },
    }), 'application/json')).rejects.toMatchObject({ code: 'cross_site_request_denied' });
    const crossOriginRequest = new Request('https://crm.example.test/api/v1/commands', {
      method: 'POST',
      headers: { origin: 'https://attacker.example.test', 'content-type': 'application/json' },
      body: '{"operation":"blocked"}',
    });
    await expect(requireSafeMutation(crossOriginRequest, 'application/json')).rejects.toMatchObject({ code: 'cross_site_request_denied' });
    expect(crossOriginRequest.bodyUsed).toBe(true);
    await expect(requireSafeMutation(new Request('https://crm.example.test/api/v1/commands', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
    }), 'application/json')).rejects.toMatchObject({ code: 'content_type_required' });
    const bodylessMutation = new Request('https://crm.example.test/api/v1/files?id=document', {
      method: 'DELETE',
      body: 'unexpected',
    });
    await expect(requireSafeMutation(bodylessMutation)).resolves.toBeUndefined();
    expect(bodylessMutation.bodyUsed).toBe(true);
  });

  it('rejects malformed, non-object, and oversized JSON bodies', async () => {
    await expect(readJsonObject(new Request('https://crm.example.test', { method: 'POST', body: '{' }))).rejects.toMatchObject({ code: 'invalid_json' });
    await expect(readJsonObject(new Request('https://crm.example.test', { method: 'POST', body: '[]' }))).rejects.toMatchObject({ code: 'invalid_payload' });
    const oversizedRequest = new Request('https://crm.example.test', {
      method: 'POST',
      headers: { 'content-length': '100' },
      body: '{}',
    });
    await expect(readJsonObject(oversizedRequest, 10)).rejects.toMatchObject({ code: 'request_too_large' });
    expect(oversizedRequest.bodyUsed).toBe(true);
  });

  it.each([
    ['without Content-Length', undefined],
    ['with an under-reported Content-Length', '2'],
  ])('cancels an oversized chunked JSON body %s', async (_label, contentLength) => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('12345678'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const headers = new Headers({ 'content-type': 'application/json' });
    if (contentLength) headers.set('content-length', contentLength);
    const request = new Request('https://crm.example.test', {
      method: 'POST',
      headers,
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    await expect(readJsonObject(request, 10)).rejects.toMatchObject({ status: 413, code: 'request_too_large' });
    expect(cancelled).toBe(true);
    expect(request.bodyUsed).toBe(true);
  });

  it('keeps sealed runtimes closed and maps concurrency errors without leaking SQL', async () => {
    await expect(requireActivatedRuntime()).rejects.toMatchObject({ code: 'deployment_locked' });
    const stale = errorResponse(new Error('UNIQUE constraint failed: record_mutation_claims.workspace_id'));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: 'stale_record' } });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const internal = errorResponse(new Error('database password should never be returned'));
    expect(await internal.json()).toEqual({ error: { code: 'internal_error', message: 'The request could not be completed.' } });
  });

  it('keeps native Vercel machine webhooks outside the data plane', () => {
    expect(() => requireMachineWebhookIngress('authjs')).toThrowError(expect.objectContaining({
      status: 503,
      code: 'webhook_ingress_unavailable',
    }));
    expect(() => requireMachineWebhookIngress('device')).not.toThrow();
    expect(() => requireMachineWebhookIngress('cloudflare-access')).not.toThrow();
  });
});
