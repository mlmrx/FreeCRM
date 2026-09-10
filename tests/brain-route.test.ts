import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from './cloudflare-workers-stub';

const mocks = vi.hoisted(() => ({
  getD1: vi.fn(), ensureWorkspace: vi.fn(), readBrainSnapshot: vi.fn(), readBrainSource: vi.fn(), readBrainConversation: vi.fn(), searchBrain: vi.fn(), exportBrain: vi.fn(), mutateBrain: vi.fn(),
}));
vi.mock('@/db', () => ({ getD1: mocks.getD1 }));
vi.mock('@/server/control-plane', () => ({ ensureWorkspace: mocks.ensureWorkspace }));
vi.mock('@/server/brain', async (original) => ({ ...await original<typeof import('@/server/brain')>(), ...Object.fromEntries(Object.entries(mocks).filter(([name]) => !['getD1', 'ensureWorkspace'].includes(name))) }));

import { GET, POST } from '@/app/api/v1/brain/route';
import { ApiError } from '@/server/request-context';

const db = { synthetic: true };
const context = { workspaceId: 'caller-workspace', workspace: { role: 'owner' } };
const sourceId = '34b7773f-8777-4bee-94bb-59a751d30f59';

function post(body: unknown, headers: Record<string, string> = {}, url = 'http://127.0.0.1:3477/api/v1/brain') {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', origin: new URL(url).origin, ...headers }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(env)) delete env[key as keyof typeof env];
  env.FREE_CRM_LOCAL_MODE = 'true';
  mocks.getD1.mockReturnValue(db);
  mocks.ensureWorkspace.mockResolvedValue(context);
  mocks.readBrainSnapshot.mockResolvedValue({ sources: [] });
  mocks.readBrainSource.mockResolvedValue({ id: sourceId });
  mocks.readBrainConversation.mockResolvedValue({ messages: [] });
  mocks.searchBrain.mockResolvedValue({ mode: 'keyword', passages: [] });
  mocks.exportBrain.mockResolvedValue({ format: 'free-crm-second-brain' });
  mocks.mutateBrain.mockResolvedValue({ ok: true });
});

afterEach(() => { for (const key of Object.keys(env)) delete env[key as keyof typeof env]; });

describe('second brain route identity and CSRF boundaries', () => {
  it('authenticates every GET before database access and keeps locked deployments sealed', async () => {
    delete env.FREE_CRM_LOCAL_MODE;
    env.FREE_CRM_AUTH_MODE = 'locked';
    const response = await GET(new Request('https://freecrm.dev/api/v1/brain?export=1'));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'deployment_locked' } });
    expect(mocks.getD1).not.toHaveBeenCalled();
    expect(mocks.exportBrain).not.toHaveBeenCalled();
  });

  it('rejects non-loopback hosts in device mode before reading private data', async () => {
    const response = await GET(new Request('https://freecrm.dev/api/v1/brain'));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'local_mode_denied' } });
    expect(mocks.getD1).not.toHaveBeenCalled();
  });

  it('requires configured cloud identity rather than accepting forged owner headers', async () => {
    delete env.FREE_CRM_LOCAL_MODE;
    Object.assign(env, { FREE_CRM_AUTH_MODE: 'cloudflare-access', FREE_CRM_ACCESS_TEAM_DOMAIN: 'synthetic.cloudflareaccess.com', FREE_CRM_ACCESS_AUD: 'synthetic_audience', FREE_CRM_OWNER_EMAIL: 'owner@example.test' });
    const response = await GET(new Request('https://freecrm.dev/api/v1/brain', { headers: { 'x-user-email': 'owner@example.test', 'cf-access-authenticated-user-email': 'owner@example.test' } }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'authentication_required' } });
    expect(mocks.getD1).not.toHaveBeenCalled();
  });

  it.each([
    { origin: 'https://attacker.example' },
    { 'sec-fetch-site': 'cross-site' },
  ] as Record<string, string>[])('rejects cross-site POST before identity, storage and model dispatch', async (headers) => {
    const response = await POST(post({ action: 'settings.update', enabled: true }, headers));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'cross_site_request_denied' } });
    expect(mocks.getD1).not.toHaveBeenCalled();
    expect(mocks.ensureWorkspace).not.toHaveBeenCalled();
    expect(mocks.mutateBrain).not.toHaveBeenCalled();
  });

  it('rejects a simple form content type and oversized or non-object bodies before storage', async () => {
    const wrongType = await POST(post({ action: 'ask' }, { 'content-type': 'text/plain' }));
    expect(wrongType.status).toBe(415);
    const oversized = await POST(post({ body: 'x'.repeat(256_001) }));
    expect(oversized.status).toBe(413);
    const array = await POST(post([]));
    expect(array.status).toBe(400);
    expect(mocks.getD1).not.toHaveBeenCalled();
  });

  it('uses authenticated tenant context, ignores caller-supplied workspace selection, and sends no-store headers', async () => {
    const response = await GET(new Request(`http://127.0.0.1:3477/api/v1/brain?sourceId=${sourceId}&workspaceId=foreign-workspace`));
    expect(response.status).toBe(200);
    expect(mocks.readBrainSource).toHaveBeenCalledWith(db, 'caller-workspace', sourceId);
    expect(mocks.ensureWorkspace).toHaveBeenCalledWith(db, expect.objectContaining({ userId: 'local-development-user', runtimeMode: 'device' }));
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('dispatches search, conversation and export through the same owner scope', async () => {
    await GET(new Request('http://127.0.0.1:3477/api/v1/brain?search=launch&workspaceId=foreign'));
    expect(mocks.searchBrain).toHaveBeenCalledWith(db, 'caller-workspace', 'launch');
    await GET(new Request(`http://127.0.0.1:3477/api/v1/brain?conversationId=${sourceId}&workspaceId=foreign`));
    expect(mocks.readBrainConversation).toHaveBeenCalledWith(db, 'caller-workspace', sourceId);
    const exported = await GET(new Request('http://127.0.0.1:3477/api/v1/brain?export=1&workspaceId=foreign'));
    expect(mocks.exportBrain).toHaveBeenCalledWith(db, context, expect.objectContaining({ runtimeMode: 'device' }));
    expect(exported.headers.get('content-disposition')).toBe('attachment; filename="free-crm-second-brain.json"');
    expect(exported.headers.get('cache-control')).toBe('no-store');
  });

  it('passes the request abort signal and authenticated context to mutations, not caller identities', async () => {
    const body = { action: 'ask', workspaceId: 'foreign', userId: 'forged', operationId: sourceId };
    const request = post(body);
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.mutateBrain).toHaveBeenCalledWith(db, context, expect.objectContaining({ userId: 'local-development-user' }), body, request.signal);
  });

  it('denies an unrecognized role and safely returns missing foreign resources', async () => {
    mocks.ensureWorkspace.mockResolvedValueOnce({ workspaceId: 'caller-workspace', workspace: { role: 'unknown' } });
    expect((await GET(new Request('http://127.0.0.1:3477/api/v1/brain'))).status).toBe(403);
    expect(mocks.readBrainSnapshot).not.toHaveBeenCalled();
    mocks.readBrainSource.mockRejectedValueOnce(new ApiError(404, 'source_not_found', 'This knowledge source no longer exists.'));
    const missing = await GET(new Request(`http://127.0.0.1:3477/api/v1/brain?sourceId=${sourceId}`));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: { code: 'source_not_found', message: 'This knowledge source no longer exists.', details: null } });
  });

  it('validates resource identifiers and normalizes write-conflict errors without exposing SQL', async () => {
    expect((await GET(new Request('http://127.0.0.1:3477/api/v1/brain?sourceId=not-a-uuid'))).status).toBe(400);
    expect(mocks.readBrainSource).not.toHaveBeenCalled();
    mocks.mutateBrain.mockRejectedValueOnce(new Error('CHECK constraint failed: brain_write_conflict'));
    const conflict = await POST(post({ action: 'source.save' }));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: 'brain_write_conflict' } });
  });
});
