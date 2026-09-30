import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateAgentPolicy, agentPolicySafetyRevision, createPolicyEditorRequests, loadAgentPolicy, policyAfterActivation, policyDraftAfterRefresh, testAgentPolicy } from '@/lib/agent-policy-client';
import { defaultAgentPolicy } from '@/lib/agent-policy';
import type { AgentSummary } from '@/lib/crm-platform';

const policy = defaultAgentPolicy(['tool'], 100);
const proposal = { toolId: 'tool', requestedScope: 'records:read', estimatedCostCents: 0, destructive: false };
const result = { dryRun: true, writes: false, externalExecution: false, basedOnVersion: 0, decision: { decision: 'require-approval', mayExecute: false, matchedRule: 'policy.approval', reason: 'Approval required.', policyVersion: null, records: policy.recordScope } };
const response = (data: unknown) => Response.json({ data });
afterEach(() => vi.unstubAllGlobals());

describe('policy client receipt integrity', () => {
  it('sends dry-run without a mutation retry key and rejects executing or malformed responses', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(result)); vi.stubGlobal('fetch', fetcher);
    expect(await testAgentPolicy('agent', policy, proposal)).toEqual(result);
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).has('idempotency-key')).toBe(false);
    expect(JSON.parse(init.body as string)).toMatchObject({ operation: 'dry-run', agentId: 'agent', policy, proposal });
    for (const invalid of [{ ...result, writes: true }, { ...result, externalExecution: true }, { ...result, decision: null }]) {
      fetcher.mockResolvedValueOnce(response(invalid));
      await expect(testAgentPolicy('agent', policy, proposal)).rejects.toThrow(/non-executing/);
    }
  });
  it('keeps the same idempotency key across an ambiguous success receipt and exact retry', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ agentId: 'wrong-agent', active: { version: 1, policy }, replayed: false })).mockResolvedValueOnce(response({ agentId: 'agent-retry', active: { version: 1, policy, createdAt: '2026-09-11T00:00:00.000Z', createdBy: 'owner' }, replayed: true }));
    vi.stubGlobal('fetch', fetcher);
    await expect(activateAgentPolicy('agent-retry', policy, 0)).rejects.toThrow(/invalid success receipt/);
    expect(await activateAgentPolicy('agent-retry', policy, 0)).toMatchObject({ replayed: true, active: { version: 1 } });
    const keys = fetcher.mock.calls.map((call) => new Headers((call[1] as RequestInit).headers).get('idempotency-key'));
    expect(keys[0]).toBeTruthy(); expect(keys[1]).toBe(keys[0]);
  });
  it('rejects a version or policy mismatch rather than acknowledging the wrong activation', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ agentId: 'agent-mismatch', active: { version: 2, policy }, replayed: false })); vi.stubGlobal('fetch', fetcher);
    await expect(activateAgentPolicy('agent-mismatch', policy, 0)).rejects.toThrow(/invalid success receipt/);
    fetcher.mockResolvedValue(response({ agentId: 'agent-mismatch', active: { version: 1, policy: { ...policy, stopped: true } }, replayed: false }));
    await expect(activateAgentPolicy('agent-mismatch', policy, 0)).rejects.toThrow(/invalid success receipt/);
  });
  it('does not accept another agent settings or silently ignore an unknown draft field', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ agentId: 'other', externalExecution: false, tools: [], history: [], draft: policy })); vi.stubGlobal('fetch', fetcher);
    await expect(loadAgentPolicy('agent')).rejects.toThrow(/does not match/);
    fetcher.mockResolvedValue(response({ agentId: 'agent', externalExecution: false, tools: [], history: [], draft: { ...policy, execute: true } }));
    await expect(loadAgentPolicy('agent')).rejects.toThrow(/documented fields/);
  });
  it('shows the latest active policy after a replay of an older successful save', async () => {
    const current = { agentId: 'agent', externalExecution: false, tools: [], history: [], draft: { ...policy, stopped: true }, active: { version: 2, policy: { ...policy, stopped: true } } };
    const fetcher = vi.fn().mockResolvedValue(response(current)); vi.stubGlobal('fetch', fetcher);
    expect(await policyAfterActivation('agent', 1)).toMatchObject({ current: { active: { version: 2 } }, notice: expect.stringContaining('newer version 2 is now active') });
    fetcher.mockResolvedValue(response({ ...current, active: null }));
    await expect(policyAfterActivation('agent', 1)).rejects.toThrow(/could not be verified/);
  });
});

describe('policy editor safety-state revisions', () => {
  const now = Date.parse('2026-09-11T12:00:00.000Z');
  const agent: AgentSummary = { id: 'agent', name: 'Fictional agent', status: 'active', autonomy: 'policy-autonomous', monthlyBudgetCents: 100, spentCents: 0, emergencyStoppedAt: null,
    tools: [{ id: 'tool', name: 'Local simulator', scopes: ['records:read', 'another:scope'], external: false, enabled: true, expiresAt: '2026-09-11T12:01:00.000Z' }],
  };

  it('does not refresh or erase a draft for clock ticks, renamed labels, or reordered grant scopes', () => {
    const revision = agentPolicySafetyRevision(agent, now);
    expect(agentPolicySafetyRevision({ ...agent, name: 'Renamed label', tools: [{ ...agent.tools[0], name: 'Renamed tool', scopes: [...agent.tools[0].scopes].reverse() }] }, now + 1000)).toBe(revision);
  });

  it.each([
    { status: 'paused' }, { autonomy: 'observe' }, { monthlyBudgetCents: 90 }, { spentCents: 1 }, { emergencyStoppedAt: '2026-09-11T12:00:01.000Z' }, { tools: [] },
  ])('invalidates preview for changed agent safety %j', (change) => {
    expect(agentPolicySafetyRevision({ ...agent, ...change }, now)).not.toBe(agentPolicySafetyRevision(agent, now));
  });

  it.each([{ scopes: ['records:read'] }, { external: true }, { enabled: false }, { expiresAt: null }, { expiresAt: 'invalid' }])('invalidates preview for changed tool safety %j', (change) => {
    expect(agentPolicySafetyRevision({ ...agent, tools: [{ ...agent.tools[0], ...change }] }, now)).not.toBe(agentPolicySafetyRevision(agent, now));
  });

  it('invalidates at the exact grant expiry boundary without requiring another server snapshot', () => {
    expect(agentPolicySafetyRevision(agent, now + 59_999)).toBe(agentPolicySafetyRevision(agent, now));
    expect(agentPolicySafetyRevision(agent, now + 60_000)).not.toBe(agentPolicySafetyRevision(agent, now));
  });

  it('keeps unsaved and even temporarily invalid draft values until an explicit replacement', () => {
    const draft = { ...policy, recordScope: { ...policy.recordScope, maxRecords: NaN }, stopped: true };
    expect(policyDraftAfterRefresh(draft, policy, true)).toBe(draft);
    expect(policyDraftAfterRefresh(draft, policy, false)).toBe(policy);
    expect(policyDraftAfterRefresh(null, policy, true)).toBe(policy);
  });

  it('ignores stale load, dry-run, and save responses after safety changes, including an ABA revision', () => {
    const requests = createPolicyEditorRequests();
    const stale = requests.begin('active')!;
    expect(requests.begin('active')).toBeNull();
    requests.invalidate('stopped');
    const current = requests.begin('stopped')!;
    expect(requests.current(stale)).toBe(false);
    expect(requests.finish(stale)).toBe(false);
    expect(requests.current(current)).toBe(true);
    requests.invalidate('active');
    const newer = requests.begin('active')!;
    expect(requests.current(stale)).toBe(false);
    expect(requests.current(current)).toBe(false);
    expect(requests.current(newer)).toBe(true);
    expect(requests.finish(newer)).toBe(true);
    expect(requests.current(newer)).toBe(false);
    requests.invalidate('unmounted');
    expect(requests.finish(newer)).toBe(false);
  });
});
