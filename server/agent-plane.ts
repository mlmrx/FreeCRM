import { evaluateAgentAction, type AgentActionContext } from '@/lib/multi-edition';
import type { RequestIdentity } from './request-context';
import type { WorkspaceContext } from './control-plane';
import { ApiError } from './request-context';
import { requirePermission } from './authorization';

export type ProposedAgentAction = AgentActionContext & { agentId: string; goalId?: string; toolId: string; summary: string; idempotencyKey: string };

/** Atomically persists the policy decision, run, trace, optional approval, and audit receipt. */
export async function proposeAgentAction(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, action: ProposedAgentAction) {
  requirePermission(workspace.workspace.role, 'agents:manage');
  if (!action.summary.trim() || action.summary.length > 500 || !action.idempotencyKey || action.idempotencyKey.length > 128) throw new ApiError(400, 'validation_error', 'A bounded summary and idempotency key are required.');
  const decision = evaluateAgentAction(action);
  const runId = crypto.randomUUID();
  const approvalId = decision.decision === 'require-approval' ? crypto.randomUUID() : null;
  const now = new Date().toISOString();
  const existing = await db.prepare('SELECT id, status FROM agent_runs WHERE workspace_id = ? AND idempotency_key = ?').bind(workspace.workspaceId, action.idempotencyKey).first<{ id: string; status: string }>();
  if (existing) return { runId: existing.id, status: existing.status, replayed: true, decision };
  const status = decision.mayExecute ? 'authorized' : decision.decision === 'require-approval' ? 'awaiting_approval' : 'constrained';
  const statements = [
    db.prepare('INSERT INTO agent_runs (id, workspace_id, agent_id, goal_id, status, budget_reserved_cents, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(runId, workspace.workspaceId, action.agentId, action.goalId ?? null, status, action.estimatedCostCents, action.idempotencyKey, now),
    db.prepare("INSERT INTO agent_traces (id, workspace_id, run_id, sequence, event_type, detail_json, created_at) VALUES (?, ?, ?, 1, 'policy_decision', ?, ?)").bind(crypto.randomUUID(), workspace.workspaceId, runId, JSON.stringify({ decision: decision.decision, reason: decision.reason, scope: action.requestedScope }), now),
    db.prepare("INSERT INTO audit_events (id, workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json, request_id, created_at) VALUES (?, ?, ?, 'agent.action.proposed', 'agent_run', ?, ?, ?, ?)").bind(crypto.randomUUID(), workspace.workspaceId, identity.userId, runId, JSON.stringify({ decision: decision.decision, toolId: action.toolId }), identity.requestId, now),
  ];
  if (approvalId) statements.push(db.prepare("INSERT INTO approval_requests (id, workspace_id, run_id, requested_by_actor_id, status, action_summary, expires_at, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)").bind(approvalId, workspace.workspaceId, runId, identity.userId, action.summary.trim(), new Date(Date.now() + 86_400_000).toISOString(), now));
  await db.batch(statements);
  return { runId, approvalId, status, replayed: false, decision };
}
