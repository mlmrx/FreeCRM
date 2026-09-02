import { autonomyLevels, evaluateAgentAction, type AgentDecision, type AutonomyLevel } from '@/lib/multi-edition';
import type { RequestIdentity } from './request-context';
import type { WorkspaceContext } from './control-plane';
import { ApiError } from './request-context';
import { requirePermission } from './authorization';
import { getWorkspaceCapabilities } from './capabilities';
import { captureWorkspaceMutationEpoch, normalizeMutationFenceError, workspaceMutationFence } from './mutation-fence';
import { pruneExpiredIdempotencyRecords } from './idempotency-maintenance';
import { assertD1BatchSize } from './d1-limits';

const json = (value: unknown) => JSON.stringify(value ?? {});

const bounded = (value: unknown, name: string, max = 500) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ApiError(400, 'validation_error', `${name} is required and must be at most ${max} characters.`);
  return value.trim();
};

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(json(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function humanActorId(identity: RequestIdentity): Promise<string> {
  return `human:${await digest(identity.userId)}`;
}

function humanActorStatement(db: D1Database, identity: RequestIdentity, workspaceId: string, actorId: string, now: string) {
  return db.prepare("INSERT INTO actors (id,workspace_id,kind,display_name,metadata_json,created_at,updated_at) VALUES (?,?,'human',?,'{}',?,?) ON CONFLICT(workspace_id,id) DO NOTHING").bind(actorId, workspaceId, identity.displayName, now, now);
}

function audit(db: D1Database, identity: RequestIdentity, workspaceId: string, action: string, entityType: string, entityId: string, metadata: unknown, now: string) {
  return db.prepare('INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), workspaceId, identity.userId, action, entityType, entityId, json(metadata), identity.requestId, now);
}

type MutationReceiptRow = {
  request_hash: string;
  response_json: string;
};

async function createAgentReplay(db: D1Database, workspaceId: string, idempotencyKey: string, requestHash: string) {
  const receipt = await db.prepare("SELECT request_hash,response_json FROM idempotency_records WHERE workspace_id=? AND operation='agent.create' AND key=?")
    .bind(workspaceId, idempotencyKey)
    .first<MutationReceiptRow>();
  if (!receipt) return null;
  if (receipt.request_hash !== requestHash) throw new ApiError(409, 'idempotency_conflict', 'That idempotency key was already used to create a different agent.');
  const response = parseJson<{ agentId?: unknown; toolId?: unknown; status?: unknown; result?: { discardedByReset?: unknown } }>(receipt.response_json, {});
  if (response.result?.discardedByReset === true) throw new ApiError(409, 'idempotency_receipt_discarded', 'A workspace reset discarded this prior agent creation receipt. Submit the action again with a new idempotency key.');
  if (typeof response.agentId !== 'string' || !response.agentId || response.agentId.length > 128
    || typeof response.toolId !== 'string' || !response.toolId || response.toolId.length > 128
    || response.status !== 'paused') {
    throw new ApiError(500, 'idempotency_receipt_invalid', 'The stored agent creation receipt is invalid; no new agent was created.');
  }
  return { agentId: response.agentId, toolId: response.toolId, status: 'paused' as const, replayed: true };
}

export async function createAgent(
  db: D1Database,
  identity: RequestIdentity,
  workspace: WorkspaceContext,
  input: { name: unknown; autonomy: unknown; monthlyBudgetCents: unknown },
  idempotencyKeyInput?: unknown,
) {
  requirePermission(workspace.workspace.role, 'agents:manage');
  const name = bounded(input.name, 'name', 120);
  if (!autonomyLevels.includes(input.autonomy as AutonomyLevel)) throw new ApiError(400, 'validation_error', 'A valid autonomy level is required.');
  const autonomy = input.autonomy as AutonomyLevel;
  const budget = Number(input.monthlyBudgetCents);
  if (!Number.isSafeInteger(budget) || budget < 0 || budget > 10_000_000) throw new ApiError(400, 'validation_error', 'monthlyBudgetCents must be a safe non-negative integer no greater than 10000000.');
  const idempotencyKey = bounded(idempotencyKeyInput, 'Idempotency-Key', 128);
  const requestHash = await digest({ name, autonomy, monthlyBudgetCents: budget });

  const capability = (await getWorkspaceCapabilities(db, workspace)).agentPlane;
  if (!capability.enabled) throw new ApiError(403, 'capability_disabled', 'Agents is disabled for this workspace.');
  await pruneExpiredIdempotencyRecords(db, workspace.workspaceId);
  const replay = await createAgentReplay(db, workspace.workspaceId, idempotencyKey, requestHash);
  if (replay) return replay;
  const mutationEpoch = await captureWorkspaceMutationEpoch(db, workspace.workspaceId);
  if (capability.limit !== null) {
    const usage = await db.prepare('SELECT COUNT(*) AS count FROM agent_identities WHERE workspace_id=?').bind(workspace.workspaceId).first<{ count: number }>();
    if ((usage?.count ?? 0) >= capability.limit) throw new ApiError(409, 'capability_limit', `Agents has reached its workspace limit of ${capability.limit}.`);
  }

  const now = new Date().toISOString();
  const ownerActorId = await humanActorId(identity);
  const actorId = crypto.randomUUID();
  const agentId = crypto.randomUUID();
  const toolId = crypto.randomUUID();
  const response = { agentId, toolId, status: 'paused' as const };
  try {
    await db.batch(assertD1BatchSize([
      humanActorStatement(db, identity, workspace.workspaceId, ownerActorId, now),
      db.prepare("INSERT INTO actors (id,workspace_id,kind,display_name,metadata_json,created_at,updated_at) VALUES (?,?,'agent',?,'{}',?,?)").bind(actorId, workspace.workspaceId, name, now, now),
      db.prepare("INSERT INTO agent_identities (id,workspace_id,actor_id,owner_actor_id,autonomy_level,status,monthly_budget_cents,spent_cents,created_at,updated_at) VALUES (?,?,?,?,?,'paused',?,0,?,?)").bind(agentId, workspace.workspaceId, actorId, ownerActorId, autonomy, budget, now, now),
      db.prepare("INSERT INTO agent_tools (id,workspace_id,name,transport,external,scopes_json,input_schema_json,enabled,created_at) VALUES (?,?,'Local CRM insights','local-simulator',0,'[\"records:read\"]','{}',1,?)").bind(toolId, workspace.workspaceId, now),
      db.prepare("INSERT INTO agent_tool_grants (workspace_id,agent_id,tool_id,scopes_json,created_at) VALUES (?,?,?,'[\"records:read\"]',?)").bind(workspace.workspaceId, agentId, toolId, now),
      audit(db, identity, workspace.workspaceId, 'agent.created', 'agent', agentId, { autonomy, monthlyBudgetCents: budget, initialStatus: 'paused' }, now),
      workspaceMutationFence(db, workspace.workspaceId, mutationEpoch, `agent.create:${agentId}`, now),
      db.prepare("INSERT INTO idempotency_records (workspace_id,operation,key,request_hash,status_code,response_json,created_at,expires_at) VALUES (?,'agent.create',?,?,201,?,?,?)").bind(workspace.workspaceId, idempotencyKey, requestHash, json(response), now, new Date(Date.now() + 86_400_000).toISOString()),
    ], 'Agent creation'));
  } catch (error) {
    const committed = await createAgentReplay(db, workspace.workspaceId, idempotencyKey, requestHash);
    if (committed) return committed;
    if (String(error).includes('agent capability limit exceeded')) throw new ApiError(409, 'capability_limit', 'Agents has reached its workspace profile limit.');
    throw normalizeMutationFenceError(error);
  }
  return { ...response, replayed: false };
}

export type ProposedAgentAction = {
  agentId: string;
  goalId?: string;
  toolId: string;
  summary: string;
  requestedScope: string;
  estimatedCostCents: number;
  destructive?: boolean;
  idempotencyKey: string;
};

type ExistingRun = {
  id: string;
  agent_id: string;
  goal_id: string | null;
  tool_id: string | null;
  action_json: string;
  budget_reserved_cents: number;
  status: string;
};

async function proposalReplay(db: D1Database, workspaceId: string, request: { agentId: string; goalId: string | null; toolId: string; summary: string; scope: string; estimatedCostCents: number; destructive: boolean; idempotencyKey: string }) {
  const existing = await db.prepare('SELECT id,agent_id,goal_id,tool_id,action_json,budget_reserved_cents,status FROM agent_runs WHERE workspace_id=? AND idempotency_key=?').bind(workspaceId, request.idempotencyKey).first<ExistingRun>();
  if (!existing) return null;
  const stored = parseJson<{ summary?: string; scope?: string; destructive?: boolean }>(existing.action_json, {});
  const same = existing.agent_id === request.agentId
    && existing.goal_id === request.goalId
    && existing.tool_id === request.toolId
    && existing.budget_reserved_cents === request.estimatedCostCents
    && stored.summary === request.summary
    && stored.scope === request.scope
    && Boolean(stored.destructive) === request.destructive;
  if (!same) throw new ApiError(409, 'idempotency_conflict', 'That idempotency key was already used with a different agent action.');
  const [trace, approval] = await Promise.all([
    db.prepare("SELECT detail_json FROM agent_traces WHERE workspace_id=? AND run_id=? AND event_type='policy_decision' ORDER BY sequence LIMIT 1").bind(workspaceId, existing.id).first<{ detail_json: string }>(),
    db.prepare('SELECT id FROM approval_requests WHERE workspace_id=? AND run_id=? ORDER BY created_at LIMIT 1').bind(workspaceId, existing.id).first<{ id: string }>(),
  ]);
  const detail = parseJson<{ decision?: AgentDecision }>(trace?.detail_json ?? '{}', {});
  return { runId: existing.id, approvalId: approval?.id ?? null, status: existing.status, replayed: true, decision: detail.decision ?? { decision: 'deny', reason: 'Stored policy decision is unavailable.', mayExecute: false } };
}

export async function proposeAgentAction(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, action: ProposedAgentAction) {
  requirePermission(workspace.workspace.role, 'agents:manage');
  const agentId = bounded(action.agentId, 'agentId', 128);
  const toolId = bounded(action.toolId, 'toolId', 128);
  const requestedScope = bounded(action.requestedScope, 'requestedScope', 120);
  const summary = bounded(action.summary, 'summary');
  const idempotencyKey = bounded(action.idempotencyKey, 'idempotencyKey', 128);
  const goalId = action.goalId === undefined ? null : bounded(action.goalId, 'goalId', 128);
  const estimate = Number(action.estimatedCostCents);
  if (!Number.isSafeInteger(estimate) || estimate < 0 || estimate > 10_000_000) throw new ApiError(400, 'validation_error', 'estimatedCostCents must be a safe non-negative integer no greater than 10000000.');
  if (action.destructive !== undefined && typeof action.destructive !== 'boolean') throw new ApiError(400, 'validation_error', 'destructive must be a boolean.');
  const destructive = action.destructive ?? false;
  const mutationEpoch = await captureWorkspaceMutationEpoch(db, workspace.workspaceId);
  const replayRequest = { agentId, goalId, toolId, summary, scope: requestedScope, estimatedCostCents: estimate, destructive, idempotencyKey };
  const replay = await proposalReplay(db, workspace.workspaceId, replayRequest);
  if (replay) return replay;

  type PolicyRow = { autonomy_level: AutonomyLevel; status: string; monthly_budget_cents: number; spent_cents: number; emergency_stopped_at: string | null; external: number; enabled: number; tool_scopes_json: string; grant_scopes_json: string; grant_expires_at: string | null; transport: string };
  const row = await db.prepare(`SELECT ai.autonomy_level,ai.status,ai.monthly_budget_cents,ai.spent_cents,ai.emergency_stopped_at,t.external,t.enabled,t.transport,t.scopes_json AS tool_scopes_json,g.scopes_json AS grant_scopes_json,g.expires_at AS grant_expires_at FROM agent_identities ai JOIN agent_tool_grants g ON g.workspace_id=ai.workspace_id AND g.agent_id=ai.id JOIN agent_tools t ON t.workspace_id=g.workspace_id AND t.id=g.tool_id WHERE ai.workspace_id=? AND ai.id=? AND t.id=?`).bind(workspace.workspaceId, agentId, toolId).first<PolicyRow>();
  if (!row || !row.enabled) throw new ApiError(403, 'tool_not_granted', 'The requested tool is not enabled and granted to this agent.');
  const grantExpiry = row.grant_expires_at === null ? null : Date.parse(row.grant_expires_at);
  if (grantExpiry !== null && (!Number.isFinite(grantExpiry) || grantExpiry <= Date.now())) {
    throw new ApiError(403, 'grant_expired', 'The requested tool grant has expired.');
  }
  if (goalId) {
    const goal = await db.prepare('SELECT 1 AS found FROM agent_goals WHERE workspace_id=? AND id=? AND agent_id=?').bind(workspace.workspaceId, goalId, agentId).first<{ found: number }>();
    if (!goal) throw new ApiError(404, 'goal_not_found', 'Goal was not found for this agent in this workspace.');
  }
  const toolScopes = parseJson<string[]>(row.tool_scopes_json, []);
  const grantScopes = parseJson<string[]>(row.grant_scopes_json, []);
  const allowedScopes = grantScopes.filter((scope) => toolScopes.includes(scope));
  const decision = evaluateAgentAction({ autonomy: row.autonomy_level, external: Boolean(row.external), destructive, paused: row.status !== 'active', emergencyStopped: Boolean(row.emergency_stopped_at), requestedScope, allowedScopes, budgetRemainingCents: row.monthly_budget_cents - row.spent_cents, estimatedCostCents: estimate, policyAllowsAutonomous: false });
  const runId = crypto.randomUUID();
  const approvalId = decision.decision === 'require-approval' ? crypto.randomUUID() : null;
  const status = decision.mayExecute ? 'authorized' : approvalId ? 'awaiting_approval' : 'constrained';
  const canonicalRequest = { agentId, goalId, toolId, summary, scope: requestedScope, estimatedCostCents: estimate, destructive };
  const requestHash = await digest(canonicalRequest);
  const actionJson = json({ summary, scope: requestedScope, destructive, transport: row.transport });
  const now = new Date().toISOString();
  const actorId = await humanActorId(identity);
  const statements: D1PreparedStatement[] = [
    humanActorStatement(db, identity, workspace.workspaceId, actorId, now),
    db.prepare('INSERT INTO agent_runs (id,workspace_id,agent_id,goal_id,tool_id,action_json,status,budget_reserved_cents,idempotency_key,request_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(runId, workspace.workspaceId, agentId, goalId, toolId, actionJson, status, estimate, idempotencyKey, requestHash, now),
    db.prepare("INSERT INTO agent_traces (id,workspace_id,run_id,sequence,event_type,detail_json,created_at) VALUES (?,?,?,1,'policy_decision',?,?)").bind(crypto.randomUUID(), workspace.workspaceId, runId, json({ decision }), now),
    audit(db, identity, workspace.workspaceId, 'agent.action.proposed', 'agent_run', runId, { decision: decision.decision, toolId, requestedScope, estimatedCostCents: estimate }, now),
  ];
  if (approvalId) statements.push(db.prepare("INSERT INTO approval_requests (id,workspace_id,run_id,requested_by_actor_id,status,action_summary,expires_at,created_at) VALUES (?,?,?,?,'pending',?,?,?)").bind(approvalId, workspace.workspaceId, runId, actorId, summary, new Date(Date.now() + 86_400_000).toISOString(), now));
  statements.push(workspaceMutationFence(db, workspace.workspaceId, mutationEpoch, `agent.propose:${runId}`, now));
  try {
    await db.batch(statements);
  } catch (error) {
    const concurrent = await proposalReplay(db, workspace.workspaceId, replayRequest);
    if (concurrent) return concurrent;
    throw normalizeMutationFenceError(error);
  }
  return { runId, approvalId, status, replayed: false, decision };
}

export async function setAgentSafety(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, input: { agentId: unknown; status?: unknown; emergencyStop?: unknown }) {
  requirePermission(workspace.workspace.role, 'agents:manage');
  const agentId = bounded(input.agentId, 'agentId', 128);
  if (input.status !== undefined && input.status !== 'active' && input.status !== 'paused') throw new ApiError(400, 'validation_error', 'status must be active or paused.');
  if (input.emergencyStop !== undefined && typeof input.emergencyStop !== 'boolean') throw new ApiError(400, 'validation_error', 'emergencyStop must be a boolean.');
  if (input.status === undefined && input.emergencyStop === undefined) throw new ApiError(400, 'validation_error', 'A status or emergencyStop value is required.');
  if (input.emergencyStop === false && input.status === 'active') throw new ApiError(400, 'validation_error', 'Clearing an emergency stop always leaves the agent paused.');
  const mutationEpoch = await captureWorkspaceMutationEpoch(db, workspace.workspaceId);
  const exists = await db.prepare('SELECT 1 AS found FROM agent_identities WHERE workspace_id=? AND id=?').bind(workspace.workspaceId, agentId).first<{ found: number }>();
  if (!exists) throw new ApiError(404, 'agent_not_found', 'Agent was not found in this workspace.');
  const now = new Date().toISOString();
  const nextStatus = input.emergencyStop === undefined ? input.status! : 'paused';
  const marker = input.emergencyStop === true ? now : null;
  const update = input.emergencyStop === true
    ? db.prepare("UPDATE agent_identities SET status='paused',emergency_stopped_at=?,updated_at=? WHERE workspace_id=? AND id=? AND emergency_stopped_at IS NULL").bind(now, now, workspace.workspaceId, agentId)
    : input.emergencyStop === false
      ? db.prepare("UPDATE agent_identities SET status='paused',emergency_stopped_at=NULL,updated_at=? WHERE workspace_id=? AND id=? AND emergency_stopped_at IS NOT NULL").bind(now, workspace.workspaceId, agentId)
      : input.status === 'active'
        ? db.prepare("UPDATE agent_identities SET status='active',updated_at=? WHERE workspace_id=? AND id=? AND emergency_stopped_at IS NULL").bind(now, workspace.workspaceId, agentId)
        : db.prepare("UPDATE agent_identities SET status='paused',updated_at=? WHERE workspace_id=? AND id=?").bind(now, workspace.workspaceId, agentId);
  const statements: D1PreparedStatement[] = [update];
  if (input.emergencyStop === true) {
    statements.push(
      db.prepare("UPDATE approval_requests SET status='cancelled',decided_at=?,decision_id='safety:' || id || ':' || ? WHERE workspace_id=? AND status='pending' AND run_id IN (SELECT id FROM agent_runs WHERE workspace_id=? AND agent_id=? AND status IN ('awaiting_approval','authorized','running')) AND EXISTS (SELECT 1 FROM agent_identities WHERE workspace_id=? AND id=? AND emergency_stopped_at=? AND updated_at=?)").bind(now, identity.requestId, workspace.workspaceId, workspace.workspaceId, agentId, workspace.workspaceId, agentId, now, now),
      db.prepare("INSERT INTO agent_traces (id,workspace_id,run_id,sequence,event_type,detail_json,created_at) SELECT lower(hex(randomblob(16))),workspace_id,id,COALESCE((SELECT MAX(sequence)+1 FROM agent_traces WHERE workspace_id=agent_runs.workspace_id AND run_id=agent_runs.id),1),'emergency_cancelled','{\"reason\":\"emergency_stop\"}',? FROM agent_runs WHERE workspace_id=? AND agent_id=? AND status IN ('awaiting_approval','authorized','running') AND EXISTS (SELECT 1 FROM agent_identities WHERE workspace_id=? AND id=? AND emergency_stopped_at=? AND updated_at=?)").bind(now, workspace.workspaceId, agentId, workspace.workspaceId, agentId, now, now),
      db.prepare("UPDATE agent_runs SET status='cancelled',finished_at=? WHERE workspace_id=? AND agent_id=? AND status IN ('awaiting_approval','authorized','running') AND EXISTS (SELECT 1 FROM agent_identities WHERE workspace_id=? AND id=? AND emergency_stopped_at=? AND updated_at=?)").bind(now, workspace.workspaceId, agentId, workspace.workspaceId, agentId, now, now),
    );
  }
  const auditAction = input.emergencyStop === true ? 'agent.emergency_stopped' : input.emergencyStop === false ? 'agent.emergency_cleared' : 'agent.safety_updated';
  statements.push(db.prepare("INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at) SELECT ?,workspace_id,?,?,'agent',id,?,?,? FROM agent_identities WHERE workspace_id=? AND id=? AND updated_at=? AND ((? IS NULL AND emergency_stopped_at IS NULL) OR emergency_stopped_at=?)").bind(crypto.randomUUID(), identity.userId, auditAction, json({ status: nextStatus, emergencyStop: input.emergencyStop }), identity.requestId, now, workspace.workspaceId, agentId, now, marker, marker));
  statements.push(workspaceMutationFence(db, workspace.workspaceId, mutationEpoch, `agent.safety:${agentId}:${identity.requestId}`, now));
  const results = await db.batch(statements).catch((error) => { throw normalizeMutationFenceError(error); });
  const current = await db.prepare('SELECT status,emergency_stopped_at FROM agent_identities WHERE workspace_id=? AND id=?').bind(workspace.workspaceId, agentId).first<{ status: string; emergency_stopped_at: string | null }>();
  if (!current) throw new ApiError(404, 'agent_not_found', 'Agent was not found in this workspace.');
  if (!(results[0]?.meta.changes ?? 0)) {
    if (input.status === 'active' && current.emergency_stopped_at) throw new ApiError(409, 'agent_stopped', 'Clear the emergency stop before activating this agent.');
    if (input.emergencyStop === false && current.emergency_stopped_at) throw new ApiError(409, 'safety_state_changed', 'The emergency stop changed concurrently. Refresh and try again.');
  }
  return { agentId, status: current.status, emergencyStoppedAt: current.emergency_stopped_at, replayed: !(results[0]?.meta.changes ?? 0) };
}

type ApprovalRow = { run_id: string; status: string; expires_at: string };

export async function decideApproval(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, input: { approvalId: unknown; decision: unknown }) {
  requirePermission(workspace.workspace.role, 'agents:approve');
  const approvalId = bounded(input.approvalId, 'approvalId', 128);
  if (input.decision !== 'approved' && input.decision !== 'rejected') throw new ApiError(400, 'validation_error', 'decision must be approved or rejected.');
  const decision = input.decision;
  const mutationEpoch = await captureWorkspaceMutationEpoch(db, workspace.workspaceId);
  const approval = await db.prepare('SELECT run_id,status,expires_at FROM approval_requests WHERE workspace_id=? AND id=?').bind(workspace.workspaceId, approvalId).first<ApprovalRow>();
  if (!approval) throw new ApiError(409, 'approval_unavailable', 'Approval is not pending in this workspace.');
  if (approval.status !== 'pending') {
    if (approval.status === decision) return { approvalId, runId: approval.run_id, status: decision, replayed: true };
    throw new ApiError(409, 'approval_unavailable', 'Approval has already been finalized.');
  }

  const expired = Date.parse(approval.expires_at) <= Date.now();
  const finalStatus = expired ? 'expired' : decision;
  const runStatus = finalStatus === 'approved' ? 'authorized' : finalStatus;
  const now = new Date().toISOString();
  const actorId = await humanActorId(identity);
  const decisionId = crypto.randomUUID();
  const results = await db.batch([
    humanActorStatement(db, identity, workspace.workspaceId, actorId, now),
    db.prepare("UPDATE approval_requests SET status=?,decided_by_actor_id=?,decided_at=?,decision_id=? WHERE workspace_id=? AND id=? AND status='pending' AND EXISTS (SELECT 1 FROM agent_runs WHERE workspace_id=approval_requests.workspace_id AND id=approval_requests.run_id AND status='awaiting_approval')").bind(finalStatus, expired ? null : actorId, now, decisionId, workspace.workspaceId, approvalId),
    db.prepare("UPDATE agent_runs SET status=?,finished_at=CASE WHEN ?='authorized' THEN NULL ELSE ? END WHERE workspace_id=? AND id=? AND status='awaiting_approval' AND EXISTS (SELECT 1 FROM approval_requests WHERE workspace_id=? AND id=? AND decision_id=?)").bind(runStatus, runStatus, now, workspace.workspaceId, approval.run_id, workspace.workspaceId, approvalId, decisionId),
    db.prepare("INSERT INTO agent_traces (id,workspace_id,run_id,sequence,event_type,detail_json,created_at) SELECT ?,workspace_id,run_id,COALESCE((SELECT MAX(sequence)+1 FROM agent_traces WHERE workspace_id=approval_requests.workspace_id AND run_id=approval_requests.run_id),1),'approval_decision',?,? FROM approval_requests WHERE workspace_id=? AND id=? AND decision_id=?").bind(crypto.randomUUID(), json({ status: finalStatus }), now, workspace.workspaceId, approvalId, decisionId),
    db.prepare("INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at) SELECT ?,workspace_id,?,?,'approval',id,?,?,? FROM approval_requests WHERE workspace_id=? AND id=? AND decision_id=?").bind(crypto.randomUUID(), identity.userId, `agent.approval.${finalStatus}`, json({ runId: approval.run_id }), identity.requestId, now, workspace.workspaceId, approvalId, decisionId),
    workspaceMutationFence(db, workspace.workspaceId, mutationEpoch, `agent.approval:${approvalId}:${decisionId}`, now),
  ]).catch((error) => { throw normalizeMutationFenceError(error); });
  if (!(results[1]?.meta.changes ?? 0)) {
    const current = await db.prepare('SELECT run_id,status FROM approval_requests WHERE workspace_id=? AND id=?').bind(workspace.workspaceId, approvalId).first<{ run_id: string; status: string }>();
    if (current?.status === decision) return { approvalId, runId: current.run_id, status: decision, replayed: true };
    throw new ApiError(409, 'approval_unavailable', 'Approval is no longer pending.');
  }
  if (expired) throw new ApiError(409, 'approval_expired', 'Approval has expired.');
  return { approvalId, runId: approval.run_id, status: decision, replayed: false };
}

type ReceiptRow = { id: string; outcome: string; cost_cents: number; metadata_json: string; created_at: string };

async function completedReceipt(db: D1Database, workspaceId: string, runId: string) {
  const receipt = await db.prepare('SELECT id,outcome,cost_cents,metadata_json,created_at FROM execution_receipts WHERE workspace_id=? AND run_id=?').bind(workspaceId, runId).first<ReceiptRow>();
  if (!receipt) return null;
  const metadata = parseJson<{ output?: Record<string, unknown> }>(receipt.metadata_json, {});
  return { runId, receiptId: receipt.id, status: receipt.outcome, costCents: receipt.cost_cents, output: metadata.output ?? { simulated: true, executedAt: receipt.created_at }, replayed: true };
}

export async function executeAuthorizedRun(db: D1Database, identity: RequestIdentity, workspace: WorkspaceContext, runIdInput: unknown) {
  requirePermission(workspace.workspace.role, 'agents:manage');
  const runId = bounded(runIdInput, 'runId', 128);
  const priorReceipt = await completedReceipt(db, workspace.workspaceId, runId);
  if (priorReceipt) return priorReceipt;

  type RunRow = { agent_id: string; tool_id: string | null; action_json: string; budget_reserved_cents: number; transport: string; external: number; tool_enabled: number; tool_scopes_json: string; grant_scopes_json: string; grant_expires_at: string | null; status: string; autonomy_level: AutonomyLevel; agent_status: string; emergency_stopped_at: string | null; monthly_budget_cents: number; spent_cents: number; approved: number };
  const run = await db.prepare(`SELECT r.agent_id,r.tool_id,r.action_json,r.budget_reserved_cents,r.status,t.transport,t.external,t.enabled AS tool_enabled,t.scopes_json AS tool_scopes_json,g.scopes_json AS grant_scopes_json,g.expires_at AS grant_expires_at,ai.autonomy_level,ai.status AS agent_status,ai.emergency_stopped_at,ai.monthly_budget_cents,ai.spent_cents,EXISTS(SELECT 1 FROM approval_requests ap WHERE ap.workspace_id=r.workspace_id AND ap.run_id=r.id AND ap.status='approved') AS approved FROM agent_runs r JOIN agent_identities ai ON ai.workspace_id=r.workspace_id AND ai.id=r.agent_id JOIN agent_tools t ON t.workspace_id=r.workspace_id AND t.id=r.tool_id JOIN agent_tool_grants g ON g.workspace_id=r.workspace_id AND g.agent_id=r.agent_id AND g.tool_id=r.tool_id WHERE r.workspace_id=? AND r.id=?`).bind(workspace.workspaceId, runId).first<RunRow>();
  if (!run || run.status !== 'authorized' || !run.tool_id) throw new ApiError(409, 'run_not_authorized', 'Run is not authorized for execution.');
  const mutationEpoch = await captureWorkspaceMutationEpoch(db, workspace.workspaceId);
  if (run.agent_status !== 'active' || run.emergency_stopped_at) throw new ApiError(409, 'agent_stopped', 'Agent is paused or emergency-stopped.');
  if (!run.tool_enabled) throw new ApiError(409, 'tool_disabled', 'The granted tool was disabled after authorization.');
  const grantExpiry = run.grant_expires_at === null ? null : Date.parse(run.grant_expires_at);
  if (grantExpiry !== null && (!Number.isFinite(grantExpiry) || grantExpiry <= Date.now())) throw new ApiError(409, 'grant_expired', 'The tool grant expired after authorization.');
  if (run.transport !== 'local-simulator' || run.external) throw new ApiError(409, 'external_execution_disabled', 'Only the non-external local simulator can execute in this release.');
  if (run.spent_cents + run.budget_reserved_cents > run.monthly_budget_cents) throw new ApiError(409, 'budget_exceeded', 'Agent budget is no longer sufficient.');
  const action = parseJson<{ summary?: string; scope?: string; destructive?: boolean }>(run.action_json, {});
  if (!action.summary || !action.scope) throw new ApiError(409, 'invalid_authorization', 'Stored run authorization is incomplete.');
  const toolScopes = parseJson<string[]>(run.tool_scopes_json, []);
  const grantScopes = parseJson<string[]>(run.grant_scopes_json, []);
  const allowedScopes = grantScopes.filter((scope) => toolScopes.includes(scope));
  const decision = evaluateAgentAction({ autonomy: run.autonomy_level, external: Boolean(run.external), destructive: Boolean(action.destructive), paused: false, emergencyStopped: false, requestedScope: action.scope, allowedScopes, budgetRemainingCents: run.monthly_budget_cents - run.spent_cents, estimatedCostCents: run.budget_reserved_cents, policyAllowsAutonomous: false });
  const approvedExecution = decision.decision === 'require-approval' && Boolean(run.approved);
  if (!decision.mayExecute && !approvedExecution) throw new ApiError(409, 'policy_changed', `Run is no longer executable: ${decision.reason}`);

  const countsResult = await db.prepare('SELECT object_type,COUNT(*) AS count FROM records WHERE workspace_id=? AND archived_at IS NULL GROUP BY object_type ORDER BY object_type').bind(workspace.workspaceId).all<{ object_type: string; count: number }>();
  const now = new Date().toISOString();
  const output = { simulated: true, summary: action.summary, recordCounts: Object.fromEntries(countsResult.results.map((row) => [row.object_type, row.count])), executedAt: now };
  const receiptId = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare("INSERT INTO execution_receipts (id,workspace_id,run_id,tool_id,outcome,input_hash,output_hash,cost_cents,metadata_json,created_at) VALUES (?,?,?,?, 'succeeded',?,?,?,?,?)").bind(receiptId, workspace.workspaceId, runId, run.tool_id, await digest(action), await digest(output), run.budget_reserved_cents, json({ simulator: true, output }), now),
      db.prepare('UPDATE agent_identities SET spent_cents=spent_cents+?,updated_at=? WHERE workspace_id=? AND id=?').bind(run.budget_reserved_cents, now, workspace.workspaceId, run.agent_id),
      db.prepare("UPDATE agent_runs SET status='succeeded',started_at=?,finished_at=? WHERE workspace_id=? AND id=? AND status='authorized'").bind(now, now, workspace.workspaceId, runId),
      db.prepare("INSERT INTO agent_traces (id,workspace_id,run_id,sequence,event_type,detail_json,created_at) SELECT ?,?,?,COALESCE(MAX(sequence),0)+1,'execution_completed',?,? FROM agent_traces WHERE workspace_id=? AND run_id=?").bind(crypto.randomUUID(), workspace.workspaceId, runId, json({ receiptId, simulator: true }), now, workspace.workspaceId, runId),
      audit(db, identity, workspace.workspaceId, 'agent.run.executed', 'agent_run', runId, { receiptId, simulator: true, costCents: run.budget_reserved_cents }, now),
      workspaceMutationFence(db, workspace.workspaceId, mutationEpoch, `agent.execute:${runId}`, now),
    ]);
  } catch (error) {
    const committed = await completedReceipt(db, workspace.workspaceId, runId);
    if (committed) return committed;
    if (String(error).includes('run is not executable') || String(error).includes('invalid agent identity state')) throw new ApiError(409, 'execution_blocked', 'Current agent policy, safety, tool, or budget state blocks this run.');
    throw normalizeMutationFenceError(error);
  }
  return { runId, receiptId, status: 'succeeded' as const, costCents: run.budget_reserved_cents, output, replayed: false };
}
