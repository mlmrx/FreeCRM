import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createAgent,
  decideApproval,
  executeAuthorizedRun,
  proposeAgentAction,
  setAgentSafety,
} from '@/server/agent-plane';
import type { WorkspaceContext } from '@/server/control-plane';
import type { RequestIdentity } from '@/server/request-context';

class SqliteD1Statement {
  constructor(
    public readonly database: DatabaseSync,
    public readonly sql: string,
    public readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new SqliteD1Statement(this.database, this.sql, params);
  }

  async first<T>() {
    return (this.database.prepare(this.sql).get(...this.params as SQLInputValue[]) as T | undefined) ?? null;
  }

  async all<T>() {
    return { success: true, results: this.database.prepare(this.sql).all(...this.params as SQLInputValue[]) as T[] };
  }

  async run<T>() {
    const result = this.database.prepare(this.sql).run(...this.params as SQLInputValue[]);
    return {
      success: true,
      results: [] as T[],
      meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
    };
  }
}

class SqliteD1Database {
  readonly sqlite = new DatabaseSync(':memory:');
  beforeNextBatch: (() => void) | null = null;

  constructor() {
    this.sqlite.exec('PRAGMA foreign_keys=ON');
    const migrationDirectory = new URL('../drizzle/', import.meta.url);
    for (const name of readdirSync(migrationDirectory).filter((entry) => /^\d{4}_.+\.sql$/.test(entry)).sort()) {
      const migration = readFileSync(new URL(name, migrationDirectory), 'utf8');
      for (const statement of migration.split('--> statement-breakpoint')) {
        if (statement.trim()) this.sqlite.exec(statement);
      }
    }
  }

  prepare(sql: string) {
    return new SqliteD1Statement(this.sqlite, sql);
  }

  async batch<T>(statements: D1PreparedStatement[]) {
    const beforeBatch = this.beforeNextBatch;
    this.beforeNextBatch = null;
    beforeBatch?.();
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements as unknown as SqliteD1Statement[]) results.push(await statement.run<T>());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.sqlite.close();
  }
}

const databases: SqliteD1Database[] = [];
let sequence = 0;

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

type FixtureOptions = {
  autonomy?: 'approval-required' | 'policy-autonomous';
  monthlyBudgetCents?: number;
};

async function createFixture(options: FixtureOptions = {}) {
  sequence += 1;
  const db = new SqliteD1Database();
  databases.push(db);
  const workspaceId = `safety-workspace-${sequence}`;
  const now = new Date().toISOString();
  const identity: RequestIdentity = {
    userId: `synthetic-owner-${sequence}`,
    email: `owner-${sequence}@example.test`,
    displayName: 'Synthetic safety owner',
    requestId: `safety-request-${sequence}`,
    runtimeMode: 'device',
  };
  db.sqlite.prepare(`
    INSERT INTO workspaces (
      id,owner_user_id,owner_email,owner_name,name,profile,timezone,currency,locale,
      settings_json,created_at,updated_at
    ) VALUES (?,?,?,?,?,'business','UTC','USD','en-US','{}',?,?)
  `).run(workspaceId, identity.userId, identity.email, identity.displayName, 'Synthetic safety workspace', now, now);
  const workspace: WorkspaceContext = {
    workspaceId,
    workspace: {
      id: workspaceId,
      name: 'Synthetic safety workspace',
      ownerEmail: identity.email,
      ownerName: identity.displayName,
      role: 'owner',
      profile: 'business',
      timezone: 'UTC',
      currency: 'USD',
      locale: 'en-US',
      settings: {},
      createdAt: now,
      updatedAt: now,
    },
  };
  const created = await createAgent(
    db as unknown as D1Database,
    identity,
    workspace,
    {
      name: 'Synthetic safety agent',
      autonomy: options.autonomy ?? 'policy-autonomous',
      monthlyBudgetCents: options.monthlyBudgetCents ?? 100,
    },
    `safety-create-${sequence}`,
  );
  await setAgentSafety(db as unknown as D1Database, identity, workspace, { agentId: created.agentId, status: 'active' });
  return { db, identity, workspace, agentId: created.agentId, toolId: created.toolId };
}

function proposal(fixture: Awaited<ReturnType<typeof createFixture>>, overrides: Partial<Parameters<typeof proposeAgentAction>[3]> = {}) {
  return {
    agentId: fixture.agentId,
    toolId: fixture.toolId,
    summary: 'Read synthetic relationship counts',
    requestedScope: 'records:read',
    estimatedCostCents: 5,
    destructive: false,
    idempotencyKey: `safety-proposal-${sequence}`,
    ...overrides,
  };
}

function count(db: SqliteD1Database, sql: string, ...params: SQLInputValue[]) {
  return Number((db.sqlite.prepare(sql).get(...params) as { count: number }).count);
}

describe('required deterministic agent safety contract', () => {
  it('[SAF-APPROVAL-001] requires durable human approval before execution', async () => {
    const fixture = await createFixture({ autonomy: 'approval-required' });
    const proposed = await proposeAgentAction(
      fixture.db as unknown as D1Database,
      fixture.identity,
      fixture.workspace,
      proposal(fixture),
    );

    expect(proposed).toMatchObject({ status: 'awaiting_approval', replayed: false, decision: { decision: 'require-approval', mayExecute: false } });
    expect(proposed.approvalId).toEqual(expect.any(String));
    await expect(executeAuthorizedRun(fixture.db as unknown as D1Database, fixture.identity, fixture.workspace, proposed.runId))
      .rejects.toMatchObject({ code: 'run_not_authorized' });

    const approved = await decideApproval(fixture.db as unknown as D1Database, fixture.identity, fixture.workspace, {
      approvalId: proposed.approvalId,
      decision: 'approved',
    });
    expect(approved).toMatchObject({ runId: proposed.runId, status: 'approved', replayed: false });
    await expect(executeAuthorizedRun(fixture.db as unknown as D1Database, fixture.identity, fixture.workspace, proposed.runId))
      .resolves.toMatchObject({ status: 'succeeded', replayed: false });
  });

  it('[SAF-BUDGET-001] blocks proposals and authorized runs after budget exhaustion', async () => {
    const fixture = await createFixture({ monthlyBudgetCents: 5 });
    const authorized = await proposeAgentAction(
      fixture.db as unknown as D1Database,
      fixture.identity,
      fixture.workspace,
      proposal(fixture, { idempotencyKey: 'budget-authorized' }),
    );
    expect(authorized.status).toBe('authorized');

    fixture.db.sqlite.prepare('UPDATE agent_identities SET spent_cents=1 WHERE workspace_id=? AND id=?')
      .run(fixture.workspace.workspaceId, fixture.agentId);
    await expect(executeAuthorizedRun(fixture.db as unknown as D1Database, fixture.identity, fixture.workspace, authorized.runId))
      .rejects.toMatchObject({ code: 'budget_exceeded' });

    fixture.db.sqlite.prepare('UPDATE agent_identities SET spent_cents=5 WHERE workspace_id=? AND id=?')
      .run(fixture.workspace.workspaceId, fixture.agentId);
    const exhausted = await proposeAgentAction(
      fixture.db as unknown as D1Database,
      fixture.identity,
      fixture.workspace,
      proposal(fixture, { estimatedCostCents: 1, idempotencyKey: 'budget-exhausted' }),
    );
    expect(exhausted).toMatchObject({ status: 'constrained', decision: { decision: 'deny', mayExecute: false } });
    expect(exhausted.decision.reason).toContain('budget');
  });

  it('[SAF-REPLAY-001] replays proposals and executions without duplicate effects', async () => {
    const fixture = await createFixture({ monthlyBudgetCents: 20 });
    const action = proposal(fixture, { estimatedCostCents: 3, idempotencyKey: 'stable-replay-key' });
    const firstProposal = await proposeAgentAction(fixture.db as unknown as D1Database, fixture.identity, fixture.workspace, action);
    const replayedProposal = await proposeAgentAction(fixture.db as unknown as D1Database, fixture.identity, fixture.workspace, action);
    expect(replayedProposal).toEqual({ ...firstProposal, replayed: true });

    const firstExecution = await executeAuthorizedRun(fixture.db as unknown as D1Database, fixture.identity, fixture.workspace, firstProposal.runId);
    const replayedExecution = await executeAuthorizedRun(fixture.db as unknown as D1Database, fixture.identity, fixture.workspace, firstProposal.runId);
    expect(replayedExecution).toEqual({ ...firstExecution, replayed: true });
    expect(count(fixture.db, 'SELECT COUNT(*) AS count FROM execution_receipts WHERE workspace_id=? AND run_id=?', fixture.workspace.workspaceId, firstProposal.runId)).toBe(1);
    expect(fixture.db.sqlite.prepare('SELECT spent_cents FROM agent_identities WHERE workspace_id=? AND id=?').get(fixture.workspace.workspaceId, fixture.agentId))
      .toMatchObject({ spent_cents: 3 });
  });

  it('[SAF-IDEMPOTENCY-001] rejects an idempotency key reused for different input', async () => {
    const fixture = await createFixture();
    const action = proposal(fixture, { idempotencyKey: 'conflict-key' });
    await proposeAgentAction(fixture.db as unknown as D1Database, fixture.identity, fixture.workspace, action);
    await expect(proposeAgentAction(
      fixture.db as unknown as D1Database,
      fixture.identity,
      fixture.workspace,
      { ...action, summary: 'Different synthetic action' },
    )).rejects.toMatchObject({ status: 409, code: 'idempotency_conflict' });
    expect(count(fixture.db, 'SELECT COUNT(*) AS count FROM agent_runs WHERE workspace_id=? AND idempotency_key=?', fixture.workspace.workspaceId, 'conflict-key')).toBe(1);
  });

  it('[SAF-STOP-001] cancels executable work and constrains work after emergency stop', async () => {
    const fixture = await createFixture();
    const authorized = await proposeAgentAction(
      fixture.db as unknown as D1Database,
      fixture.identity,
      fixture.workspace,
      proposal(fixture, { idempotencyKey: 'before-stop' }),
    );
    const stopped = await setAgentSafety(fixture.db as unknown as D1Database, fixture.identity, fixture.workspace, {
      agentId: fixture.agentId,
      emergencyStop: true,
    });
    expect(stopped).toMatchObject({ status: 'paused' });
    expect(stopped.emergencyStoppedAt).toEqual(expect.any(String));
    expect(fixture.db.sqlite.prepare('SELECT status FROM agent_runs WHERE workspace_id=? AND id=?').get(fixture.workspace.workspaceId, authorized.runId))
      .toMatchObject({ status: 'cancelled' });
    await expect(executeAuthorizedRun(fixture.db as unknown as D1Database, fixture.identity, fixture.workspace, authorized.runId))
      .rejects.toMatchObject({ code: 'run_not_authorized' });

    const constrained = await proposeAgentAction(
      fixture.db as unknown as D1Database,
      fixture.identity,
      fixture.workspace,
      proposal(fixture, { idempotencyKey: 'after-stop' }),
    );
    expect(constrained).toMatchObject({ status: 'constrained', decision: { decision: 'deny', mayExecute: false } });
    expect(constrained.decision.reason).toContain('emergency stop');
    expect(count(fixture.db, 'SELECT COUNT(*) AS count FROM execution_receipts WHERE workspace_id=?', fixture.workspace.workspaceId)).toBe(0);
  });

  it('[SAF-GRANT-EXPIRY-001] denies expired grants at proposal and execution boundaries', async () => {
    const fixture = await createFixture();
    const authorized = await proposeAgentAction(
      fixture.db as unknown as D1Database,
      fixture.identity,
      fixture.workspace,
      proposal(fixture, { idempotencyKey: 'before-grant-expiry' }),
    );
    expect(() => fixture.db.sqlite.prepare('UPDATE agent_tool_grants SET expires_at=? WHERE workspace_id=? AND agent_id=? AND tool_id=?')
      .run('not-a-timestamp', fixture.workspace.workspaceId, fixture.agentId, fixture.toolId))
      .toThrow(/invalid agent tool grant expiry/);
    expect(() => fixture.db.sqlite.prepare('UPDATE agent_tool_grants SET expires_at=? WHERE workspace_id=? AND agent_id=? AND tool_id=?')
      .run('2030-01-01 00:00:00', fixture.workspace.workspaceId, fixture.agentId, fixture.toolId))
      .toThrow(/invalid agent tool grant expiry/);
    expect(() => fixture.db.sqlite.prepare('UPDATE agent_tool_grants SET expires_at=? WHERE workspace_id=? AND agent_id=? AND tool_id=?')
      .run('2030-01-01T00:00:00.000+00:00', fixture.workspace.workspaceId, fixture.agentId, fixture.toolId))
      .toThrow(/invalid agent tool grant expiry/);
    expect(() => fixture.db.sqlite.prepare('UPDATE agent_tool_grants SET expires_at=? WHERE workspace_id=? AND agent_id=? AND tool_id=?')
      .run('2030-01-01T24:00:00.000Z', fixture.workspace.workspaceId, fixture.agentId, fixture.toolId))
      .toThrow(/invalid agent tool grant expiry/);
    fixture.db.sqlite.prepare('UPDATE agent_tool_grants SET expires_at=? WHERE workspace_id=? AND agent_id=? AND tool_id=?')
      .run('2000-01-01T00:00:00.000Z', fixture.workspace.workspaceId, fixture.agentId, fixture.toolId);

    await expect(executeAuthorizedRun(fixture.db as unknown as D1Database, fixture.identity, fixture.workspace, authorized.runId))
      .rejects.toMatchObject({ status: 409, code: 'grant_expired' });
    await expect(proposeAgentAction(
      fixture.db as unknown as D1Database,
      fixture.identity,
      fixture.workspace,
      proposal(fixture, { idempotencyKey: 'after-grant-expiry' }),
    )).rejects.toMatchObject({ status: 403, code: 'grant_expired' });
    expect(() => fixture.db.sqlite.prepare(`
      INSERT INTO agent_runs (
        id,workspace_id,agent_id,tool_id,action_json,status,budget_reserved_cents,
        idempotency_key,request_hash
      ) VALUES (?,?,?,?,?,'authorized',1,?,?)
    `).run(
      'direct-expired-run',
      fixture.workspace.workspaceId,
      fixture.agentId,
      fixture.toolId,
      JSON.stringify({ summary: 'Direct expired run', scope: 'records:read', destructive: false }),
      'direct-expired-run',
      'a'.repeat(64),
    )).toThrow(/invalid agent run/);
    expect(count(fixture.db, 'SELECT COUNT(*) AS count FROM execution_receipts WHERE workspace_id=?', fixture.workspace.workspaceId)).toBe(0);

    const approvalFixture = await createFixture({ autonomy: 'approval-required' });
    const awaiting = await proposeAgentAction(
      approvalFixture.db as unknown as D1Database,
      approvalFixture.identity,
      approvalFixture.workspace,
      proposal(approvalFixture, { idempotencyKey: 'grant-expires-before-approval' }),
    );
    approvalFixture.db.sqlite.prepare('UPDATE agent_tool_grants SET expires_at=? WHERE workspace_id=? AND agent_id=? AND tool_id=?')
      .run('2000-01-01T00:00:00.000Z', approvalFixture.workspace.workspaceId, approvalFixture.agentId, approvalFixture.toolId);
    await expect(decideApproval(
      approvalFixture.db as unknown as D1Database,
      approvalFixture.identity,
      approvalFixture.workspace,
      { approvalId: awaiting.approvalId, decision: 'approved' },
    )).rejects.toMatchObject({ status: 409, code: 'grant_expired' });
    expect(approvalFixture.db.sqlite.prepare('SELECT status FROM approval_requests WHERE workspace_id=? AND id=?').get(approvalFixture.workspace.workspaceId, awaiting.approvalId))
      .toMatchObject({ status: 'cancelled' });
    expect(approvalFixture.db.sqlite.prepare('SELECT status FROM agent_runs WHERE workspace_id=? AND id=?').get(approvalFixture.workspace.workspaceId, awaiting.runId))
      .toMatchObject({ status: 'cancelled' });
    expect(approvalFixture.db.sqlite.prepare("SELECT COUNT(*) AS count FROM agent_traces WHERE workspace_id=? AND run_id=? AND event_type='authorization_invalidated'").get(approvalFixture.workspace.workspaceId, awaiting.runId))
      .toMatchObject({ count: 1 });
    expect(approvalFixture.db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=? AND entity_id=? AND action='agent.approval.cancelled'").get(approvalFixture.workspace.workspaceId, awaiting.approvalId))
      .toMatchObject({ count: 1 });

    const raceFixture = await createFixture({ autonomy: 'approval-required' });
    const raceAwaiting = await proposeAgentAction(
      raceFixture.db as unknown as D1Database,
      raceFixture.identity,
      raceFixture.workspace,
      proposal(raceFixture, { idempotencyKey: 'grant-race-before-authorization' }),
    );
    const decidedAt = new Date().toISOString();
    raceFixture.db.sqlite.prepare("UPDATE approval_requests SET status='approved',decided_by_actor_id=requested_by_actor_id,decided_at=?,decision_id='synthetic-race-decision' WHERE workspace_id=? AND id=?")
      .run(decidedAt, raceFixture.workspace.workspaceId, raceAwaiting.approvalId);
    raceFixture.db.sqlite.prepare('UPDATE agent_tool_grants SET expires_at=? WHERE workspace_id=? AND agent_id=? AND tool_id=?')
      .run('2000-01-01T00:00:00.000Z', raceFixture.workspace.workspaceId, raceFixture.agentId, raceFixture.toolId);
    expect(() => raceFixture.db.sqlite.prepare("UPDATE agent_runs SET status='authorized' WHERE workspace_id=? AND id=?")
      .run(raceFixture.workspace.workspaceId, raceAwaiting.runId))
      .toThrow(/agent authorization is no longer valid/);

    raceFixture.db.sqlite.prepare('UPDATE agent_tool_grants SET expires_at=? WHERE workspace_id=? AND agent_id=? AND tool_id=?')
      .run('2099-01-01T00:00:00.000Z', raceFixture.workspace.workspaceId, raceFixture.agentId, raceFixture.toolId);
    raceFixture.db.sqlite.prepare("INSERT INTO agent_runs (id,workspace_id,agent_id,tool_id,action_json,status,budget_reserved_cents,idempotency_key,request_hash,created_at) VALUES ('expired-approval-run',?,?,?,'{\"summary\":\"Expired approval race\",\"scope\":\"records:read\"}','awaiting_approval',0,'expired-approval-race',?,'1999-01-01T00:00:00.000Z')")
      .run(raceFixture.workspace.workspaceId, raceFixture.agentId, raceFixture.toolId, 'b'.repeat(64));
    raceFixture.db.sqlite.prepare("INSERT INTO approval_requests (id,workspace_id,run_id,requested_by_actor_id,status,action_summary,expires_at,created_at) SELECT 'expired-approval',workspace_id,'expired-approval-run',requested_by_actor_id,'pending','Expired approval race','2000-01-01T00:00:00.000Z','1999-01-01T00:00:00.000Z' FROM approval_requests WHERE workspace_id=? AND id=?")
      .run(raceFixture.workspace.workspaceId, raceAwaiting.approvalId);
    raceFixture.db.sqlite.prepare("UPDATE approval_requests SET status='approved',decided_by_actor_id=requested_by_actor_id,decided_at=?,decision_id='expired-approval-decision' WHERE workspace_id=? AND id='expired-approval'")
      .run(decidedAt, raceFixture.workspace.workspaceId);
    expect(() => raceFixture.db.sqlite.prepare("UPDATE agent_runs SET status='authorized' WHERE workspace_id=? AND id='expired-approval-run'")
      .run(raceFixture.workspace.workspaceId))
      .toThrow(/agent authorization is no longer valid/);

    const serviceRaceFixture = await createFixture({ autonomy: 'approval-required' });
    const serviceRace = await proposeAgentAction(
      serviceRaceFixture.db as unknown as D1Database,
      serviceRaceFixture.identity,
      serviceRaceFixture.workspace,
      proposal(serviceRaceFixture, { idempotencyKey: 'grant-race-inside-approval' }),
    );
    serviceRaceFixture.db.beforeNextBatch = () => {
      serviceRaceFixture.db.sqlite.prepare('UPDATE agent_tool_grants SET expires_at=? WHERE workspace_id=? AND agent_id=? AND tool_id=?')
        .run('2000-01-01T00:00:00.000Z', serviceRaceFixture.workspace.workspaceId, serviceRaceFixture.agentId, serviceRaceFixture.toolId);
    };
    await expect(decideApproval(
      serviceRaceFixture.db as unknown as D1Database,
      serviceRaceFixture.identity,
      serviceRaceFixture.workspace,
      { approvalId: serviceRace.approvalId, decision: 'approved' },
    )).rejects.toMatchObject({ status: 409, code: 'authorization_changed' });
    expect(serviceRaceFixture.db.sqlite.prepare('SELECT status FROM approval_requests WHERE workspace_id=? AND id=?').get(serviceRaceFixture.workspace.workspaceId, serviceRace.approvalId))
      .toMatchObject({ status: 'cancelled' });
    expect(serviceRaceFixture.db.sqlite.prepare('SELECT status FROM agent_runs WHERE workspace_id=? AND id=?').get(serviceRaceFixture.workspace.workspaceId, serviceRace.runId))
      .toMatchObject({ status: 'cancelled' });
    expect(serviceRaceFixture.db.sqlite.prepare("SELECT COUNT(*) AS count FROM agent_traces WHERE workspace_id=? AND run_id=? AND event_type='authorization_invalidated'").get(serviceRaceFixture.workspace.workspaceId, serviceRace.runId))
      .toMatchObject({ count: 1 });
  });

  it('[SAF-TOOL-DENIAL-001] denies disabled and ungranted tools before run creation', async () => {
    const fixture = await createFixture();
    fixture.db.sqlite.prepare('UPDATE agent_tools SET enabled=0 WHERE workspace_id=? AND id=?')
      .run(fixture.workspace.workspaceId, fixture.toolId);
    await expect(proposeAgentAction(
      fixture.db as unknown as D1Database,
      fixture.identity,
      fixture.workspace,
      proposal(fixture, { idempotencyKey: 'disabled-tool' }),
    )).rejects.toMatchObject({ status: 403, code: 'tool_not_granted' });

    fixture.db.sqlite.prepare('UPDATE agent_tools SET enabled=1 WHERE workspace_id=? AND id=?')
      .run(fixture.workspace.workspaceId, fixture.toolId);
    fixture.db.sqlite.prepare('DELETE FROM agent_tool_grants WHERE workspace_id=? AND agent_id=? AND tool_id=?')
      .run(fixture.workspace.workspaceId, fixture.agentId, fixture.toolId);
    await expect(proposeAgentAction(
      fixture.db as unknown as D1Database,
      fixture.identity,
      fixture.workspace,
      proposal(fixture, { idempotencyKey: 'ungranted-tool' }),
    )).rejects.toMatchObject({ status: 403, code: 'tool_not_granted' });
    expect(count(fixture.db, 'SELECT COUNT(*) AS count FROM agent_runs WHERE workspace_id=?', fixture.workspace.workspaceId)).toBe(0);
  });

  it('[SAF-EXTERNAL-001] keeps every harness tool local and non-external', async () => {
    const fixture = await createFixture();
    const tools = fixture.db.sqlite.prepare('SELECT transport,external FROM agent_tools WHERE workspace_id=?').all(fixture.workspace.workspaceId);
    expect(tools).toEqual([{ transport: 'local-simulator', external: 0 }]);
    expect(count(fixture.db, "SELECT COUNT(*) AS count FROM agent_tools WHERE workspace_id=? AND (external<>0 OR transport<>'local-simulator')", fixture.workspace.workspaceId)).toBe(0);
  });
});
