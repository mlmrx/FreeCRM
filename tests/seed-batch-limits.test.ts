import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { D1_MAX_QUERIES_PER_INVOCATION, assertD1BatchSize } from '@/server/d1-limits';
import { seedStatements } from '@/server/seed';

type CapturedStatement = {
  sql: string;
  params: unknown[];
  bind: (...params: unknown[]) => CapturedStatement;
};

const database = {
  prepare(sql: string): CapturedStatement {
    const statement: CapturedStatement = {
      sql,
      params: [],
      bind(...params: unknown[]) {
        return { ...statement, params };
      },
    };
    return statement;
  },
} as unknown as D1Database;

const identity = {
  userId: 'owner-1',
  email: 'owner@example.test',
  displayName: 'Owner',
  role: 'owner',
  runtimeMode: 'device',
  requestId: 'request-1',
} as const;

describe('D1 Free-plan batch budgets', () => {
  it('keeps every seed statement within D1 binding limits and the 48-query application budget', () => {
    const seed = seedStatements(database, 'workspace-1', identity, 'USD') as unknown as CapturedStatement[];
    // First install adds workspace + membership. Demo reset adds 13 cleanup,
    // three completion/settings, and three audit/outbox/idempotency statements.
    const firstInstallBatchSize = 2 + seed.length;
    const demoResetBatchSize = 19 + seed.length;

    expect(D1_MAX_QUERIES_PER_INVOCATION).toBe(48);
    expect(seed).toHaveLength(22);
    expect(Math.max(...seed.map((statement) => statement.params.length))).toBeLessThanOrEqual(100);
    for (const statement of seed) expect(statement.sql.match(/\?/g)?.length ?? 0).toBe(statement.params.length);
    expect(firstInstallBatchSize).toBeLessThanOrEqual(D1_MAX_QUERIES_PER_INVOCATION);
    expect(demoResetBatchSize).toBeLessThanOrEqual(D1_MAX_QUERIES_PER_INVOCATION);
    expect(() => assertD1BatchSize(Array.from({ length: 49 }, () => seed[0] as unknown as D1PreparedStatement), 'test')).toThrow('portable per-invocation limit is 48');
  });

  it('executes every consolidated seed row atomically against the reviewed SQLite schema', () => {
    const seed = seedStatements(database, 'workspace-1', identity, 'USD') as unknown as CapturedStatement[];
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec('PRAGMA foreign_keys=ON');
      const migrationDirectory = new URL('../drizzle/', import.meta.url);
      for (const name of readdirSync(migrationDirectory).filter((entry) => /^\d{4}_.+\.sql$/.test(entry)).sort()) {
        const migration = readFileSync(new URL(name, migrationDirectory), 'utf8');
        for (const statement of migration.split('--> statement-breakpoint')) {
          if (statement.trim()) sqlite.exec(statement);
        }
      }
      sqlite.exec('BEGIN IMMEDIATE');
      sqlite.prepare(`
        INSERT INTO workspaces (
          id,owner_user_id,owner_email,owner_name,name,timezone,currency,locale,settings_json,created_at,updated_at
        ) VALUES (?,?,?,?,?,'America/Los_Angeles','USD','en-US','{}',?,?)
      `).run('workspace-1', identity.userId, identity.email, identity.displayName, 'Seed test', new Date().toISOString(), new Date().toISOString());
      sqlite.prepare("INSERT INTO memberships (workspace_id,user_id,email,role,created_at) VALUES (?,?,?,'owner',?)")
        .run('workspace-1', identity.userId, identity.email, new Date().toISOString());
      for (const statement of seed) sqlite.prepare(statement.sql).run(...statement.params as SQLInputValue[]);
      sqlite.exec('COMMIT');

      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM records WHERE workspace_id='workspace-1'").get()).toMatchObject({ count: 42 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM record_links WHERE workspace_id='workspace-1'").get()).toMatchObject({ count: 20 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM notes WHERE workspace_id='workspace-1'").get()).toMatchObject({ count: 5 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM integrations WHERE workspace_id='workspace-1'").get()).toMatchObject({ count: 8 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM workflow_rules WHERE workspace_id='workspace-1'").get()).toMatchObject({ count: 3 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM workspace_maintenance_sessions WHERE workspace_id='workspace-1' AND purpose='seed'").get()).toMatchObject({ count: 0 });
    } finally {
      sqlite.close();
    }
  });
});
