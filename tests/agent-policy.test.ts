import { describe, expect, it } from 'vitest';
import { defaultAgentPolicy, evaluatePolicyProposal, parseAgentPolicy, parsePolicyRecordScope } from '@/lib/agent-policy';

const policy = () => ({ ...defaultAgentPolicy(['tool-a'], 100), requireApproval: false });
const base = { autonomy: 'policy-autonomous' as const, external: false, requestedScope: 'records:read', allowedScopes: ['records:read'], budgetRemainingCents: 100, estimatedCostCents: 5 };
const input = () => ({ base, policy: policy(), version: 1, toolId: 'tool-a', now: Date.parse('2026-09-11T12:00:00.000Z'), spentCents: 0, transport: 'local-simulator', toolEnabled: true, grantExpiresAt: null });

describe('strict versioned policy language', () => {
  it('rejects ambiguous, unknown, duplicate, non-canonical, or broader-shaped inputs', () => {
    for (const candidate of [
      { ...policy(), unknown: true }, { ...policy(), schemaVersion: 2 },
      { ...policy(), allowedToolIds: ['tool-a', 'tool-a'] }, { ...policy(), budgetCents: '100' },
      { ...policy(), maxActionCostCents: 101 }, { ...policy(), stopped: 'false' },
      { ...policy(), expiresAt: '2030-01-01 00:00:00' },
      { ...policy(), recordScope: { ...policy().recordScope, maxRecords: 1001 } },
      { ...policy(), recordScope: { ...policy().recordScope, recordIds: [] } },
      { ...policy(), recordScope: { ...policy().recordScope, objectTypes: ['secret'] } },
    ]) expect(() => parseAgentPolicy(candidate)).toThrow();
    expect(parseAgentPolicy(policy())).toEqual(policy());
  });
  it('normalizes list ordering without silently widening scope', () => {
    expect(parsePolicyRecordScope({ objectTypes: ['task', 'contact'], recordIds: ['b', 'a'], maxRecords: 2 })).toEqual({ objectTypes: ['contact', 'task'], recordIds: ['a', 'b'], maxRecords: 2 });
  });
});

describe('deterministic policy decision explanations', () => {
  it.each([
    ['policy.stop', { stopped: true }],
    ['policy.expiry', { expiresAt: '2026-09-11T12:00:00.000Z' }],
    ['policy.tools', { allowedToolIds: [] }],
    ['policy.budget', { maxActionCostCents: 4 }],
  ])('denies at the named rule %s', (matchedRule, changes) => {
    expect(evaluatePolicyProposal({ ...input(), policy: { ...policy(), ...changes } })).toMatchObject({ decision: 'deny', matchedRule, mayExecute: false });
  });
  it('enforces record types, exact IDs, and read caps', () => {
    const constrained = { ...policy(), recordScope: { objectTypes: ['contact' as const], recordIds: ['a'], maxRecords: 2 } };
    for (const [records, matchedRule] of [
      [{ objectTypes: ['task'], recordIds: ['a'], maxRecords: 1 }, 'policy.record-types'],
      [{ objectTypes: ['contact'], recordIds: null, maxRecords: 1 }, 'policy.record-ids'],
      [{ objectTypes: ['contact'], recordIds: ['b'], maxRecords: 1 }, 'policy.record-ids'],
      [{ objectTypes: ['contact'], recordIds: ['a'], maxRecords: 3 }, 'policy.record-limit'],
    ] as const) expect(evaluatePolicyProposal({ ...input(), policy: constrained, records: parsePolicyRecordScope(records) })).toMatchObject({ matchedRule, decision: 'deny' });
    expect(evaluatePolicyProposal({ ...input(), policy: constrained }).records).toEqual(constrained.recordScope);
  });
  it('keeps baseline safety stronger than authored policy', () => {
    expect(evaluatePolicyProposal({ ...input(), base: { ...base, emergencyStopped: true } }).matchedRule).toBe('platform.emergency-stop');
    expect(evaluatePolicyProposal({ ...input(), base: { ...base, paused: true } }).matchedRule).toBe('platform.paused');
    expect(evaluatePolicyProposal({ ...input(), base: { ...base, external: true } }).matchedRule).toBe('platform.local-only');
    expect(evaluatePolicyProposal({ ...input(), base: { ...base, allowedScopes: [] } }).matchedRule).toBe('platform.tool-grant');
    expect(evaluatePolicyProposal({ ...input(), grantExpiresAt: '2000-01-01T00:00:00.000Z' }).matchedRule).toBe('platform.grant-expiry');
    expect(evaluatePolicyProposal({ ...input(), base: { ...base, budgetRemainingCents: 4 } }).matchedRule).toBe('platform.budget');
    expect(evaluatePolicyProposal({ ...input(), base: { ...base, destructive: true } }).decision).toBe('require-approval');
    expect(evaluatePolicyProposal({ ...input(), base: { ...base, autonomy: 'observe' } }).mayExecute).toBe(false);
  });
  it('uses strict greater-than approval thresholds and includes spent budget', () => {
    const threshold = { ...policy(), approvalThresholdCents: 5 };
    expect(evaluatePolicyProposal({ ...input(), policy: threshold }).decision).toBe('allow');
    expect(evaluatePolicyProposal({ ...input(), policy: threshold, base: { ...base, estimatedCostCents: 6 } })).toMatchObject({ decision: 'require-approval', matchedRule: 'policy.approval' });
    expect(evaluatePolicyProposal({ ...input(), spentCents: 98 }).matchedRule).toBe('policy.budget');
  });
});
