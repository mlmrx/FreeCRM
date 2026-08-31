import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createActor, createRelationship, createTimelineActivity, createWorkObject, ensureWorkspace, getD1, getRequestIdentity } = vi.hoisted(() => ({
  createActor: vi.fn(),
  createRelationship: vi.fn(),
  createTimelineActivity: vi.fn(),
  createWorkObject: vi.fn(),
  ensureWorkspace: vi.fn(),
  getD1: vi.fn(),
  getRequestIdentity: vi.fn(),
}));

vi.mock('@/db', () => ({ getD1 }));
vi.mock('@/server/control-plane', () => ({ ensureWorkspace }));
vi.mock('@/server/crm-kernel', () => ({ createActor, createRelationship, createTimelineActivity, createWorkObject, loadKernel: vi.fn() }));
vi.mock('@/server/request-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/request-context')>();
  return { ...actual, getRequestIdentity };
});

import { POST } from '@/app/api/v1/kernel/route';

describe('CRM kernel POST route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestIdentity.mockResolvedValue({ userId: 'owner-a' });
    getD1.mockReturnValue({});
    ensureWorkspace.mockResolvedValue({ workspaceId: 'workspace-a' });
    createActor.mockResolvedValue({ data: { id: 'actor-a' }, replayed: false });
  });

  it('requires a caller key before opening the tenant database', async () => {
    const response = await POST(new Request('https://freecrm.dev/api/v1/kernel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'actor.create', kind: 'human', displayName: 'Ada' }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'idempotency_key_required' } });
    expect(getD1).not.toHaveBeenCalled();
    expect(ensureWorkspace).not.toHaveBeenCalled();
    expect(createActor).not.toHaveBeenCalled();
  });

  it('passes one stable body and caller key through to the atomic kernel service', async () => {
    const body = { operation: 'actor.create', kind: 'human', displayName: 'Ada' };
    const response = await POST(new Request('https://freecrm.dev/api/v1/kernel', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'stable-key' },
      body: JSON.stringify(body),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ data: { id: 'actor-a' }, replayed: false });
    expect(createActor).toHaveBeenCalledWith({}, expect.objectContaining({ userId: 'owner-a' }), { workspaceId: 'workspace-a' }, body, {
      key: 'stable-key',
      requestBody: JSON.stringify(body),
    });
  });
});
