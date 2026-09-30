import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultAgentPolicy, type AgentPolicy } from '@/lib/agent-policy';
import { agentPolicySettings, dryRunAgentPolicy, evaluateActiveAgentPolicy, existingPolicyWorkspace, saveAgentPolicy } from '@/server/agent-policies';
import { decideApproval, executeAuthorizedRun, proposeAgentAction } from '@/server/agent-plane';
import { requireCapability } from '@/server/capabilities';
import { PolicyDatabase, policyFixture } from './agent-policy-fixture';

let db: PolicyDatabase;
type Fixture = Awaited<ReturnType<typeof policyFixture>>;
const policy = (f: Fixture, change: Partial<AgentPolicy> = {}) => ({ ...defaultAgentPolicy([f.toolId], 100), requireApproval: false, ...change });
const proposal = (f: Fixture, key = crypto.randomUUID()) => ({ agentId: f.agentId, toolId: f.toolId, requestedScope: 'records:read', summary: 'Count synthetic records', estimatedCostCents: 5, destructive: false, idempotencyKey: key });
const save = (f: Fixture, document = policy(f), expectedVersion = 0, key = crypto.randomUUID()) => saveAgentPolicy(db.asD1(), f.identity, f.workspace, { agentId: f.agentId, policy: document, expectedVersion }, key);
function count(table: string) { return Number(db.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count); }
function insertRevision(f: Fixture, document: AgentPolicy, version: number) {
  db.sqlite.prepare('INSERT INTO agent_policy_versions (workspace_id,agent_id,version,document_json,operation_id,request_hash,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(f.workspace.workspaceId, f.agentId, version, JSON.stringify(document), `race-${version}`, 'a'.repeat(64), f.identity.userId, new Date().toISOString());
}

describe('versioned policy service and durable enforcement', () => {
  beforeEach(() => { db = new PolicyDatabase(); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Policy evaluation attempted network access'); })); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); db.sqlite.close(); });

  it('dry-runs through a read-only database without seeds, writes, receipts, audit events or network calls', async () => {
    const f = await policyFixture(db);
    const before = db.sqlite.prepare('SELECT total_changes() AS count').get()!.count;
    db.readOnly = true;
    const workspace = await existingPolicyWorkspace(db.asD1(), f.identity);
    const result = await dryRunAgentPolicy(db.asD1(), workspace, { agentId: f.agentId, policy: policy(f, { requireApproval: true }), proposal: { toolId: f.toolId, requestedScope: 'records:read', estimatedCostCents: 5, destructive: false } });
    expect(result).toMatchObject({ dryRun: true, writes: false, externalExecution: false, basedOnVersion: 0, decision: { decision: 'require-approval', matchedRule: 'policy.approval', mayExecute: false } });
    expect(db.sqlite.prepare('SELECT total_changes() AS count').get()!.count).toBe(before);
    expect(count('agent_runs')).toBe(0); expect(count('execution_receipts')).toBe(0); expect(count('agent_policy_versions')).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    await expect(existingPolicyWorkspace(db.asD1(), { ...f.identity, userId: 'missing-member' })).rejects.toMatchObject({ code: 'workspace_not_found' });
    expect(db.sqlite.prepare('SELECT total_changes() AS count').get()!.count).toBe(before);
  });

  it('rejects unauthorized roles before reading agent or record data', async () => {
    const f = await policyFixture(db);
    const restricted = { ...f.workspace, workspace: { ...f.workspace.workspace, role: 'auditor' as const } };
    const before = db.queries.length;
    await expect(agentPolicySettings(db.asD1(), restricted, f.agentId)).rejects.toMatchObject({ status: 403 });
    await expect(saveAgentPolicy(db.asD1(), f.identity, restricted, { agentId: f.agentId, policy: policy(f), expectedVersion: 0 }, 'forbidden')).rejects.toMatchObject({ status: 403 });
    await expect(dryRunAgentPolicy(db.asD1(), restricted, { agentId: f.agentId, policy: policy(f), proposal: proposal(f) })).rejects.toMatchObject({ status: 403 });
    expect(db.queries.length).toBe(before);
  });

  it('isolates agents, granted tools, record IDs and owner budget ceilings by tenant', async () => {
    const f = await policyFixture(db); const other = await policyFixture(db);
    await expect(agentPolicySettings(db.asD1(), f.workspace, other.agentId)).rejects.toMatchObject({ code: 'agent_not_found' });
    await expect(save(f, policy(f, { allowedToolIds: [other.toolId] }))).rejects.toMatchObject({ code: 'policy_exceeds_grant' });
    await expect(save(f, policy(f, { budgetCents: 101 }))).rejects.toMatchObject({ code: 'policy_exceeds_grant' });
    await expect(save(f, policy(f, { recordScope: { objectTypes: ['contact'], recordIds: [other.records[0]], maxRecords: 1 } }))).rejects.toMatchObject({ code: 'policy_record_scope_invalid' });
    await expect(save(f, policy(f, { recordScope: { objectTypes: ['company'], recordIds: [f.records[0]], maxRecords: 1 } }))).rejects.toMatchObject({ code: 'policy_record_scope_invalid' });
    expect(count('agent_policy_versions')).toBe(0);
  });

  it('activates immutable optimistic versions and replays the same durable save exactly once', async () => {
    const f = await policyFixture(db);
    const first = await save(f, policy(f), 0, 'save-once');
    expect(first).toMatchObject({ replayed: false, active: { version: 1 } });
    expect(await save(f, policy(f), 0, 'save-once')).toMatchObject({ replayed: true, active: { version: 1 } });
    await expect(save(f, policy(f, { stopped: true }), 0, 'save-once')).rejects.toMatchObject({ code: 'idempotency_conflict' });
    await expect(save(f, policy(f), 0)).rejects.toMatchObject({ code: 'policy_version_conflict' });
    expect(count('agent_policy_versions')).toBe(1);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action='agent.policy.activated'").get()!.count).toBe(1);
    expect(() => db.sqlite.exec("UPDATE agent_policy_versions SET created_by='other'")).toThrow(/append-only/);
    expect(() => db.sqlite.exec('DELETE FROM agent_policy_versions')).toThrow(/append-only/);
    expect((await agentPolicySettings(db.asD1(), f.workspace, f.agentId)).history).toHaveLength(1);
    await save(f, policy(f, { stopped: true }), 1);
    expect(await save(f, policy(f), 0, 'save-once')).toMatchObject({ replayed: true, active: { version: 1 } });
  });

  it('requires a human approval and applies record IDs, types and the read cap before aggregation', async () => {
    const f = await policyFixture(db);
    await save(f, policy(f, { requireApproval: true, recordScope: { objectTypes: ['contact'], recordIds: [f.records[0]], maxRecords: 1 } }));
    const run = await proposeAgentAction(db.asD1(), f.identity, f.workspace, proposal(f));
    expect(run.status).toBe('awaiting_approval'); expect(run.approvalId).toBeTruthy();
    await expect(executeAuthorizedRun(db.asD1(), f.identity, f.workspace, run.runId)).rejects.toMatchObject({ code: 'run_not_authorized' });
    await decideApproval(db.asD1(), f.identity, f.workspace, { approvalId: run.approvalId!, decision: 'approved' });
    const receipt = await executeAuthorizedRun(db.asD1(), f.identity, f.workspace, run.runId);
    expect(receipt.output).toMatchObject({ simulated: true, recordCounts: { contact: 1 }, readLimit: 1, policyVersion: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('caps aggregate reads even without an explicit list of IDs and refuses a broader proposal', async () => {
    const f = await policyFixture(db);
    await save(f, policy(f, { recordScope: { objectTypes: ['contact'], recordIds: null, maxRecords: 1 } }));
    const denied = await proposeAgentAction(db.asD1(), f.identity, f.workspace, { ...proposal(f), records: { objectTypes: ['company'], recordIds: null, maxRecords: 1 } });
    expect(denied).toMatchObject({ status: 'constrained', decision: { decision: 'deny', matchedRule: 'policy.record-types' } });
    const run = await proposeAgentAction(db.asD1(), f.identity, f.workspace, proposal(f));
    expect((await executeAuthorizedRun(db.asD1(), f.identity, f.workspace, run.runId)).output).toMatchObject({ recordCounts: { contact: 1 } });
  });

  it('activation cancels old pending/authorized work but preserves completed receipts and their replay', async () => {
    const f = await policyFixture(db);
    const finished = await proposeAgentAction(db.asD1(), f.identity, f.workspace, proposal(f));
    const receipt = await executeAuthorizedRun(db.asD1(), f.identity, f.workspace, finished.runId);
    const authorized = await proposeAgentAction(db.asD1(), f.identity, f.workspace, proposal(f));
    const awaiting = await proposeAgentAction(db.asD1(), f.identity, f.workspace, { ...proposal(f), destructive: true });
    await save(f);
    for (const run of [authorized, awaiting]) {
      expect(db.sqlite.prepare('SELECT status FROM agent_runs WHERE id=?').get(run.runId)!.status).toBe('cancelled');
      expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM agent_traces WHERE run_id=? AND event_type='policy_changed'").get(run.runId)!.count).toBe(1);
      await expect(executeAuthorizedRun(db.asD1(), f.identity, f.workspace, run.runId)).rejects.toMatchObject({ code: 'run_not_authorized' });
    }
    expect(db.sqlite.prepare('SELECT status FROM approval_requests WHERE id=?').get(awaiting.approvalId!)!.status).toBe('cancelled');
    expect(await executeAuthorizedRun(db.asD1(), f.identity, f.workspace, finished.runId)).toMatchObject({ receiptId: receipt.receiptId, replayed: true });
  });

  it('enforces active policies even after authoring capability is disabled', async () => {
    const f = await policyFixture(db);
    await save(f, policy(f, { stopped: true }));
    db.sqlite.prepare("INSERT INTO capability_overrides (workspace_id,capability_key,enabled,updated_at) VALUES (?,'advancedPolicies',0,?)").run(f.workspace.workspaceId, new Date().toISOString());
    await expect(requireCapability(db.asD1(), f.workspace, 'advancedPolicies')).rejects.toMatchObject({ status: 403 });
    const run = await proposeAgentAction(db.asD1(), f.identity, f.workspace, proposal(f));
    expect(run).toMatchObject({ status: 'constrained', decision: { decision: 'deny', matchedRule: 'policy.stop' } });
  });

  it('applies current spent budget and expiry without changing the owner grant', async () => {
    const f = await policyFixture(db);
    const expiry = Date.now() + 86_400_000;
    await save(f, policy(f, { budgetCents: 5, maxActionCostCents: 5, expiresAt: new Date(expiry).toISOString() }));
    const run = await proposeAgentAction(db.asD1(), f.identity, f.workspace, proposal(f));
    await executeAuthorizedRun(db.asD1(), f.identity, f.workspace, run.runId);
    const denied = await proposeAgentAction(db.asD1(), f.identity, f.workspace, proposal(f));
    expect(denied.decision).toMatchObject({ decision: 'deny', matchedRule: 'policy.budget' });
    vi.spyOn(Date, 'now').mockReturnValue(expiry + 1);
    expect(await evaluateActiveAgentPolicy(db.asD1(), f.workspace.workspaceId, f.agentId, { ...proposal(f), estimatedCostCents: 0 })).toMatchObject({ decision: 'deny', matchedRule: 'policy.expiry' });
    expect(db.sqlite.prepare('SELECT monthly_budget_cents FROM agent_identities WHERE id=?').get(f.agentId)!.monthly_budget_cents).toBe(100);
  });

  it('rejects a grant revoked between policy validation and the durable save', async () => {
    const f = await policyFixture(db);
    db.beforeNextBatch = () => { db.sqlite.prepare('DELETE FROM agent_tool_grants WHERE workspace_id=? AND agent_id=?').run(f.workspace.workspaceId, f.agentId); };
    await expect(save(f)).rejects.toMatchObject({ code: 'policy_state_changed' });
    expect(count('agent_policy_versions')).toBe(0);
  });

  it('allows recovery after removing a revoked grant from the next policy draft', async () => {
    const f = await policyFixture(db); await save(f);
    db.sqlite.prepare('DELETE FROM agent_tool_grants WHERE workspace_id=? AND agent_id=?').run(f.workspace.workspaceId, f.agentId);
    const settings = await agentPolicySettings(db.asD1(), f.workspace, f.agentId);
    expect(settings.tools).toHaveLength(0); expect(settings.draft.allowedToolIds).toEqual([f.toolId]);
    await expect(save(f, settings.draft, 1)).rejects.toMatchObject({ code: 'policy_exceeds_grant' });
    expect(await save(f, { ...settings.draft, allowedToolIds: [] }, 1)).toMatchObject({ active: { version: 2, policy: { allowedToolIds: [] } } });
  });

  it('rejects a record deleted between validation and activation', async () => {
    const f = await policyFixture(db);
    db.beforeNextBatch = () => { db.sqlite.prepare('DELETE FROM records WHERE workspace_id=? AND id=?').run(f.workspace.workspaceId, f.records[0]); };
    await expect(save(f, policy(f, { recordScope: { objectTypes: ['contact'], recordIds: [f.records[0]], maxRecords: 1 } }))).rejects.toMatchObject({ code: 'policy_state_changed' });
    expect(count('agent_policy_versions')).toBe(0);
  });

  it('rejects a concurrent receipt that would exceed the policy budget even below the owner ceiling', async () => {
    const f = await policyFixture(db); await save(f, policy(f, { budgetCents: 5, maxActionCostCents: 5 }));
    const run = await proposeAgentAction(db.asD1(), f.identity, f.workspace, proposal(f));
    db.beforeNextBatch = () => { db.sqlite.prepare('UPDATE agent_identities SET spent_cents=1 WHERE workspace_id=? AND id=?').run(f.workspace.workspaceId, f.agentId); };
    await expect(executeAuthorizedRun(db.asD1(), f.identity, f.workspace, run.runId)).rejects.toMatchObject({ code: 'execution_blocked' });
    expect(count('execution_receipts')).toBe(0);
    expect(db.sqlite.prepare('SELECT spent_cents FROM agent_identities WHERE id=?').get(f.agentId)!.spent_cents).toBe(1);
  });

  it('closes concurrent activation races at proposal and receipt insertion', async () => {
    const f = await policyFixture(db);
    db.beforeNextBatch = () => insertRevision(f, policy(f), 1);
    await expect(proposeAgentAction(db.asD1(), f.identity, f.workspace, proposal(f))).rejects.toMatchObject({ code: 'policy_changed' });
    expect(count('agent_runs')).toBe(0);
    const run = await proposeAgentAction(db.asD1(), f.identity, f.workspace, proposal(f));
    db.beforeNextBatch = () => insertRevision(f, policy(f, { stopped: true }), 2);
    await expect(executeAuthorizedRun(db.asD1(), f.identity, f.workspace, run.runId)).rejects.toMatchObject({ code: 'execution_blocked' });
    expect(count('execution_receipts')).toBe(0);
    expect(db.sqlite.prepare('SELECT spent_cents FROM agent_identities WHERE id=?').get(f.agentId)!.spent_cents).toBe(0);
  });

  it('SQL guards block direct approval bypass and a forged permissive policy version', async () => {
    const f = await policyFixture(db);
    await save(f, policy(f, { requireApproval: true }));
    const run = await proposeAgentAction(db.asD1(), f.identity, f.workspace, proposal(f));
    expect(() => db.sqlite.prepare("UPDATE agent_runs SET status='authorized' WHERE id=?").run(run.runId)).toThrow(/agent policy/);
    const action = { summary: 'Forged version', scope: 'records:read', destructive: false, transport: 'local-simulator', records: policy(f).recordScope, policyVersion: null };
    expect(() => db.sqlite.prepare("INSERT INTO agent_runs (id,workspace_id,agent_id,tool_id,action_json,status,budget_reserved_cents,idempotency_key,request_hash,created_at) VALUES (?,?,?,?,?,'authorized',0,?,?,?)")
      .run('forged-run', f.workspace.workspaceId, f.agentId, f.toolId, JSON.stringify(action), 'forged-key', 'b'.repeat(64), new Date().toISOString())).toThrow(/agent policy/);
  });
});
