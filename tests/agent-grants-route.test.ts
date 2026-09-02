import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  ensureWorkspace,
  getD1,
  getRequestIdentity,
  requireCapability,
  revokeAgentToolGrant,
  setAgentToolGrantExpiry,
} = vi.hoisted(() => ({
  ensureWorkspace: vi.fn(),
  getD1: vi.fn(),
  getRequestIdentity: vi.fn(),
  requireCapability: vi.fn(),
  revokeAgentToolGrant: vi.fn(),
  setAgentToolGrantExpiry: vi.fn(),
}));

vi.mock('@/db', () => ({ getD1 }));
vi.mock('@/server/agent-grants', () => ({ revokeAgentToolGrant, setAgentToolGrantExpiry }));
vi.mock('@/server/agent-plane', () => ({
  createAgent: vi.fn(),
  decideApproval: vi.fn(),
  executeAuthorizedRun: vi.fn(),
  proposeAgentAction: vi.fn(),
  setAgentSafety: vi.fn(),
}));
vi.mock('@/server/capabilities', () => ({ requireCapability }));
vi.mock('@/server/control-plane', () => ({ ensureWorkspace, loadControlPlane: vi.fn() }));
vi.mock('@/server/request-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/request-context')>();
  return { ...actual, getRequestIdentity };
});

import { POST } from '@/app/api/v1/agents/actions/route';

const identity = { userId: 'owner-a', email: 'owner@example.test', displayName: 'Owner', requestId: 'request-a', runtimeMode: 'device' };
const workspace = { workspaceId: 'workspace-a', workspace: { role: 'owner', profile: 'business' } };

function request(body: Record<string, unknown>, key = 'grant-mutation-key') {
  return new Request('https://freecrm.dev/api/v1/agents/actions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify(body),
  });
}

describe('agent grant action routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestIdentity.mockResolvedValue(identity);
    getD1.mockReturnValue({ database: 'synthetic' });
    ensureWorkspace.mockResolvedValue(workspace);
    requireCapability.mockResolvedValue({ enabled: true });
  });

  it('dispatches a canonical expiry update with the caller idempotency key', async () => {
    const expiresAt = '2099-01-01T00:00:00.000Z';
    setAgentToolGrantExpiry.mockResolvedValue({ agentId: 'agent-a', toolId: 'tool-a', expiresAt, status: 'updated', replayed: false });
    const body = { operation: 'grant.expiry.set', agentId: 'agent-a', toolId: 'tool-a', expiresAt };

    const response = await POST(request(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { agentId: 'agent-a', toolId: 'tool-a', expiresAt, status: 'updated', replayed: false } });
    expect(requireCapability).toHaveBeenCalledWith({ database: 'synthetic' }, workspace, 'agentPlane');
    expect(setAgentToolGrantExpiry).toHaveBeenCalledWith({ database: 'synthetic' }, identity, workspace, body, 'grant-mutation-key');
  });

  it('dispatches revocation through the same authenticated tenant boundary', async () => {
    revokeAgentToolGrant.mockResolvedValue({ agentId: 'agent-a', toolId: 'tool-a', status: 'revoked', replayed: false });
    const body = { operation: 'grant.revoke', agentId: 'agent-a', toolId: 'tool-a' };

    const response = await POST(request(body, 'revoke-key'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { agentId: 'agent-a', toolId: 'tool-a', status: 'revoked', replayed: false } });
    expect(revokeAgentToolGrant).toHaveBeenCalledWith({ database: 'synthetic' }, identity, workspace, body, 'revoke-key');
  });
});
