import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCAL_AGENT_GRANT_TTL_MS,
  revokeAgentToolGrant,
  setAgentToolGrantExpiry,
} from '@/server/agent-grants';
import { createAgent, executeAuthorizedRun, proposeAgentAction, setAgentSafety } from '@/server/agent-plane';
import { loadControlPlane, type WorkspaceContext } from '@/server/control-plane';
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

function seedWorkspace(db: SqliteD1Database, label: string, role: WorkspaceContext['workspace']['role'] = 'owner') {
  sequence += 1;
  const now = new Date().toISOString();
  const workspaceId = `grant-workspace-${label}-${sequence}`;
  const identity: RequestIdentity = {
    userId: `grant-owner-${label}-${sequence}`,
    email: `owner-${label}-${sequence}@example.test`,
    displayName: `Grant Owner ${label}`,
    requestId: `grant-request-${label}-${sequence}`,
    runtimeMode: 'device',
  };
  db.sqlite.prepare(`
    INSERT INTO workspaces (
      id,owner_user_id,owner_email,owner_name,name,profile,timezone,currency,locale,
      settings_json,created_at,updated_at
    ) VALUES (?,?,?,?,?,'business','UTC','USD','en-US','{}',?,?)
  `).run(workspaceId, identity.userId, identity.email, identity.displayName, `${label} workspace`, now, now);
  const workspace: WorkspaceContext = {
    workspaceId,
    workspace: {
      id: workspaceId,
      name: `${label} workspace`,
      ownerEmail: identity.email,
      ownerName: identity.displayName,
      role,
      profile: 'business',
      timezone: 'UTC',
      currency: 'USD',
      locale: 'en-US',
      settings: {},
      createdAt: now,
      updatedAt: now,
    },
  };
  return { identity, workspace };
}

function database() {
  const db = new SqliteD1Database();
  databases.push(db);
  return db;
}

function count(db: SqliteD1Database, sql: string, ...params: SQLInputValue[]) {
  return Number((db.sqlite.prepare(sql).get(...params) as { count: number }).count);
}

describe('agent grant management validation', () => {
  it('requires agents:manage and validates a canonical future UTC expiry before storage access', async () => {
    const noDb = {} as D1Database;
    const db = database();
    const member = seedWorkspace(db, 'member', 'member');
    const owner = { ...member.workspace, workspace: { ...member.workspace.workspace, role: 'owner' as const } };

    await expect(revokeAgentToolGrant(noDb, member.identity, member.workspace, { agentId: 'agent', toolId: 'tool' }, 'key'))
      .rejects.toMatchObject({ status: 403, code: 'forbidden' });
    await expect(setAgentToolGrantExpiry(noDb, member.identity, owner, { agentId: 'agent', toolId: 'tool' }, 'key'))
      .rejects.toMatchObject({ status: 400, code: 'validation_error' });
    await expect(setAgentToolGrantExpiry(noDb, member.identity, owner, { agentId: 'agent', toolId: 'tool', expiresAt: '2099-01-01T00:00:00.000+00:00' }, 'key'))
      .rejects.toMatchObject({ status: 400, code: 'validation_error' });
    await expect(setAgentToolGrantExpiry(noDb, member.identity, owner, { agentId: 'agent', toolId: 'tool', expiresAt: '2000-01-01T00:00:00.000Z' }, 'key'))
      .rejects.toMatchObject({ status: 400, code: 'validation_error' });
  });
});

describe('tenant-scoped agent grant expiry control', () => {
  it('creates bounded grants, updates and clears expiry idempotently, exposes it, and isolates tenants', async () => {
    const db = database();
    const tenantA = seedWorkspace(db, 'a');
    const tenantB = seedWorkspace(db, 'b');
    const beforeCreate = Date.now();
    const agentA = await createAgent(
      db as unknown as D1Database,
      tenantA.identity,
      tenantA.workspace,
      { name: 'Tenant A helper', autonomy: 'approval-required', monthlyBudgetCents: 100 },
      'create-agent-a',
    );
    const afterCreate = Date.now();
    const agentB = await createAgent(
      db as unknown as D1Database,
      tenantB.identity,
      tenantB.workspace,
      { name: 'Tenant B helper', autonomy: 'approval-required', monthlyBudgetCents: 100 },
      'create-agent-b',
    );

    const initial = db.sqlite.prepare('SELECT expires_at FROM agent_tool_grants WHERE workspace_id=? AND agent_id=? AND tool_id=?')
      .get(tenantA.workspace.workspaceId, agentA.agentId, agentA.toolId) as { expires_at: string };
    expect(Date.parse(initial.expires_at)).toBeGreaterThanOrEqual(beforeCreate + DEFAULT_LOCAL_AGENT_GRANT_TTL_MS);
    expect(Date.parse(initial.expires_at)).toBeLessThanOrEqual(afterCreate + DEFAULT_LOCAL_AGENT_GRANT_TTL_MS);

    const initialSnapshot = await loadControlPlane(db as unknown as D1Database, tenantA.workspace.workspaceId, 'business');
    expect(initialSnapshot.agents[0]?.tools[0]?.expiresAt).toBe(initial.expires_at);

    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const updated = await setAgentToolGrantExpiry(
      db as unknown as D1Database,
      tenantA.identity,
      tenantA.workspace,
      { agentId: agentA.agentId, toolId: agentA.toolId, expiresAt },
      'shared-expiry-key',
    );
    const replay = await setAgentToolGrantExpiry(
      db as unknown as D1Database,
      tenantA.identity,
      tenantA.workspace,
      { agentId: agentA.agentId, toolId: agentA.toolId, expiresAt },
      'shared-expiry-key',
    );
    expect(updated).toEqual({ agentId: agentA.agentId, toolId: agentA.toolId, expiresAt, status: 'updated', replayed: false });
    expect(replay).toEqual({ ...updated, replayed: true });
    expect(count(db, "SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=? AND action='agent.grant.expiry_updated'", tenantA.workspace.workspaceId)).toBe(1);

    await expect(setAgentToolGrantExpiry(
      db as unknown as D1Database,
      tenantA.identity,
      tenantA.workspace,
      { agentId: agentA.agentId, toolId: agentA.toolId, expiresAt: null },
      'shared-expiry-key',
    )).rejects.toMatchObject({ status: 409, code: 'idempotency_conflict' });

    const tenantBExpiry = new Date(Date.now() + 8 * 86_400_000).toISOString();
    await setAgentToolGrantExpiry(
      db as unknown as D1Database,
      tenantB.identity,
      tenantB.workspace,
      { agentId: agentB.agentId, toolId: agentB.toolId, expiresAt: tenantBExpiry },
      'shared-expiry-key',
    );
    await expect(setAgentToolGrantExpiry(
      db as unknown as D1Database,
      tenantA.identity,
      tenantA.workspace,
      { agentId: agentB.agentId, toolId: agentB.toolId, expiresAt: null },
      'foreign-grant-key',
    )).rejects.toMatchObject({ status: 404, code: 'grant_not_found' });
    expect(db.sqlite.prepare('SELECT expires_at FROM agent_tool_grants WHERE workspace_id=? AND agent_id=? AND tool_id=?')
      .get(tenantB.workspace.workspaceId, agentB.agentId, agentB.toolId)).toEqual({ expires_at: tenantBExpiry });

    const cleared = await setAgentToolGrantExpiry(
      db as unknown as D1Database,
      tenantA.identity,
      tenantA.workspace,
      { agentId: agentA.agentId, toolId: agentA.toolId, expiresAt: null },
      'clear-expiry-key',
    );
    expect(cleared).toMatchObject({ expiresAt: null, replayed: false });
    const clearedSnapshot = await loadControlPlane(db as unknown as D1Database, tenantA.workspace.workspaceId, 'business');
    expect(clearedSnapshot.agents[0]?.tools[0]?.expiresAt).toBeNull();
  });

  it('fails closed without a false receipt when the grant changes before its atomic batch', async () => {
    const db = database();
    const tenant = seedWorkspace(db, 'race');
    const agent = await createAgent(
      db as unknown as D1Database,
      tenant.identity,
      tenant.workspace,
      { name: 'Race helper', autonomy: 'approval-required', monthlyBudgetCents: 100 },
      'create-race-agent',
    );
    const concurrentExpiry = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const requestedExpiry = new Date(Date.now() + 3 * 86_400_000).toISOString();
    db.beforeNextBatch = () => {
      db.sqlite.prepare('UPDATE agent_tool_grants SET expires_at=? WHERE workspace_id=? AND agent_id=? AND tool_id=?')
        .run(concurrentExpiry, tenant.workspace.workspaceId, agent.agentId, agent.toolId);
    };

    await expect(setAgentToolGrantExpiry(
      db as unknown as D1Database,
      tenant.identity,
      tenant.workspace,
      { agentId: agent.agentId, toolId: agent.toolId, expiresAt: requestedExpiry },
      'racing-expiry-key',
    )).rejects.toMatchObject({ status: 409, code: 'grant_state_changed' });
    expect(db.sqlite.prepare('SELECT expires_at FROM agent_tool_grants WHERE workspace_id=? AND agent_id=? AND tool_id=?')
      .get(tenant.workspace.workspaceId, agent.agentId, agent.toolId)).toEqual({ expires_at: concurrentExpiry });
    expect(count(db, "SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=? AND action='agent.grant.expiry_updated'", tenant.workspace.workspaceId)).toBe(0);
    expect(count(db, "SELECT COUNT(*) AS count FROM idempotency_records WHERE workspace_id=? AND operation='agent.grant.expiry'", tenant.workspace.workspaceId)).toBe(0);
  });

  it('never lets renewal revive work authorized under an earlier expiry', async () => {
    const db = database();
    const tenant = seedWorkspace(db, 'renewal');
    const agent = await createAgent(
      db as unknown as D1Database,
      tenant.identity,
      tenant.workspace,
      { name: 'Renewal helper', autonomy: 'policy-autonomous', monthlyBudgetCents: 100 },
      'create-renewal-agent',
    );
    await setAgentSafety(db as unknown as D1Database, tenant.identity, tenant.workspace, { agentId: agent.agentId, status: 'active' });
    const authorized = await proposeAgentAction(db as unknown as D1Database, tenant.identity, tenant.workspace, {
      agentId: agent.agentId,
      toolId: agent.toolId,
      summary: 'Authorization from the old grant window',
      requestedScope: 'records:read',
      estimatedCostCents: 1,
      idempotencyKey: 'authorized-before-renewal',
    });
    db.sqlite.prepare('UPDATE agent_tool_grants SET expires_at=? WHERE workspace_id=? AND agent_id=? AND tool_id=?')
      .run('2000-01-01T00:00:00.000Z', tenant.workspace.workspaceId, agent.agentId, agent.toolId);

    const renewedUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await setAgentToolGrantExpiry(
      db as unknown as D1Database,
      tenant.identity,
      tenant.workspace,
      { agentId: agent.agentId, toolId: agent.toolId, expiresAt: renewedUntil },
      'renew-expired-grant',
    );

    expect(db.sqlite.prepare('SELECT status FROM agent_runs WHERE workspace_id=? AND id=?')
      .get(tenant.workspace.workspaceId, authorized.runId)).toEqual({ status: 'cancelled' });
    expect(count(db, "SELECT COUNT(*) AS count FROM agent_traces WHERE workspace_id=? AND run_id=? AND event_type='grant_expiry_changed'", tenant.workspace.workspaceId, authorized.runId)).toBe(1);
    await expect(executeAuthorizedRun(db as unknown as D1Database, tenant.identity, tenant.workspace, authorized.runId))
      .rejects.toMatchObject({ status: 409, code: 'run_not_authorized' });
    const newProposal = await proposeAgentAction(db as unknown as D1Database, tenant.identity, tenant.workspace, {
      agentId: agent.agentId,
      toolId: agent.toolId,
      summary: 'Fresh authorization after renewal',
      requestedScope: 'records:read',
      estimatedCostCents: 1,
      idempotencyKey: 'authorized-after-renewal',
    });
    expect(newProposal.status).toBe('authorized');
  });
});

describe('safe agent grant revocation', () => {
  it('atomically cancels pending and authorized work, closes approvals, records evidence, and replays', async () => {
    const db = database();
    const tenant = seedWorkspace(db, 'revoke');
    const agent = await createAgent(
      db as unknown as D1Database,
      tenant.identity,
      tenant.workspace,
      { name: 'Revocable helper', autonomy: 'policy-autonomous', monthlyBudgetCents: 100 },
      'create-revocable-agent',
    );
    await setAgentSafety(db as unknown as D1Database, tenant.identity, tenant.workspace, { agentId: agent.agentId, status: 'active' });
    const authorized = await proposeAgentAction(db as unknown as D1Database, tenant.identity, tenant.workspace, {
      agentId: agent.agentId,
      toolId: agent.toolId,
      summary: 'Read relationships',
      requestedScope: 'records:read',
      estimatedCostCents: 1,
      idempotencyKey: 'authorized-before-revoke',
    });
    const awaiting = await proposeAgentAction(db as unknown as D1Database, tenant.identity, tenant.workspace, {
      agentId: agent.agentId,
      toolId: agent.toolId,
      summary: 'Destructive request that must wait',
      requestedScope: 'records:read',
      estimatedCostCents: 1,
      destructive: true,
      idempotencyKey: 'awaiting-before-revoke',
    });
    expect(authorized.status).toBe('authorized');
    expect(awaiting.status).toBe('awaiting_approval');

    const revoked = await revokeAgentToolGrant(
      db as unknown as D1Database,
      tenant.identity,
      tenant.workspace,
      { agentId: agent.agentId, toolId: agent.toolId },
      'revoke-grant-key',
    );
    const replay = await revokeAgentToolGrant(
      db as unknown as D1Database,
      tenant.identity,
      tenant.workspace,
      { agentId: agent.agentId, toolId: agent.toolId },
      'revoke-grant-key',
    );
    expect(revoked).toEqual({ agentId: agent.agentId, toolId: agent.toolId, status: 'revoked', replayed: false });
    expect(replay).toEqual({ ...revoked, replayed: true });
    expect(count(db, 'SELECT COUNT(*) AS count FROM agent_tool_grants WHERE workspace_id=? AND agent_id=? AND tool_id=?', tenant.workspace.workspaceId, agent.agentId, agent.toolId)).toBe(0);
    expect(db.sqlite.prepare('SELECT status FROM agent_runs WHERE workspace_id=? AND id=?').get(tenant.workspace.workspaceId, authorized.runId)).toEqual({ status: 'cancelled' });
    expect(db.sqlite.prepare('SELECT status FROM agent_runs WHERE workspace_id=? AND id=?').get(tenant.workspace.workspaceId, awaiting.runId)).toEqual({ status: 'cancelled' });
    expect(db.sqlite.prepare('SELECT status FROM approval_requests WHERE workspace_id=? AND id=?').get(tenant.workspace.workspaceId, awaiting.approvalId)).toEqual({ status: 'cancelled' });
    expect(count(db, "SELECT COUNT(*) AS count FROM agent_traces WHERE workspace_id=? AND event_type='grant_revoked'", tenant.workspace.workspaceId)).toBe(2);
    expect(count(db, "SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=? AND action='agent.grant.revoked'", tenant.workspace.workspaceId)).toBe(1);
    expect(count(db, "SELECT COUNT(*) AS count FROM idempotency_records WHERE workspace_id=? AND operation='agent.grant.revoke'", tenant.workspace.workspaceId)).toBe(1);

    await expect(executeAuthorizedRun(db as unknown as D1Database, tenant.identity, tenant.workspace, authorized.runId))
      .rejects.toMatchObject({ status: 409, code: 'run_not_authorized' });
    await expect(proposeAgentAction(db as unknown as D1Database, tenant.identity, tenant.workspace, {
      agentId: agent.agentId,
      toolId: agent.toolId,
      summary: 'Cannot use a revoked grant',
      requestedScope: 'records:read',
      estimatedCostCents: 0,
      idempotencyKey: 'after-revoke',
    })).rejects.toMatchObject({ status: 403, code: 'tool_not_granted' });
    const snapshot = await loadControlPlane(db as unknown as D1Database, tenant.workspace.workspaceId, 'business');
    expect(snapshot.agents[0]?.tools).toEqual([]);
  });

  it('keeps direct database bypasses behind the execution-receipt trigger', async () => {
    const db = database();
    const tenant = seedWorkspace(db, 'trigger');
    const agent = await createAgent(
      db as unknown as D1Database,
      tenant.identity,
      tenant.workspace,
      { name: 'Trigger helper', autonomy: 'policy-autonomous', monthlyBudgetCents: 100 },
      'create-trigger-agent',
    );
    await setAgentSafety(db as unknown as D1Database, tenant.identity, tenant.workspace, { agentId: agent.agentId, status: 'active' });
    const authorized = await proposeAgentAction(db as unknown as D1Database, tenant.identity, tenant.workspace, {
      agentId: agent.agentId,
      toolId: agent.toolId,
      summary: 'Authorized before bypass',
      requestedScope: 'records:read',
      estimatedCostCents: 1,
      idempotencyKey: 'trigger-authorized',
    });
    expect(() => db.sqlite.prepare('UPDATE agent_tool_grants SET expires_at=? WHERE workspace_id=? AND agent_id=? AND tool_id=?')
      .run('2099-01-01T00:00:00.000+00:00', tenant.workspace.workspaceId, agent.agentId, agent.toolId))
      .toThrow(/invalid agent tool grant expiry/);
    db.sqlite.prepare('DELETE FROM agent_tool_grants WHERE workspace_id=? AND agent_id=? AND tool_id=?')
      .run(tenant.workspace.workspaceId, agent.agentId, agent.toolId);
    expect(() => db.sqlite.prepare(`
      INSERT INTO execution_receipts (
        id,workspace_id,run_id,tool_id,outcome,input_hash,output_hash,cost_cents,metadata_json
      ) VALUES ('bypass-receipt',?,?,?,'succeeded',?,?,1,'{}')
    `).run(tenant.workspace.workspaceId, authorized.runId, agent.toolId, 'a'.repeat(64), 'b'.repeat(64)))
      .toThrow(/run is not executable/);
  });
});
