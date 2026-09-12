import { recordTypes, type RecordType } from './crm-platform';
import { evaluateAgentAction, type AgentActionContext, type AgentDecision } from './multi-edition';

export const POLICY_VERSION_LIMIT = 200;
export const POLICY_RECORD_LIMIT = 1000;
export type PolicyRecordScope = { objectTypes: RecordType[]; recordIds: string[] | null; maxRecords: number };
export type AgentPolicy = {
  schemaVersion: 1;
  allowedToolIds: string[];
  recordScope: PolicyRecordScope;
  budgetCents: number;
  maxActionCostCents: number;
  requireApproval: boolean;
  approvalThresholdCents: number | null;
  expiresAt: string | null;
  stopped: boolean;
};
export type AgentPolicyRevision = { version: number; policy: AgentPolicy; createdAt: string; createdBy: string };
export type PolicyDecision = AgentDecision & { matchedRule: string; policyVersion: number | null; records: PolicyRecordScope };

function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(result, key))) {
    throw new Error(`${label} must include exactly its documented fields.`);
  }
  return result;
}
function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  return value;
}
function identifiers(value: unknown, max: number, label: string): string[] {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== 'string' || !item || item.length > 128 || item.trim() !== item || /[\u0000-\u001f\u007f]/.test(item))) throw new Error(`${label} must be a bounded list of identifiers.`);
  if (new Set(value).size !== value.length) throw new Error(`${label} cannot contain duplicates.`);
  return [...value].sort();
}
export function parsePolicyRecordScope(value: unknown): PolicyRecordScope {
  const input = object(value, ['objectTypes', 'recordIds', 'maxRecords'], 'Record scope');
  const types = identifiers(input.objectTypes, recordTypes.length, 'Record types');
  if (!types.length || types.some((type) => !(recordTypes as readonly string[]).includes(type))) throw new Error('Choose at least one supported record type.');
  const ids = input.recordIds === null ? null : identifiers(input.recordIds, 50, 'Record IDs');
  if (ids?.length === 0) throw new Error('Use null for all matching records, or provide at least one record ID.');
  return { objectTypes: types as RecordType[], recordIds: ids, maxRecords: integer(input.maxRecords, 1, POLICY_RECORD_LIMIT, 'Record limit') };
}
export function parseAgentPolicy(value: unknown): AgentPolicy {
  const input = object(value, ['schemaVersion', 'allowedToolIds', 'recordScope', 'budgetCents', 'maxActionCostCents', 'requireApproval', 'approvalThresholdCents', 'expiresAt', 'stopped'], 'Policy');
  if (input.schemaVersion !== 1) throw new Error('Unsupported policy schema version.');
  for (const key of ['requireApproval', 'stopped']) if (typeof input[key] !== 'boolean') throw new Error(`${key} must be a boolean.`);
  const budget = integer(input.budgetCents, 0, 10_000_000, 'Policy budget');
  const maximum = integer(input.maxActionCostCents, 0, budget, 'Per-action budget');
  const threshold = input.approvalThresholdCents === null ? null : integer(input.approvalThresholdCents, 0, maximum, 'Approval threshold');
  if (input.expiresAt !== null && (typeof input.expiresAt !== 'string' || input.expiresAt.length !== 24 || !Number.isFinite(Date.parse(input.expiresAt)) || new Date(input.expiresAt).toISOString() !== input.expiresAt)) throw new Error('Policy expiry must be null or a canonical UTC timestamp.');
  return { schemaVersion: 1, allowedToolIds: identifiers(input.allowedToolIds, 16, 'Allowed tools'), recordScope: parsePolicyRecordScope(input.recordScope), budgetCents: budget, maxActionCostCents: maximum, requireApproval: input.requireApproval as boolean, approvalThresholdCents: threshold, expiresAt: input.expiresAt as string | null, stopped: input.stopped as boolean };
}
export const defaultPolicyRecordScope = (): PolicyRecordScope => ({ objectTypes: [...recordTypes].sort(), recordIds: null, maxRecords: POLICY_RECORD_LIMIT });
export function defaultAgentPolicy(toolIds: string[], budgetCents: number): AgentPolicy {
  return { schemaVersion: 1, allowedToolIds: [...toolIds].sort(), recordScope: defaultPolicyRecordScope(), budgetCents, maxActionCostCents: budgetCents, requireApproval: true, approvalThresholdCents: null, expiresAt: null, stopped: false };
}

/** A pure evaluator: no database writes, clock reads, model calls, or tool execution. */
export function evaluatePolicyProposal(input: {
  base: AgentActionContext; policy: AgentPolicy | null; version: number | null;
  toolId: string; records?: PolicyRecordScope; spentCents: number; now: number;
  transport: string; grantExpiresAt: string | null; toolEnabled: boolean;
}): PolicyDecision {
  const { policy, base } = input;
  const records = input.records ?? policy?.recordScope ?? defaultPolicyRecordScope();
  const result = (decision: AgentDecision['decision'], matchedRule: string, reason: string, mayExecute = false): PolicyDecision => ({ decision, matchedRule, reason, mayExecute, policyVersion: input.version, records });
  if (base.emergencyStopped) return result('deny', 'platform.emergency-stop', 'The agent emergency stop is active.');
  if (base.paused) return result('deny', 'platform.paused', 'The agent is paused.');
  if (!input.toolEnabled || !base.allowedScopes.includes(base.requestedScope)) return result('deny', 'platform.tool-grant', 'The tool and requested scope must be enabled and granted to this agent.');
  if (input.grantExpiresAt !== null && (!Number.isFinite(Date.parse(input.grantExpiresAt)) || Date.parse(input.grantExpiresAt) <= input.now)) return result('deny', 'platform.grant-expiry', 'The tool grant has expired.');
  if (base.external || input.transport !== 'local-simulator') return result('deny', 'platform.local-only', 'External execution is disabled; only the local simulator is available.');
  if (!Number.isSafeInteger(base.estimatedCostCents) || base.estimatedCostCents < 0 || base.estimatedCostCents > base.budgetRemainingCents) return result('deny', 'platform.budget', 'The action would exceed the agent budget.');
  if (policy) {
    if (policy.stopped) return result('deny', 'policy.stop', 'This policy stops new agent work.');
    if (policy.expiresAt !== null && Date.parse(policy.expiresAt) <= input.now) return result('deny', 'policy.expiry', 'This policy has expired.');
    if (!policy.allowedToolIds.includes(input.toolId)) return result('deny', 'policy.tools', 'This tool is not allowed by the policy.');
    if (records.objectTypes.some((type) => !policy.recordScope.objectTypes.includes(type))) return result('deny', 'policy.record-types', 'The requested record types are outside the policy.');
    if (policy.recordScope.recordIds !== null && (records.recordIds === null || records.recordIds.some((id) => !policy.recordScope.recordIds!.includes(id)))) return result('deny', 'policy.record-ids', 'The requested record IDs are outside the policy.');
    if (records.maxRecords > policy.recordScope.maxRecords) return result('deny', 'policy.record-limit', 'The requested record limit exceeds the policy.');
    if (base.estimatedCostCents > policy.maxActionCostCents || input.spentCents + base.estimatedCostCents > policy.budgetCents) return result('deny', 'policy.budget', 'The action would exceed the policy budget or per-action limit.');
  }
  const baseline = evaluateAgentAction(base);
  if (!baseline.mayExecute) return { ...baseline, matchedRule: 'platform.autonomy', policyVersion: input.version, records };
  if (policy?.requireApproval || (policy?.approvalThresholdCents !== null && policy?.approvalThresholdCents !== undefined && base.estimatedCostCents > policy.approvalThresholdCents)) return result('require-approval', 'policy.approval', 'The policy requires human approval for this action.');
  return result('allow', policy ? 'policy.allowed' : 'platform.allowed', 'The action satisfies the current grants, record scope, budget, and policy.', true);
}
