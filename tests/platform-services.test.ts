import { describe, expect, it } from 'vitest';
import { createAgent, decideApproval, executeAuthorizedRun, proposeAgentAction, setAgentSafety } from '@/server/agent-plane';
import { connectSimulator } from '@/server/connectors';
import { getWorkspaceCapabilities, requireCapability } from '@/server/capabilities';
import { createActor, createRelationship, createWorkObject } from '@/server/crm-kernel';
import { ApiError, type RequestIdentity } from '@/server/request-context';
import type { WorkspaceContext } from '@/server/control-plane';

const identity: RequestIdentity = { userId: 'user-a', email: 'a@example.test', displayName: 'A', requestId: 'request-a' };
const workspace = (role: WorkspaceContext['workspace']['role'] = 'owner'): WorkspaceContext => ({ workspaceId: 'tenant-a', workspace: { id: 'tenant-a', name: 'A', ownerEmail: identity.email, ownerName: 'A', role, profile: 'business', timezone: 'UTC', currency: 'USD', locale: 'en-US', settings: {}, createdAt: '', updatedAt: '' } });
const noDb = {} as D1Database;

describe('agent service authorization and input fences', () => {
  it('denies member agent administration before touching storage', async () => {
    await expect(createAgent(noDb, identity, workspace('member'), { name: 'Helper', autonomy: 'observe', monthlyBudgetCents: 0 })).rejects.toMatchObject({ status: 403, code: 'forbidden' });
  });
  it('rejects invalid identities and budgets', async () => {
    await expect(createAgent(noDb, identity, workspace(), { name: '', autonomy: 'observe', monthlyBudgetCents: 0 })).rejects.toBeInstanceOf(ApiError);
    await expect(createAgent(noDb, identity, workspace(), { name: 'Helper', autonomy: 'unbounded', monthlyBudgetCents: 0 })).rejects.toMatchObject({ code: 'validation_error' });
    await expect(createAgent(noDb, identity, workspace(), { name: 'Helper', autonomy: 'observe', monthlyBudgetCents: -1 })).rejects.toMatchObject({ code: 'validation_error' });
  });
  it('rejects malformed proposals before policy lookup', async () => {
    await expect(proposeAgentAction(noDb, identity, workspace(), { agentId: 'a', toolId: 't', summary: 'Read', requestedScope: 'records:read', estimatedCostCents: -1, idempotencyKey: 'key' })).rejects.toMatchObject({ code: 'validation_error' });
  });
  it('rejects invalid safety and approval transitions before writes', async () => {
    await expect(setAgentSafety(noDb, identity, workspace(), { agentId: 'agent-a', status: 'running' as never })).rejects.toMatchObject({ code: 'validation_error' });
    await expect(decideApproval(noDb, identity, workspace(), { approvalId: 'approval-a', decision: 'maybe' as never })).rejects.toMatchObject({ code: 'validation_error' });
  });
  it('never executes a missing run', async () => {
    const db = { prepare: () => ({ bind: () => ({ first: async () => null }) }) } as unknown as D1Database;
    await expect(executeAuthorizedRun(db, identity, workspace(), 'missing')).rejects.toMatchObject({ code: 'run_not_authorized' });
  });
});

describe('connector service truthfulness', () => {
  it('rejects unknown connectors and member configuration', async () => {
    await expect(connectSimulator(noDb, identity, workspace(), 'imaginary-provider')).rejects.toMatchObject({ code: 'unsupported_connector' });
    await expect(connectSimulator(noDb, identity, workspace('member'), 'csv')).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('server capability enforcement', () => {
  it('resolves tenant overrides and rejects disabled API capabilities', async () => {
    const db = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ capability_key: 'agentPlane', enabled: 0 }] }) }) }) } as unknown as D1Database;
    expect((await getWorkspaceCapabilities(db, workspace())).agentPlane.enabled).toBe(false);
    await expect(requireCapability(db, workspace(), 'agentPlane')).rejects.toMatchObject({ status: 403, code: 'capability_disabled' });
  });
});

describe('shared CRM kernel validation and authorization', () => {
  it('rejects unknown actor/work kinds and self-relationships before writes', async () => {
    await expect(createActor(noDb, identity, workspace(), { kind: 'robot', displayName: 'R' })).rejects.toMatchObject({ code: 'validation_error' });
    await expect(createWorkObject(noDb, identity, workspace(), { kind: 'unknown', title: 'Work' })).rejects.toMatchObject({ code: 'validation_error' });
    await expect(createRelationship(noDb, identity, workspace(), { sourceActorId: 'same', targetActorId: 'same', relationshipType: 'knows' })).rejects.toMatchObject({ code: 'validation_error' });
  });
  it('denies auditor writes before storage access', async () => {
    await expect(createActor(noDb, identity, workspace('auditor'), { kind: 'human', displayName: 'No write' })).rejects.toMatchObject({ status: 403, code: 'forbidden' });
  });
});
