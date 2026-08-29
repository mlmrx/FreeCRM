import { autonomyLevels, evaluateAgentAction, type AutonomyLevel } from '@/lib/multi-edition';
import type { RequestIdentity } from './request-context';
import type { WorkspaceContext } from './control-plane';
import { ApiError } from './request-context';
import { requirePermission } from './authorization';

const json = (value: unknown) => JSON.stringify(value ?? {});
const bounded = (value: unknown, name: string, max = 500) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ApiError(400, 'validation_error', `${name} is required and must be at most ${max} characters.`);
  return value.trim();
};
async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(json(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function audit(db: D1Database, identity: RequestIdentity, workspaceId: string, action: string, entityType: string, entityId: string, metadata: unknown, now: string) {
  return db.prepare('INSERT INTO audit_events (id, workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), workspaceId, identity.userId, action, entityType, entityId, json(metadata), identity.requestId, now);
}

export async function createAgent(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, input: { name: unknown; autonomy: unknown; monthlyBudgetCents: unknown }) {
  requirePermission(workspace.workspace.role, 'agents:manage');
  const name = bounded(input.name, 'name', 120);
  if (!autonomyLevels.includes(input.autonomy as AutonomyLevel)) throw new ApiError(400, 'validation_error', 'A valid autonomy level is required.');
  const budget = Number(input.monthlyBudgetCents);
  if (!Number.isInteger(budget) || budget < 0 || budget > 10_000_000) throw new ApiError(400, 'validation_error', 'monthlyBudgetCents must be a safe non-negative integer.');
  const now = new Date().toISOString();
  const ownerActorId = `human:${identity.userId}`;
  const actorId = crypto.randomUUID();
  const agentId = crypto.randomUUID();
  const toolId = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO actors (id, workspace_id, kind, display_name, metadata_json, created_at, updated_at) VALUES (?, ?, 'human', ?, '{}', ?, ?) ON CONFLICT(workspace_id,id) DO NOTHING").bind(ownerActorId, workspace.workspaceId, identity.displayName, now, now),
    db.prepare("INSERT INTO actors (id, workspace_id, kind, display_name, metadata_json, created_at, updated_at) VALUES (?, ?, 'agent', ?, '{}', ?, ?)").bind(actorId, workspace.workspaceId, name, now, now),
    db.prepare("INSERT INTO agent_identities (id, workspace_id, actor_id, owner_actor_id, autonomy_level, status, monthly_budget_cents, spent_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'paused', ?, 0, ?, ?)").bind(agentId, workspace.workspaceId, actorId, ownerActorId, input.autonomy, budget, now, now),
    db.prepare("INSERT INTO agent_tools (id, workspace_id, name, transport, external, scopes_json, input_schema_json, enabled, created_at) VALUES (?, ?, 'Local CRM simulator', 'local-simulator', 0, '[\"records:read\"]', '{}', 1, ?)").bind(toolId, workspace.workspaceId, now),
    db.prepare("INSERT INTO agent_tool_grants (workspace_id, agent_id, tool_id, scopes_json, created_at) VALUES (?, ?, ?, '[\"records:read\"]', ?)").bind(workspace.workspaceId, agentId, toolId, now),
    audit(db, identity, workspace.workspaceId, 'agent.created', 'agent', agentId, { autonomy: input.autonomy, budget }, now),
  ]);
  return { agentId, toolId, status: 'paused' };
}

export type ProposedAgentAction = { agentId: string; goalId?: string; toolId: string; summary: string; requestedScope: string; estimatedCostCents: number; destructive?: boolean; idempotencyKey: string };

export async function proposeAgentAction(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, action: ProposedAgentAction) {
  requirePermission(workspace.workspace.role, 'agents:manage');
  const summary = bounded(action.summary, 'summary');
  bounded(action.idempotencyKey, 'idempotencyKey', 128);
  const estimate = Number(action.estimatedCostCents);
  if (!Number.isInteger(estimate) || estimate < 0) throw new ApiError(400, 'validation_error', 'estimatedCostCents must be a non-negative integer.');
  type PolicyRow = { autonomy_level: AutonomyLevel; status: string; monthly_budget_cents: number; spent_cents: number; emergency_stopped_at: string | null; external: number; enabled: number; scopes_json: string; transport: string };
  const row = await db.prepare(`SELECT ai.autonomy_level, ai.status, ai.monthly_budget_cents, ai.spent_cents, ai.emergency_stopped_at, t.external, t.enabled, t.transport, g.scopes_json FROM agent_identities ai JOIN agent_tool_grants g ON g.workspace_id=ai.workspace_id AND g.agent_id=ai.id JOIN agent_tools t ON t.workspace_id=g.workspace_id AND t.id=g.tool_id WHERE ai.workspace_id=? AND ai.id=? AND t.id=?`).bind(workspace.workspaceId, action.agentId, action.toolId).first<PolicyRow>();
  if (!row || !row.enabled) throw new ApiError(403, 'tool_not_granted', 'The requested tool is not enabled and granted to this agent.');
  const scopes = JSON.parse(row.scopes_json) as string[];
  const decision = evaluateAgentAction({ autonomy: row.autonomy_level, external: Boolean(row.external), destructive: Boolean(action.destructive), paused: row.status !== 'active', emergencyStopped: Boolean(row.emergency_stopped_at), requestedScope: action.requestedScope, allowedScopes: scopes, budgetRemainingCents: row.monthly_budget_cents - row.spent_cents, estimatedCostCents: estimate, policyAllowsAutonomous: false });
  const existing = await db.prepare('SELECT id, status FROM agent_runs WHERE workspace_id=? AND idempotency_key=?').bind(workspace.workspaceId, action.idempotencyKey).first<{ id: string; status: string }>();
  if (existing) return { runId: existing.id, status: existing.status, replayed: true, decision };
  const runId = crypto.randomUUID();
  const approvalId = decision.decision === 'require-approval' ? crypto.randomUUID() : null;
  const now = new Date().toISOString();
  const status = decision.mayExecute ? 'authorized' : approvalId ? 'awaiting_approval' : 'constrained';
  const statements = [
    db.prepare('INSERT INTO agent_runs (id,workspace_id,agent_id,goal_id,tool_id,action_json,status,budget_reserved_cents,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(runId, workspace.workspaceId, action.agentId, action.goalId ?? null, action.toolId, json({ summary, scope: action.requestedScope, transport: row.transport }), status, estimate, action.idempotencyKey, now),
    db.prepare("INSERT INTO agent_traces (id,workspace_id,run_id,sequence,event_type,detail_json,created_at) VALUES (?,?,?,1,'policy_decision',?,?)").bind(crypto.randomUUID(), workspace.workspaceId, runId, json({ decision: decision.decision, reason: decision.reason }), now),
    audit(db, identity, workspace.workspaceId, 'agent.action.proposed', 'agent_run', runId, { decision: decision.decision, toolId: action.toolId }, now),
  ];
  if (approvalId) statements.push(db.prepare("INSERT INTO approval_requests (id,workspace_id,run_id,requested_by_actor_id,status,action_summary,expires_at,created_at) VALUES (?,?,?,?,'pending',?,?,?)").bind(approvalId, workspace.workspaceId, runId, identity.userId, summary, new Date(Date.now() + 86_400_000).toISOString(), now));
  await db.batch(statements);
  return { runId, approvalId, status, replayed: false, decision };
}

export async function setAgentSafety(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, input: { agentId: string; status?: 'active' | 'paused'; emergencyStop?: boolean }) {
  requirePermission(workspace.workspace.role, 'agents:manage');
  const now = new Date().toISOString();
  if (!input.status && typeof input.emergencyStop !== 'boolean') throw new ApiError(400, 'validation_error', 'A status or emergencyStop value is required.');
  const nextStatus = input.emergencyStop === true ? 'paused' : input.status ?? null;
  const result = await db.prepare(`UPDATE agent_identities SET status=COALESCE(?,status), emergency_stopped_at=CASE WHEN ?=1 THEN ? WHEN ?=0 THEN NULL ELSE emergency_stopped_at END, updated_at=? WHERE workspace_id=? AND id=?`).bind(nextStatus, input.emergencyStop === true ? 1 : input.emergencyStop === false ? 0 : null, now, input.emergencyStop === true ? 1 : input.emergencyStop === false ? 0 : null, now, workspace.workspaceId, input.agentId).run();
  if (!result.meta.changes) throw new ApiError(404, 'agent_not_found', 'Agent was not found in this workspace.');
  await audit(db, identity, workspace.workspaceId, input.emergencyStop ? 'agent.emergency_stopped' : 'agent.safety_updated', 'agent', input.agentId, { status: input.status, emergencyStop: input.emergencyStop }, now).run();
  return { agentId: input.agentId, status: input.status, emergencyStop: input.emergencyStop };
}

export async function decideApproval(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, input: { approvalId: string; decision: 'approved' | 'rejected' }) {
  requirePermission(workspace.workspace.role, 'agents:approve');
  const now = new Date().toISOString();
  const approval = await db.prepare("SELECT run_id, expires_at FROM approval_requests WHERE workspace_id=? AND id=? AND status='pending'").bind(workspace.workspaceId, input.approvalId).first<{ run_id: string; expires_at: string }>();
  if (!approval) throw new ApiError(409, 'approval_unavailable', 'Approval is not pending in this workspace.');
  if (new Date(approval.expires_at) <= new Date()) throw new ApiError(409, 'approval_expired', 'Approval has expired.');
  await db.batch([
    db.prepare('UPDATE approval_requests SET status=?,decided_by_actor_id=?,decided_at=? WHERE workspace_id=? AND id=? AND status=\'pending\'').bind(input.decision, identity.userId, now, workspace.workspaceId, input.approvalId),
    db.prepare('UPDATE agent_runs SET status=? WHERE workspace_id=? AND id=?').bind(input.decision === 'approved' ? 'authorized' : 'rejected', workspace.workspaceId, approval.run_id),
    audit(db, identity, workspace.workspaceId, `agent.approval.${input.decision}`, 'approval', input.approvalId, { runId: approval.run_id }, now),
  ]);
  return { approvalId: input.approvalId, runId: approval.run_id, status: input.decision };
}

export async function executeAuthorizedRun(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, runId: string) {
  requirePermission(workspace.workspace.role, 'agents:manage');
  type RunRow = { agent_id: string; tool_id: string; action_json: string; budget_reserved_cents: number; transport: string; status: string; agent_status: string; emergency_stopped_at: string | null; monthly_budget_cents: number; spent_cents: number };
  const run = await db.prepare(`SELECT r.agent_id,r.tool_id,r.action_json,r.budget_reserved_cents,r.status,t.transport,ai.status agent_status,ai.emergency_stopped_at,ai.monthly_budget_cents,ai.spent_cents FROM agent_runs r JOIN agent_identities ai ON ai.workspace_id=r.workspace_id AND ai.id=r.agent_id JOIN agent_tools t ON t.workspace_id=r.workspace_id AND t.id=r.tool_id WHERE r.workspace_id=? AND r.id=?`).bind(workspace.workspaceId, runId).first<RunRow>();
  if (!run || run.status !== 'authorized') throw new ApiError(409, 'run_not_authorized', 'Run is not authorized for execution.');
  if (run.agent_status !== 'active' || run.emergency_stopped_at) throw new ApiError(409, 'agent_stopped', 'Agent is paused or emergency-stopped.');
  if (run.spent_cents + run.budget_reserved_cents > run.monthly_budget_cents) throw new ApiError(409, 'budget_exceeded', 'Agent budget is no longer sufficient.');
  if (run.transport !== 'local-simulator') throw new ApiError(409, 'external_execution_disabled', 'Only the local simulator can execute in this milestone.');
  const now = new Date().toISOString();
  const action = JSON.parse(run.action_json) as Record<string, unknown>;
  const output = { simulated: true, summary: action.summary, executedAt: now };
  const receiptId = crypto.randomUUID();
  await db.batch([
    db.prepare("UPDATE agent_runs SET status='succeeded',started_at=?,finished_at=? WHERE workspace_id=? AND id=? AND status='authorized'").bind(now, now, workspace.workspaceId, runId),
    db.prepare('UPDATE agent_identities SET spent_cents=spent_cents+?,updated_at=? WHERE workspace_id=? AND id=?').bind(run.budget_reserved_cents, now, workspace.workspaceId, run.agent_id),
    db.prepare("INSERT INTO execution_receipts (id,workspace_id,run_id,tool_id,outcome,input_hash,output_hash,cost_cents,metadata_json,created_at) VALUES (?,?,?,?, 'succeeded',?,?,?,?,?)").bind(receiptId, workspace.workspaceId, runId, run.tool_id, await digest(action), await digest(output), run.budget_reserved_cents, json({ simulator: true }), now),
    db.prepare("INSERT INTO agent_traces (id,workspace_id,run_id,sequence,event_type,detail_json,created_at) SELECT ?,?,?,COALESCE(MAX(sequence),0)+1,'execution_completed',?,? FROM agent_traces WHERE workspace_id=? AND run_id=?").bind(crypto.randomUUID(), workspace.workspaceId, runId, json({ receiptId }), now, workspace.workspaceId, runId),
    audit(db, identity, workspace.workspaceId, 'agent.run.executed', 'agent_run', runId, { receiptId, simulator: true }, now),
  ]);
  return { runId, receiptId, status: 'succeeded', output };
}
