import { parseAgentPolicy, parsePolicyRecordScope, type AgentPolicy, type AgentPolicyRevision, type PolicyDecision } from './agent-policy';
import { sendIdempotentOperation } from './idempotent-client';
import type { AgentSummary } from './crm-platform';

/** Only changes in effective safety state invalidate an editor, not array order. */
export function agentPolicySafetyRevision(agent: AgentSummary, now: number): string {
  return JSON.stringify({
    agentId: agent.id, status: agent.status, autonomy: agent.autonomy, budget: agent.monthlyBudgetCents,
    spent: agent.spentCents, emergencyStoppedAt: agent.emergencyStoppedAt,
    tools: agent.tools.map((tool) => ({ id: tool.id, scopes: [...tool.scopes].sort(), external: tool.external, enabled: tool.enabled,
      expiresAt: tool.expiresAt, expired: tool.expiresAt !== null && (!Number.isFinite(Date.parse(tool.expiresAt)) || Date.parse(tool.expiresAt) <= now),
    })).sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export type PolicyEditorRequest = { revision: string; sequence: number };
/** An old load/preview/save may finish, but must never replace newer UI state. */
export function createPolicyEditorRequests() {
  let revision = ''; let sequence = 0; let active: PolicyEditorRequest | null = null;
  const invalidate = (next: string) => { revision = next; sequence += 1; active = null; };
  return {
    invalidate,
    begin(next: string): PolicyEditorRequest | null {
      if (next !== revision) invalidate(next);
      if (active) return null;
      active = { revision, sequence: ++sequence }; return active;
    },
    current(request: PolicyEditorRequest) { return active === request && request.revision === revision; },
    finish(request: PolicyEditorRequest) {
      if (active !== request || request.revision !== revision) return false;
      active = null; return true;
    },
  };
}

export function policyDraftAfterRefresh(current: AgentPolicy | null, loaded: AgentPolicy, preserve: boolean): AgentPolicy {
  return preserve && current ? current : loaded;
}

export type PolicySettings = {
  agentId: string; active: AgentPolicyRevision | null; draft: AgentPolicy;
  tools: Array<{ id: string; name: string; usable: boolean; scopes: string[]; expiresAt: string | null }>;
  budgetCeilingCents: number; spentCents: number; agentStatus: string; emergencyStopped: boolean;
  history: Array<{ version: number; createdAt: string; createdBy: string }>; externalExecution: false;
};
const endpoint = '/api/v1/agents/policies';
async function data(response: Response) {
  const body = await response.json().catch(() => null) as { data?: unknown; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Policy request failed (${response.status}).`);
  if (!body?.data || typeof body.data !== 'object') throw new Error('The server returned an invalid policy response.');
  return body.data;
}
export async function loadAgentPolicy(agentId: string): Promise<PolicySettings> {
  const value = await data(await fetch(`${endpoint}?agentId=${encodeURIComponent(agentId)}`, { cache: 'no-store' })) as PolicySettings;
  if (value.agentId !== agentId || value.externalExecution !== false || !Array.isArray(value.tools) || !Array.isArray(value.history)) throw new Error('The policy response does not match this agent.');
  value.draft = parseAgentPolicy(value.draft);
  return value;
}
/** A replay receipt proves that version was saved, not that it is still current. */
export async function policyAfterActivation(agentId: string, savedVersion: number) {
  const current = await loadAgentPolicy(agentId);
  if (!current.active || current.active.version < savedVersion) throw new Error('The current active policy could not be verified. Reload before another agent action.');
  return {
    current,
    notice: current.active.version === savedVersion
      ? `Policy version ${savedVersion} save confirmed and currently active. Earlier proposals were cancelled; create a new proposal.`
      : `Policy version ${savedVersion} save confirmed. A newer version ${current.active.version} is now active; its current policy is shown below.`,
  };
}
export function activateAgentPolicy(agentId: string, policyInput: AgentPolicy, expectedVersion: number) {
  const policy = parseAgentPolicy(policyInput);
  type Receipt = { agentId: string; active: AgentPolicyRevision; replayed: boolean };
  return sendIdempotentOperation<Receipt>(endpoint, { operation: 'save', agentId, policy, expectedVersion }, {
    validateData(value: unknown): value is Receipt {
      if (!value || typeof value !== 'object') return false;
      const receipt = value as Partial<Receipt>;
      try {
        return receipt.agentId === agentId && receipt.active?.version === expectedVersion + 1 && typeof receipt.replayed === 'boolean'
          && JSON.stringify(parseAgentPolicy(receipt.active.policy)) === JSON.stringify(policy);
      } catch { return false; }
    },
  });
}
export async function testAgentPolicy(agentId: string, policyInput: AgentPolicy, proposal: { toolId: string; requestedScope: string; estimatedCostCents: number; destructive: boolean }) {
  const value = await data(await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'dry-run', agentId, policy: parseAgentPolicy(policyInput), proposal }) })) as { dryRun: boolean; externalExecution: boolean; writes: boolean; basedOnVersion: number; decision: PolicyDecision };
  if (value.dryRun !== true || value.externalExecution !== false || value.writes !== false || !value.decision || !['deny', 'observe', 'suggest', 'prepare', 'require-approval', 'allow'].includes(value.decision.decision) || typeof value.decision.reason !== 'string' || typeof value.decision.matchedRule !== 'string' || typeof value.decision.mayExecute !== 'boolean') throw new Error('The server did not return a valid non-executing policy result.');
  parsePolicyRecordScope(value.decision.records);
  return value;
}
