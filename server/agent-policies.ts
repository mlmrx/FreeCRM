import { defaultAgentPolicy, evaluatePolicyProposal, parseAgentPolicy, parsePolicyRecordScope, POLICY_VERSION_LIMIT, type AgentPolicy, type AgentPolicyRevision, type PolicyRecordScope } from '@/lib/agent-policy';
import { parseJson } from '@/lib/crm-platform';
import type { AutonomyLevel } from '@/lib/multi-edition';
import { requirePermission } from './authorization';
import type { WorkspaceContext } from './control-plane';
import { captureWorkspaceMutationEpoch, normalizeMutationFenceError, workspaceMutationFence } from './mutation-fence';
import { ApiError, type RequestIdentity } from './request-context';

export function policyId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value || value.length > 128 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) throw new ApiError(400, 'validation_error', `${field} must be a bounded identifier.`);
  return value;
}
function policyInput(value: unknown): AgentPolicy {
  try { return parseAgentPolicy(value); } catch (error) { throw new ApiError(400, 'invalid_policy', error instanceof Error ? error.message : 'Invalid policy.'); }
}
export function policyRecords(value: unknown): PolicyRecordScope | undefined {
  if (value === undefined) return undefined;
  try { return parsePolicyRecordScope(value); } catch (error) { throw new ApiError(400, 'invalid_record_scope', error instanceof Error ? error.message : 'Invalid record scope.'); }
}

/** Unlike ensureWorkspace, this function never initializes or seeds a workspace. */
export async function existingPolicyWorkspace(db: D1Database, identity: RequestIdentity): Promise<WorkspaceContext> {
  const row = await db.prepare(`SELECT w.id,w.name,w.owner_email,w.owner_name,w.profile,w.timezone,w.currency,w.locale,w.settings_json,w.created_at,w.updated_at,m.role
    FROM memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=? ORDER BY w.created_at,w.id LIMIT 1`)
    .bind(identity.userId).first<{ id: string; name: string; owner_email: string; owner_name: string; profile: WorkspaceContext['workspace']['profile']; timezone: string; currency: string; locale: string; settings_json: string; created_at: string; updated_at: string; role: WorkspaceContext['workspace']['role'] }>();
  if (!row) throw new ApiError(404, 'workspace_not_found', 'Open an existing workspace before editing or testing policies.');
  requirePermission(row.role, 'agents:manage');
  requirePermission(row.role, 'records:read');
  return { workspaceId: row.id, workspace: { id: row.id, name: row.name, ownerEmail: row.owner_email, ownerName: row.owner_name, profile: row.profile, timezone: row.timezone, currency: row.currency, locale: row.locale, settings: parseJson(row.settings_json, {}), createdAt: row.created_at, updatedAt: row.updated_at, role: row.role } };
}

type AgentState = { autonomy_level: AutonomyLevel; status: string; monthly_budget_cents: number; spent_cents: number; emergency_stopped_at: string | null };
type ToolState = { id: string; name: string; transport: string; external: number; enabled: number; scopes_json: string; grant_scopes_json: string; expires_at: string | null };
type RevisionRow = { version: number; document_json: string; created_at: string; created_by: string; request_hash: string };
async function policyContext(db: D1Database, workspaceId: string, agentId: string) {
  const agent = await db.prepare('SELECT autonomy_level,status,monthly_budget_cents,spent_cents,emergency_stopped_at FROM agent_identities WHERE workspace_id=? AND id=?').bind(workspaceId, agentId).first<AgentState>();
  if (!agent) throw new ApiError(404, 'agent_not_found', 'Agent was not found in this workspace.');
  const tools = await db.prepare(`SELECT t.id,t.name,t.transport,t.external,t.enabled,t.scopes_json,g.scopes_json AS grant_scopes_json,g.expires_at
    FROM agent_tool_grants g JOIN agent_tools t ON t.workspace_id=g.workspace_id AND t.id=g.tool_id
    WHERE g.workspace_id=? AND g.agent_id=? ORDER BY t.id LIMIT 17`).bind(workspaceId, agentId).all<ToolState>();
  return { agent, tools: tools.results };
}
function revision(row: RevisionRow): AgentPolicyRevision {
  try { return { version: row.version, policy: parseAgentPolicy(JSON.parse(row.document_json)), createdAt: row.created_at, createdBy: row.created_by }; }
  catch { throw new ApiError(500, 'stored_policy_invalid', 'The stored policy is invalid; agent execution remains blocked.'); }
}
export async function latestAgentPolicy(db: D1Database, workspaceId: string, agentId: string): Promise<AgentPolicyRevision | null> {
  const row = await db.prepare('SELECT version,document_json,created_at,created_by,request_hash FROM agent_policy_versions WHERE workspace_id=? AND agent_id=? ORDER BY version DESC LIMIT 1').bind(workspaceId, agentId).first<RevisionRow>();
  return row ? revision(row) : null;
}
function usableTool(tool: ToolState, now: number) {
  return Boolean(tool.enabled) && !tool.external && tool.transport === 'local-simulator'
    && parseJson<string[]>(tool.scopes_json, []).includes('records:read') && parseJson<string[]>(tool.grant_scopes_json, []).includes('records:read')
    && (tool.expires_at === null || Date.parse(tool.expires_at) > now);
}
async function validateOwnedPolicy(db: D1Database, workspaceId: string, context: Awaited<ReturnType<typeof policyContext>>, policy: AgentPolicy, now: number, saving: boolean) {
  if (policy.budgetCents > context.agent.monthly_budget_cents) throw new ApiError(403, 'policy_exceeds_grant', 'A policy cannot exceed the owner-configured agent budget.');
  const tools = context.tools.filter((tool) => usableTool(tool, now));
  if (policy.allowedToolIds.some((id) => !tools.some((tool) => tool.id === id))) throw new ApiError(403, 'policy_exceeds_grant', 'Policies may only allow currently granted, enabled local read tools.');
  if (saving && policy.expiresAt !== null && Date.parse(policy.expiresAt) <= now) throw new ApiError(400, 'policy_expired', 'An activated policy expiry must be in the future. Test past expiry with dry-run instead.');
  if (policy.recordScope.recordIds !== null) {
    const rows = await db.prepare('SELECT id FROM records WHERE workspace_id=? AND id IN (SELECT value FROM json_each(?)) AND object_type IN (SELECT value FROM json_each(?))')
      .bind(workspaceId, JSON.stringify(policy.recordScope.recordIds), JSON.stringify(policy.recordScope.objectTypes)).all<{ id: string }>();
    if (rows.results.length !== policy.recordScope.recordIds.length) throw new ApiError(403, 'policy_record_scope_invalid', 'Record scope must refer only to existing records of the selected types in this workspace.');
  }
}
function evaluate(context: Awaited<ReturnType<typeof policyContext>>, policy: AgentPolicy | null, version: number | null, proposal: PolicyProposal, now: number) {
  const tool = context.tools.find((candidate) => candidate.id === proposal.toolId);
  const toolScopes = parseJson<string[]>(tool?.scopes_json ?? '[]', []);
  const allowedScopes = parseJson<string[]>(tool?.grant_scopes_json ?? '[]', []).filter((scope) => toolScopes.includes(scope));
  return evaluatePolicyProposal({ policy, version, toolId: proposal.toolId, records: proposal.records, now,
    spentCents: context.agent.spent_cents, transport: tool?.transport ?? '', grantExpiresAt: tool?.expires_at ?? null, toolEnabled: Boolean(tool?.enabled),
    base: { autonomy: context.agent.autonomy_level, external: Boolean(tool?.external), destructive: proposal.destructive, paused: context.agent.status !== 'active', emergencyStopped: Boolean(context.agent.emergency_stopped_at), requestedScope: proposal.requestedScope, allowedScopes, budgetRemainingCents: context.agent.monthly_budget_cents - context.agent.spent_cents, estimatedCostCents: proposal.estimatedCostCents, policyAllowsAutonomous: false },
  });
}
export type PolicyProposal = { toolId: string; requestedScope: string; estimatedCostCents: number; destructive: boolean; records?: PolicyRecordScope };
export function parsePolicyProposal(value: unknown): PolicyProposal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'validation_error', 'A representative proposal is required.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['toolId', 'requestedScope', 'estimatedCostCents', 'destructive', 'records'].includes(key))) throw new ApiError(400, 'validation_error', 'The proposal contains unsupported fields.');
  if (typeof input.estimatedCostCents !== 'number' || !Number.isSafeInteger(input.estimatedCostCents) || input.estimatedCostCents < 0 || input.estimatedCostCents > 10_000_000 || typeof input.destructive !== 'boolean') throw new ApiError(400, 'validation_error', 'Proposal cost and destructive flag must be explicit valid values.');
  return { toolId: policyId(input.toolId, 'toolId'), requestedScope: policyId(input.requestedScope, 'requestedScope'), estimatedCostCents: input.estimatedCostCents, destructive: input.destructive, records: policyRecords(input.records) };
}
export async function evaluateActiveAgentPolicy(db: D1Database, workspaceId: string, agentId: string, proposal: PolicyProposal, expectedVersion?: number | null) {
  const context = await policyContext(db, workspaceId, agentId);
  const active = await latestAgentPolicy(db, workspaceId, agentId);
  if (expectedVersion !== undefined && expectedVersion !== (active?.version ?? null)) throw new ApiError(409, 'policy_changed', 'The agent policy changed. Create a new proposal under the current version.');
  return evaluate(context, active?.policy ?? null, active?.version ?? null, proposal, Date.now());
}
export async function agentPolicySettings(db: D1Database, workspace: WorkspaceContext, agentIdInput: unknown) {
  requirePermission(workspace.workspace.role, 'agents:manage');
  const agentId = policyId(agentIdInput, 'agentId');
  const context = await policyContext(db, workspace.workspaceId, agentId);
  const active = await latestAgentPolicy(db, workspace.workspaceId, agentId);
  const history = await db.prepare('SELECT version,created_at,created_by FROM agent_policy_versions WHERE workspace_id=? AND agent_id=? ORDER BY version DESC LIMIT 20').bind(workspace.workspaceId, agentId).all<{ version: number; created_at: string; created_by: string }>();
  const tools = context.tools.map((tool) => ({ id: tool.id, name: tool.name, usable: usableTool(tool, Date.now()), scopes: parseJson<string[]>(tool.grant_scopes_json, []), expiresAt: tool.expires_at }));
  return { agentId, active, draft: active?.policy ?? defaultAgentPolicy(tools.filter((tool) => tool.usable).map((tool) => tool.id), context.agent.monthly_budget_cents), tools, budgetCeilingCents: context.agent.monthly_budget_cents, spentCents: context.agent.spent_cents, agentStatus: context.agent.status, emergencyStopped: Boolean(context.agent.emergency_stopped_at), history: history.results.map((row) => ({ version: row.version, createdAt: row.created_at, createdBy: row.created_by })), externalExecution: false };
}
export async function dryRunAgentPolicy(db: D1Database, workspace: WorkspaceContext, input: { agentId: unknown; policy: unknown; proposal: unknown }) {
  requirePermission(workspace.workspace.role, 'agents:manage');
  requirePermission(workspace.workspace.role, 'records:read');
  const agentId = policyId(input.agentId, 'agentId');
  const policy = policyInput(input.policy);
  const proposal = parsePolicyProposal(input.proposal);
  const context = await policyContext(db, workspace.workspaceId, agentId);
  const now = Date.now();
  await validateOwnedPolicy(db, workspace.workspaceId, context, policy, now, false);
  const active = await latestAgentPolicy(db, workspace.workspaceId, agentId);
  return { dryRun: true, externalExecution: false, writes: false, basedOnVersion: active?.version ?? 0, decision: evaluate(context, policy, null, proposal, now) };
}
export async function saveAgentPolicy(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, input: { agentId: unknown; policy: unknown; expectedVersion: unknown }, operationIdInput: unknown) {
  requirePermission(workspace.workspace.role, 'agents:manage');
  requirePermission(workspace.workspace.role, 'records:read');
  const agentId = policyId(input.agentId, 'agentId');
  const operationId = policyId(operationIdInput, 'Idempotency-Key');
  if (typeof input.expectedVersion !== 'number' || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion >= POLICY_VERSION_LIMIT) throw new ApiError(400, 'policy_version_invalid', `expectedVersion must be from 0 to ${POLICY_VERSION_LIMIT - 1}.`);
  const policy = policyInput(input.policy);
  const document = JSON.stringify(policy);
  if (document.length > 16000) throw new ApiError(400, 'policy_too_large', 'Policy exceeds the supported size.');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ agentId, expectedVersion: input.expectedVersion, policy })));
  const requestHash = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const replay = async () => {
    const row = await db.prepare('SELECT version,document_json,created_at,created_by,request_hash FROM agent_policy_versions WHERE workspace_id=? AND agent_id=? AND operation_id=?').bind(workspace.workspaceId, agentId, operationId).first<RevisionRow>();
    if (!row) return null;
    if (row.request_hash !== requestHash) throw new ApiError(409, 'idempotency_conflict', 'This key was already used for a different policy save.');
    return { agentId, active: revision(row), replayed: true };
  };
  const previous = await replay();
  if (previous) return previous;
  const epoch = await captureWorkspaceMutationEpoch(db, workspace.workspaceId);
  const context = await policyContext(db, workspace.workspaceId, agentId);
  await validateOwnedPolicy(db, workspace.workspaceId, context, policy, Date.now(), true);
  const active = await latestAgentPolicy(db, workspace.workspaceId, agentId);
  if ((active?.version ?? 0) !== input.expectedVersion) throw new ApiError(409, 'policy_version_conflict', 'A newer policy exists. Reload it before saving; your draft has not been activated.');
  const version = input.expectedVersion + 1;
  const now = new Date().toISOString();
  try {
    await db.batch([
      db.prepare('INSERT INTO agent_policy_versions (workspace_id,agent_id,version,document_json,operation_id,request_hash,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(workspace.workspaceId, agentId, version, document, operationId, requestHash, identity.userId, now),
      db.prepare("INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at) VALUES (?,?,?,'agent.policy.activated','agent',?,?,?,?)").bind(crypto.randomUUID(), workspace.workspaceId, identity.userId, agentId, JSON.stringify({ version, previousVersion: input.expectedVersion, stopped: policy.stopped, toolCount: policy.allowedToolIds.length, oldAuthorizationsCancelled: true }), identity.requestId, now),
      workspaceMutationFence(db, workspace.workspaceId, epoch, `agent.policy:${agentId}:${version}`, now),
    ]);
  } catch (error) {
    const committed = await replay();
    if (committed) return committed;
    if (/agent policy|agent_policy_versions|uq_agent_policy_operation/i.test(String(error))) throw new ApiError(409, 'policy_state_changed', 'The policy, grant, or budget changed during activation. Reload and review before saving.');
    throw normalizeMutationFenceError(error);
  }
  return { agentId, active: { version, policy, createdAt: now, createdBy: identity.userId }, replayed: false };
}
