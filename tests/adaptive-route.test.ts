import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from './cloudflare-workers-stub';

const mocks = vi.hoisted(() => ({ getD1: vi.fn(), ensureWorkspace: vi.fn(), readAdaptiveSnapshot: vi.fn(), exportAdaptive: vi.fn(), mutateAdaptive: vi.fn() }));
vi.mock('@/db', () => ({ getD1: mocks.getD1 }));
vi.mock('@/server/control-plane', () => ({ ensureWorkspace: mocks.ensureWorkspace }));
vi.mock('@/server/adaptive', async (original) => ({ ...await original<typeof import('@/server/adaptive')>(), readAdaptiveSnapshot: mocks.readAdaptiveSnapshot, exportAdaptive: mocks.exportAdaptive, mutateAdaptive: mocks.mutateAdaptive }));
import { GET, POST } from '@/app/api/v1/adaptive/route';
import { ApiError } from '@/server/request-context';

const db = { synthetic: true };
const context = { workspaceId: 'caller-workspace', workspace: { role: 'owner' } };
function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://127.0.0.1:3477/api/v1/adaptive', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3477', ...headers }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.clearAllMocks(); for (const key of Object.keys(env)) delete env[key as keyof typeof env];
  env.FREE_CRM_LOCAL_MODE = 'true'; mocks.getD1.mockReturnValue(db); mocks.ensureWorkspace.mockResolvedValue(context);
  mocks.readAdaptiveSnapshot.mockResolvedValue({ signals: [] }); mocks.exportAdaptive.mockResolvedValue({ format: 'free-crm-adaptive' }); mocks.mutateAdaptive.mockResolvedValue({ done: true });
});
afterEach(() => { for (const key of Object.keys(env)) delete env[key as keyof typeof env]; });

describe('adaptive route identity, privacy and mutation boundaries', () => {
  it('keeps locked deployments sealed before any database or export access', async () => {
    delete env.FREE_CRM_LOCAL_MODE; env.FREE_CRM_AUTH_MODE = 'locked';
    const response = await GET(new Request('https://freecrm.dev/api/v1/adaptive?export=json'));
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ error: { code: 'deployment_locked' } });
    expect(mocks.getD1).not.toHaveBeenCalled(); expect(mocks.exportAdaptive).not.toHaveBeenCalled();
  });
  it('rejects non-loopback hosts in device mode', async () => {
    const response = await GET(new Request('https://freecrm.dev/api/v1/adaptive'));
    expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ error: { code: 'local_mode_denied' } }); expect(mocks.getD1).not.toHaveBeenCalled();
  });
  it('rejects forged cloud identity headers', async () => {
    delete env.FREE_CRM_LOCAL_MODE;
    Object.assign(env, { FREE_CRM_AUTH_MODE: 'cloudflare-access', FREE_CRM_ACCESS_TEAM_DOMAIN: 'synthetic.cloudflareaccess.com', FREE_CRM_ACCESS_AUD: 'synthetic_audience', FREE_CRM_OWNER_EMAIL: 'owner@example.test' });
    const response = await GET(new Request('https://freecrm.dev/api/v1/adaptive', { headers: { 'x-user-email': 'owner@example.test', 'cf-access-authenticated-user-email': 'owner@example.test' } }));
    expect(response.status).toBe(401); expect(mocks.getD1).not.toHaveBeenCalled();
  });
  it.each([{ origin: 'https://attacker.example' }, { 'sec-fetch-site': 'cross-site' }] as Record<string, string>[])('rejects cross-site mutation before storage or dispatch', async (headers) => {
    const response = await POST(post({ action: 'settings.update' }, headers));
    expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ error: { code: 'cross_site_request_denied' } });
    expect(mocks.getD1).not.toHaveBeenCalled(); expect(mocks.ensureWorkspace).not.toHaveBeenCalled(); expect(mocks.mutateAdaptive).not.toHaveBeenCalled();
  });
  it('rejects unsupported, oversized and non-object bodies before reading storage', async () => {
    expect((await POST(post({ action: 'ask' }, { 'content-type': 'text/plain' }))).status).toBe(415);
    expect((await POST(post({ question: 'x'.repeat(16_001) }))).status).toBe(413);
    expect((await POST(post([]))).status).toBe(400); expect(mocks.getD1).not.toHaveBeenCalled();
  });
  it('uses authenticated tenant scope and private response headers', async () => {
    const response = await GET(new Request('http://127.0.0.1:3477/api/v1/adaptive?workspaceId=foreign'));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ data: { signals: [] } });
    expect(mocks.readAdaptiveSnapshot).toHaveBeenCalledWith(db, context, expect.objectContaining({ userId: 'local-development-user', runtimeMode: 'device' }));
    expect(response.headers.get('cache-control')).toBe('no-store'); expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('exports only through the authenticated service and marks the response as a private download', async () => {
    const response = await GET(new Request('http://127.0.0.1:3477/api/v1/adaptive?export=json&workspaceId=foreign'));
    expect(mocks.exportAdaptive).toHaveBeenCalledWith(db, context, expect.objectContaining({ runtimeMode: 'device' })); expect(mocks.readAdaptiveSnapshot).not.toHaveBeenCalled();
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="free-crm-adaptive.json"'); expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('passes request cancellation and real identity to mutations', async () => {
    const body = { action: 'followup.create', workspaceId: 'foreign', userId: 'forged', operationId: crypto.randomUUID() }; const request = post(body);
    expect((await POST(request)).status).toBe(200);
    expect(mocks.mutateAdaptive).toHaveBeenCalledWith(db, context, expect.objectContaining({ userId: 'local-development-user' }), body, request.signal);
  });
  it('rejects unknown roles before reading or mutating adaptive state', async () => {
    mocks.ensureWorkspace.mockResolvedValue({ workspaceId: 'caller-workspace', workspace: { role: 'unknown' } });
    expect((await GET(new Request('http://127.0.0.1:3477/api/v1/adaptive'))).status).toBe(403);
    expect((await POST(post({ action: 'ask' }))).status).toBe(403); expect(mocks.readAdaptiveSnapshot).not.toHaveBeenCalled(); expect(mocks.mutateAdaptive).not.toHaveBeenCalled();
  });
  it.each(['adaptive_write_conflict', 'adaptive_capacity_releases_bytes'])('normalizes %s database failures without exposing SQL', async (failure) => {
    mocks.mutateAdaptive.mockRejectedValueOnce(new Error(`CHECK constraint failed: ${failure}`));
    const response = await POST(post({ action: 'refresh' })); expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: failure.includes('capacity') ? 'adaptive_capacity' : 'adaptive_write_conflict' } });
  });
  it('returns safe missing-resource errors from the service', async () => {
    mocks.mutateAdaptive.mockRejectedValueOnce(new ApiError(404, 'release_not_found', 'This release is unavailable.'));
    const response = await POST(post({ action: 'proposal.create' })); expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'release_not_found', message: 'This release is unavailable.' } });
  });
});
