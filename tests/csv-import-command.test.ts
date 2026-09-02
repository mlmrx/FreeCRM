import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { executeCommand, readCommandReplay } from '@/server/commands';
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
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

const identity: RequestIdentity = {
  userId: 'owner-a',
  email: 'owner-a@example.test',
  displayName: 'Owner A',
  requestId: 'request-a',
  runtimeMode: 'device',
};

function setup(profile: 'personal' | 'business' | 'enterprise' = 'personal') {
  const db = new SqliteD1Database();
  databases.push(db);
  const now = new Date().toISOString();
  db.sqlite.prepare(`INSERT INTO workspaces (id,owner_user_id,owner_email,owner_name,name,profile,timezone,currency,locale,settings_json,created_at,updated_at) VALUES ('workspace-a',?,?,?,'Owner CRM',?,'UTC','USD','en-US','{}',?,?)`)
    .run(identity.userId, identity.email, identity.displayName, profile, now, now);
  const context: WorkspaceContext = {
    workspaceId: 'workspace-a',
    workspace: {
      id: 'workspace-a',
      name: 'Owner CRM',
      ownerEmail: identity.email,
      ownerName: identity.displayName,
      role: 'owner',
      profile,
      timezone: 'UTC',
      currency: 'USD',
      locale: 'en-US',
      settings: {},
      createdAt: now,
      updatedAt: now,
    },
  };
  return { db, context };
}

function body(records: Array<Record<string, unknown>>) {
  return JSON.stringify({ mode: 'commit', objectType: 'contact', records });
}

describe('atomic import command invariants', () => {
  it('commits and replays one audited import without duplicating records', async () => {
    const { db, context } = setup();
    const records = [{ objectType: 'contact', name: 'Ada', email: 'ada@example.com', source: 'CSV import' }];
    const first = await executeCommand(db as unknown as D1Database, identity, context, { type: 'csv.import', payload: { records } }, 'import-key', body(records));
    const replay = await executeCommand(db as unknown as D1Database, identity, context, { type: 'csv.import', payload: { records } }, 'import-key', body(records));

    expect(first.result).toMatchObject({ imported: 1 });
    expect(replay).toEqual({ ...first, replayed: true });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM records WHERE workspace_id='workspace-a'").get()).toMatchObject({ count: 1 });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id='workspace-a' AND action='csv.import'").get()).toMatchObject({ count: 1 });
    expect(Math.max(...db.batchSizes)).toBe(5);
  });

  it('reads durable receipts by workspace and exact payload without mutable preflight', async () => {
    const { db, context } = setup();
    const records = [{ objectType: 'contact', name: 'Ada', email: 'ada@example.com', source: 'CSV import' }];
    const rawBody = body(records);
    const first = await executeCommand(db as unknown as D1Database, identity, context, { type: 'csv.import', payload: { records } }, 'recovery-key', rawBody);
    db.sqlite.prepare("INSERT INTO capability_overrides (workspace_id,capability_key,enabled,updated_at) VALUES ('workspace-a','relationships',0,?)").run(new Date().toISOString());

    await expect(readCommandReplay(db as unknown as D1Database, 'workspace-a', 'csv.import', 'recovery-key', rawBody))
      .resolves.toEqual({ ...first, replayed: true });
    await expect(readCommandReplay(db as unknown as D1Database, 'workspace-a', 'csv.import', 'recovery-key', `${rawBody} `))
      .rejects.toMatchObject({ status: 409, code: 'idempotency_conflict' });
    await expect(readCommandReplay(db as unknown as D1Database, 'workspace-b', 'csv.import', 'recovery-key', rawBody))
      .resolves.toBeNull();
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM records WHERE workspace_id='workspace-a'").get()).toMatchObject({ count: 1 });
  });

  it('rejects malformed entries and profile-disabled record types without partial writes', async () => {
    const { db, context } = setup('personal');
    await expect(executeCommand(
      db as unknown as D1Database,
      identity,
      context,
      { type: 'csv.import', payload: { records: [{ objectType: 'contact', name: 'Ada' }, null] } },
      'bad-row-key',
      'bad rows',
    )).rejects.toMatchObject({ status: 400, code: 'validation_error', details: { field: 'records.1' } });
    await expect(executeCommand(
      db as unknown as D1Database,
      identity,
      context,
      { type: 'csv.import', payload: { records: [{ objectType: 'ticket', name: 'Help' }] } },
      'ticket-key',
      'ticket row',
    )).rejects.toMatchObject({ status: 403, code: 'capability_disabled' });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM records WHERE workspace_id='workspace-a'").get()).toMatchObject({ count: 0 });
  });

  it('enforces profile limits before building the atomic batch', async () => {
    const { db, context } = setup('personal');
    const insert = db.sqlite.prepare(`INSERT INTO records (id,workspace_id,object_type,name,status,lifecycle,owner_user_id,email,phone,company_name,amount_cents,currency,probability,source,priority,due_at,closed_at,fields_json,tags_json,version,archived_at,created_at,updated_at) VALUES (?,'workspace-a','contact',?,'active','active',?,NULL,NULL,NULL,0,'USD',0,NULL,NULL,NULL,NULL,'{}','[]',1,NULL,?,?)`);
    const now = new Date().toISOString();
    for (let index = 0; index < 499; index += 1) insert.run(`existing-${index}`, `Existing ${index}`, identity.userId, now, now);
    const records = [
      { objectType: 'contact', name: 'Ada' },
      { objectType: 'company', name: 'Analytical Engines' },
    ];
    await expect(executeCommand(db as unknown as D1Database, identity, context, { type: 'csv.import', payload: { records } }, 'limit-key', body(records)))
      .rejects.toMatchObject({ status: 409, code: 'capability_limit' });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM records WHERE workspace_id='workspace-a'").get()).toMatchObject({ count: 499 });
  });

  it('accepts the largest portable batch and rejects one additional record', async () => {
    const { db, context } = setup('business');
    const records = Array.from({ length: 44 }, (_, index) => ({ objectType: 'contact', name: `Person ${index}` }));
    await expect(executeCommand(db as unknown as D1Database, identity, context, { type: 'csv.import', payload: { records } }, 'max-key', body(records)))
      .resolves.toMatchObject({ result: { imported: 44 } });
    expect(Math.max(...db.batchSizes)).toBe(48);
    const overflow = [...records, { objectType: 'contact', name: 'Overflow' }];
    await expect(executeCommand(db as unknown as D1Database, identity, context, { type: 'csv.import', payload: { records: overflow } }, 'overflow-key', body(overflow)))
      .rejects.toMatchObject({ status: 413, code: 'import_too_large' });
  });

  it('isolates identical import keys, records, audits, and receipts between workspaces', async () => {
    const { db, context } = setup('business');
    const now = new Date().toISOString();
    const identityB: RequestIdentity = {
      userId: 'owner-b',
      email: 'owner-b@example.test',
      displayName: 'Owner B',
      requestId: 'request-b',
      runtimeMode: 'device',
    };
    db.sqlite.prepare(`INSERT INTO workspaces (id,owner_user_id,owner_email,owner_name,name,profile,timezone,currency,locale,settings_json,created_at,updated_at) VALUES ('workspace-b',?,?,?,'Owner B CRM','business','UTC','USD','en-US','{}',?,?)`)
      .run(identityB.userId, identityB.email, identityB.displayName, now, now);
    const contextB: WorkspaceContext = {
      workspaceId: 'workspace-b',
      workspace: { ...context.workspace, id: 'workspace-b', name: 'Owner B CRM', ownerEmail: identityB.email, ownerName: identityB.displayName },
    };
    const recordsA = [{ objectType: 'contact', name: 'Tenant A person' }];
    const recordsB = [{ objectType: 'contact', name: 'Tenant B person' }];

    await executeCommand(db as unknown as D1Database, identity, context, { type: 'csv.import', payload: { records: recordsA } }, 'shared-import-key', body(recordsA));
    await executeCommand(db as unknown as D1Database, identityB, contextB, { type: 'csv.import', payload: { records: recordsB } }, 'shared-import-key', body(recordsB));

    expect(db.sqlite.prepare("SELECT name FROM records WHERE workspace_id='workspace-a'").all()).toEqual([{ name: 'Tenant A person' }]);
    expect(db.sqlite.prepare("SELECT name FROM records WHERE workspace_id='workspace-b'").all()).toEqual([{ name: 'Tenant B person' }]);
    for (const workspaceId of ['workspace-a', 'workspace-b']) {
      expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=? AND action='csv.import'").get(workspaceId)).toMatchObject({ count: 1 });
      expect(db.sqlite.prepare("SELECT COUNT(*) AS count FROM idempotency_records WHERE workspace_id=? AND operation='csv.import' AND key='shared-import-key'").get(workspaceId)).toMatchObject({ count: 1 });
    }
  });
});
