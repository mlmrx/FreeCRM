import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { getD1, getRequestIdentity } = vi.hoisted(() => ({ getD1: vi.fn(), getRequestIdentity: vi.fn() }));
vi.mock('@/db', () => ({ getD1 }));
vi.mock('@/server/request-context', async (original) => ({ ...await original<typeof import('@/server/request-context')>(), getRequestIdentity }));
import { GET, POST } from '@/app/api/v1/agents/policies/route';
import { defaultAgentPolicy } from '@/lib/agent-policy';
import { ApiError } from '@/server/request-context';
import { PolicyDatabase, policyFixture } from './agent-policy-fixture';

let db: PolicyDatabase;
let fixture: Awaited<ReturnType<typeof policyFixture>>;
const request = (body: unknown, key?: string) => new Request('https://freecrm.dev/api/v1/agents/policies', { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) }, body: JSON.stringify(body) });
const draft = () => defaultAgentPolicy([fixture.toolId], 100);
const dryRun = () => ({ operation: 'dry-run', agentId: fixture.agentId, policy: draft(), proposal: { toolId: fixture.toolId, requestedScope: 'records:read', estimatedCostCents: 0, destructive: false } });

describe('authenticated policy routes against the migrated database', () => {
  beforeEach(async () => { vi.clearAllMocks(); db = new PolicyDatabase(); fixture = await policyFixture(db); getD1.mockReturnValue(db.asD1()); getRequestIdentity.mockResolvedValue(fixture.identity); });
  afterEach(() => db.sqlite.close());
  it('GET and POST dry-run remain strictly read-only including workspace and capability lookup', async () => {
    db.readOnly = true;
    const before = db.sqlite.prepare('SELECT total_changes() AS count').get()!.count;
    const settings = await GET(new Request(`https://freecrm.dev/api/v1/agents/policies?agentId=${fixture.agentId}`));
    expect(settings.status).toBe(200);
    const response = await POST(request(dryRun()));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { dryRun: true, writes: false, externalExecution: false, decision: { decision: 'require-approval' } } });
    expect(db.sqlite.prepare('SELECT total_changes() AS count').get()!.count).toBe(before);
  });
  it.each(['agentPlane', 'advancedPolicies'])('blocks authoring endpoints when %s is disabled', async (capability) => {
    db.sqlite.prepare('INSERT INTO capability_overrides (workspace_id,capability_key,enabled) VALUES (?,?,0)').run(fixture.workspace.workspaceId, capability);
    for (const response of [await GET(new Request(`https://freecrm.dev/api/v1/agents/policies?agentId=${fixture.agentId}`)), await POST(request(dryRun()))]) {
      expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ error: { code: 'capability_disabled' } });
    }
  });
  it('requires a caller retry key for activation and returns a versioned receipt', async () => {
    const body = { operation: 'save', agentId: fixture.agentId, policy: draft(), expectedVersion: 0 };
    expect((await POST(request(body))).status).toBe(400);
    const response = await POST(request(body, 'activation-route-key'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { active: { version: 1 }, replayed: false } });
  });
  it('rejects unsupported request fields, invalid policy/proposal, cross-origin requests, and anonymous callers', async () => {
    expect((await POST(request({ ...dryRun(), externalExecution: true }))).status).toBe(400);
    expect((await POST(request({ ...dryRun(), proposal: { ...dryRun().proposal, arbitraryCode: 'execute' } }))).status).toBe(400);
    expect((await POST(request({ ...dryRun(), policy: { ...draft(), stopped: 'false' } }))).status).toBe(400);
    const crossOrigin = request(dryRun()); crossOrigin.headers.set('origin', 'https://untrusted.example');
    expect((await POST(crossOrigin)).status).toBe(403);
    getRequestIdentity.mockRejectedValue(new ApiError(401, 'unauthorized', 'Authentication required.'));
    expect((await POST(request(dryRun()))).status).toBe(401);
  });
  it('does not create a workspace for a new authenticated identity', async () => {
    getRequestIdentity.mockResolvedValue({ ...fixture.identity, userId: 'uninitialized' }); db.readOnly = true;
    const response = await POST(request(dryRun()));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'workspace_not_found' } });
  });
});
