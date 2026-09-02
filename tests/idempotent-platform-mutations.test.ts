import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { createAgent } from '@/server/agent-plane';
import { executeCommand } from '@/server/commands';
import { connectSimulator, disconnectSimulator } from '@/server/connectors';
import type { WorkspaceContext } from '@/server/control-plane';
import type { RequestIdentity } from '@/server/request-context';

class SqliteD1Statement {
  constructor(public readonly database: DatabaseSync, public readonly sql: string, public readonly params: unknown[] = []) {}

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
    return { success: true, results: [] as T[], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

class SqliteD1Database {
  readonly sqlite = new DatabaseSync(':memory:');
  readonly batchSizes: number[] = [];

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
    this.batchSizes.push(statements.length);
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

function database() {
  const db = new SqliteD1Database();
  databases.push(db);
  return db;
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

const identityA: RequestIdentity = { userId: 'owner-a', email: 'owner-a@example.test', displayName: 'Owner A', requestId: 'request-a', runtimeMode: 'device' };
const identityB: RequestIdentity = { userId: 'owner-b', email: 'owner-b@example.test', displayName: 'Owner B', requestId: 'request-b', runtimeMode: 'device' };

function seedWorkspace(db: SqliteD1Database, workspaceId: string, identity: RequestIdentity): WorkspaceContext {
  const now = new Date().toISOString();
  db.sqlite.prepare(`INSERT INTO workspaces (id,owner_user_id,owner_email,owner_name,name,profile,timezone,currency,locale,settings_json,created_at,updated_at) VALUES (?,?,?,?,?,'business','UTC','USD','en-US','{}',?,?)`)
    .run(workspaceId, identity.userId, identity.email, identity.displayName, `${identity.displayName} CRM`, now, now);
  return {
    workspaceId,
    workspace: { id: workspaceId, name: `${identity.displayName} CRM`, ownerEmail: identity.email, ownerName: identity.displayName, role: 'owner', profile: 'business', timezone: 'UTC', currency: 'USD', locale: 'en-US', settings: {}, createdAt: now, updatedAt: now },
  };
}

function count(db: SqliteD1Database, sql: string, ...params: SQLInputValue[]) {
  return Number((db.sqlite.prepare(sql).get(...params) as { count: number }).count);
}

describe('durable agent creation receipts', () => {
  it('atomically replays one tenant mutation, rejects key reuse, and scopes the same key by tenant', async () => {
    const db = database();
    const tenantA = seedWorkspace(db, 'tenant-a', identityA);
    const tenantB = seedWorkspace(db, 'tenant-b', identityB);
    const expired = '2000-01-01T00:00:00.000Z';
    db.sqlite.prepare("INSERT INTO idempotency_records (workspace_id,operation,key,request_hash,status_code,response_json,created_at,expires_at) VALUES (?,'old.operation','old-a','hash',200,'{}',?,?)").run(tenantA.workspaceId, expired, expired);
    db.sqlite.prepare("INSERT INTO idempotency_records (workspace_id,operation,key,request_hash,status_code,response_json,created_at,expires_at) VALUES (?,'old.operation','old-b','hash',200,'{}',?,?)").run(tenantB.workspaceId, expired, expired);

    const created = await createAgent(db as unknown as D1Database, identityA, tenantA, { name: 'Helper', autonomy: 'approval-required', monthlyBudgetCents: 2500 }, 'agent-create-key');
    const replay = await createAgent(db as unknown as D1Database, identityA, tenantA, { name: 'Helper', autonomy: 'approval-required', monthlyBudgetCents: 2500 }, 'agent-create-key');

    expect(created).toMatchObject({ status: 'paused', replayed: false });
    expect(replay).toEqual({ ...created, replayed: true });
    expect(count(db, 'SELECT COUNT(*) AS count FROM agent_identities WHERE workspace_id=?', tenantA.workspaceId)).toBe(1);
    expect(count(db, "SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=? AND action='agent.created'", tenantA.workspaceId)).toBe(1);
    expect(count(db, "SELECT COUNT(*) AS count FROM idempotency_records WHERE workspace_id=? AND operation='agent.create'", tenantA.workspaceId)).toBe(1);
    expect(count(db, "SELECT COUNT(*) AS count FROM idempotency_records WHERE workspace_id=? AND operation='old.operation'", tenantA.workspaceId)).toBe(0);
    expect(count(db, "SELECT COUNT(*) AS count FROM idempotency_records WHERE workspace_id=? AND operation='old.operation'", tenantB.workspaceId)).toBe(1);

    await expect(createAgent(db as unknown as D1Database, identityA, tenantA, { name: 'Different', autonomy: 'approval-required', monthlyBudgetCents: 2500 }, 'agent-create-key'))
      .rejects.toMatchObject({ status: 409, code: 'idempotency_conflict' });
    db.sqlite.prepare("UPDATE idempotency_records SET response_json=? WHERE workspace_id=? AND operation='agent.create' AND key='agent-create-key'")
      .run(JSON.stringify({ ok: true, result: { discardedByReset: true } }), tenantA.workspaceId);
    await expect(createAgent(db as unknown as D1Database, identityA, tenantA, { name: 'Helper', autonomy: 'approval-required', monthlyBudgetCents: 2500 }, 'agent-create-key'))
      .rejects.toMatchObject({ status: 409, code: 'idempotency_receipt_discarded' });

    const otherTenant = await createAgent(db as unknown as D1Database, identityB, tenantB, { name: 'Helper', autonomy: 'approval-required', monthlyBudgetCents: 2500 }, 'agent-create-key');
    expect(otherTenant.agentId).not.toBe(created.agentId);
    expect(count(db, 'SELECT COUNT(*) AS count FROM agent_identities')).toBe(2);
    expect(Math.max(...db.batchSizes)).toBeLessThanOrEqual(48);
  });
});

describe('durable connector lifecycle receipts', () => {
  it('atomically replays connect/disconnect and isolates identical keys between tenants', async () => {
    const db = database();
    const tenantA = seedWorkspace(db, 'tenant-a', identityA);
    const tenantB = seedWorkspace(db, 'tenant-b', identityB);

    const connected = await connectSimulator(db as unknown as D1Database, identityA, tenantA, 'csv', undefined, 'connector-connect-key');
    const connectReplay = await connectSimulator(db as unknown as D1Database, identityA, tenantA, 'csv', undefined, 'connector-connect-key');
    expect(connectReplay).toEqual({ ...connected, replayed: true });
    expect(count(db, "SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=? AND action='connector.connected'", tenantA.workspaceId)).toBe(1);
    expect(db.sqlite.prepare('SELECT credential_generation FROM connector_connections WHERE workspace_id=? AND id=?').get(tenantA.workspaceId, connected.id)).toMatchObject({ credential_generation: 1 });

    await expect(connectSimulator(db as unknown as D1Database, identityA, tenantA, 'webhook-simulator', 'w'.repeat(32), 'connector-connect-key'))
      .rejects.toMatchObject({ status: 409, code: 'idempotency_conflict' });
    const otherTenant = await connectSimulator(db as unknown as D1Database, identityB, tenantB, 'csv', undefined, 'connector-connect-key');
    expect(otherTenant.id).not.toBe(connected.id);
    db.sqlite.prepare("UPDATE idempotency_records SET response_json=? WHERE workspace_id=? AND operation='connector.connect' AND key='connector-connect-key'")
      .run(JSON.stringify({ ok: true, result: { discardedByReset: true } }), tenantA.workspaceId);
    await expect(connectSimulator(db as unknown as D1Database, identityA, tenantA, 'csv', undefined, 'connector-connect-key'))
      .rejects.toMatchObject({ status: 409, code: 'idempotency_receipt_discarded' });

    const disconnected = await disconnectSimulator(db as unknown as D1Database, identityA, tenantA, connected.id, 'connector-disconnect-key');
    const disconnectReplay = await disconnectSimulator(db as unknown as D1Database, identityA, tenantA, connected.id, 'connector-disconnect-key');
    expect(disconnectReplay).toEqual({ ...disconnected, replayed: true });
    expect(count(db, "SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=? AND action='connector.disconnected'", tenantA.workspaceId)).toBe(1);
    expect(db.sqlite.prepare('SELECT status,credential_generation FROM connector_connections WHERE workspace_id=? AND id=?').get(tenantA.workspaceId, connected.id)).toMatchObject({ status: 'disconnected', credential_generation: 2 });
    expect(count(db, "SELECT COUNT(*) AS count FROM idempotency_records WHERE workspace_id=? AND operation IN ('connector.connect','connector.disconnect')", tenantA.workspaceId)).toBe(2);
    db.sqlite.prepare("UPDATE idempotency_records SET response_json='{}' WHERE workspace_id=? AND operation='connector.disconnect' AND key='connector-disconnect-key'").run(tenantA.workspaceId);
    await expect(disconnectSimulator(db as unknown as D1Database, identityA, tenantA, connected.id, 'connector-disconnect-key'))
      .rejects.toMatchObject({ status: 500, code: 'idempotency_receipt_invalid' });
    expect(Math.max(...db.batchSizes)).toBeLessThanOrEqual(48);
  });
});

describe('tenant-scoped command receipt cleanup', () => {
  it('never lets one tenant delete another tenant\'s expired idempotency receipts', async () => {
    const db = database();
    const tenantA = seedWorkspace(db, 'tenant-a', identityA);
    const tenantB = seedWorkspace(db, 'tenant-b', identityB);
    const expired = '2000-01-01T00:00:00.000Z';
    const created = '1999-12-31T00:00:00.000Z';
    const insert = db.sqlite.prepare(`
      INSERT INTO idempotency_records (
        workspace_id, operation, key, request_hash, status_code, response_json, created_at, expires_at
      ) VALUES (?, 'old.operation', ?, 'foreign-hash', 200, '{}', ?, ?)
    `);
    insert.run(tenantA.workspaceId, 'expired-a', created, expired);
    insert.run(tenantB.workspaceId, 'expired-b', created, expired);

    const command = { type: 'workspace.update', payload: { name: 'Tenant A revised' } } as const;
    await executeCommand(
      db as unknown as D1Database,
      identityA,
      tenantA,
      command,
      'tenant-a-update',
      JSON.stringify(command),
    );

    expect(count(db, "SELECT COUNT(*) AS count FROM idempotency_records WHERE workspace_id=? AND operation='old.operation'", tenantA.workspaceId)).toBe(0);
    expect(count(db, "SELECT COUNT(*) AS count FROM idempotency_records WHERE workspace_id=? AND operation='old.operation'", tenantB.workspaceId)).toBe(1);
    expect(db.sqlite.prepare("SELECT key,request_hash FROM idempotency_records WHERE workspace_id=? AND operation='old.operation'").get(tenantB.workspaceId))
      .toEqual({ key: 'expired-b', request_hash: 'foreign-hash' });
  });
});
