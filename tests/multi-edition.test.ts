import { describe, expect, it } from 'vitest';
import { evaluateAgentAction, isWorkspaceProfile, referenceConnectors, resolveCapabilities } from '@/lib/multi-edition';

const safe = { autonomy: 'policy-autonomous' as const, external: false, requestedScope: 'records:read', allowedScopes: ['records:read'], budgetRemainingCents: 100, estimatedCostCents: 10 };

describe('workspace profiles and capability registry', () => {
  it('keeps profiles reversible and resolves useful defaults', () => {
    expect(isWorkspaceProfile('personal')).toBe(true);
    expect(isWorkspaceProfile('agentic')).toBe(false);
    expect(resolveCapabilities('personal').service.enabled).toBe(false);
    expect(resolveCapabilities('business').service.enabled).toBe(true);
    expect(resolveCapabilities('enterprise').advancedPolicies.enabled).toBe(true);
    expect(resolveCapabilities('personal', { service: true }).service.enabled).toBe(true);
    expect(resolveCapabilities('business').agentPlane.enabled).toBe(true);
  });

  it('publishes only complete local reference connectors', () => {
    expect(referenceConnectors.map((connector) => connector.key)).toEqual(['csv', 'webhook-simulator']);
    expect(referenceConnectors.every((connector) => connector.auth === 'simulated')).toBe(true);
  });
});

describe('agent policy', () => {
  it.each([
    [{ ...safe, emergencyStopped: true }, 'deny'],
    [{ ...safe, paused: true }, 'deny'],
    [{ ...safe, requestedScope: 'records:write' }, 'deny'],
    [{ ...safe, estimatedCostCents: 101 }, 'deny'],
    [{ ...safe, destructive: true }, 'require-approval'],
    [{ ...safe, autonomy: 'observe' as const }, 'observe'],
    [{ ...safe, autonomy: 'suggest' as const }, 'suggest'],
    [{ ...safe, autonomy: 'prepare' as const }, 'prepare'],
    [{ ...safe, autonomy: 'approval-required' as const }, 'require-approval'],
  ])('denies or gates constrained operation %#', (context, decision) => {
    expect(evaluateAgentAction(context).decision).toBe(decision);
    expect(evaluateAgentAction(context).mayExecute).toBe(false);
  });

  it('requires explicit policy for external autonomous action', () => {
    expect(evaluateAgentAction({ ...safe, external: true }).decision).toBe('require-approval');
    expect(evaluateAgentAction({ ...safe, external: true, policyAllowsAutonomous: true }).mayExecute).toBe(true);
  });

  it('allows a scoped, budgeted, non-destructive internal action', () => {
    expect(evaluateAgentAction(safe)).toMatchObject({ decision: 'allow', mayExecute: true });
  });
});
