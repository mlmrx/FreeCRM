import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createAgent, setAgentSafety } from '@/server/agent-plane';
import type { WorkspaceContext } from '@/server/control-plane';
import type { RequestIdentity } from '@/server/request-context';

class Statement {
  constructor(readonly db: PolicyDatabase, readonly sql: string, readonly params: unknown[] = []) {}
  bind(...params: unknown[]) { return new Statement(this.db, this.sql, params); }
  async first<T>() { return (this.db.sqlite.prepare(this.sql).get(...this.params as SQLInputValue[]) as T | undefined) ?? null; }
  async all<T>() { return { success: true, results: this.db.sqlite.prepare(this.sql).all(...this.params as SQLInputValue[]) as T[] }; }
  async run<T>() {
    if (this.db.readOnly) throw new Error('Dry-run attempted a write');
    this.db.writes += 1;
    const result = this.db.sqlite.prepare(this.sql).run(...this.params as SQLInputValue[]);
    return { success: true, results: [] as T[], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}
export class PolicyDatabase {
  readonly sqlite = new DatabaseSync(':memory:');
  readOnly = false;
  writes = 0;
  queries: string[] = [];
  beforeNextBatch: (() => void) | null = null;
  constructor() {
    this.sqlite.exec('PRAGMA foreign_keys=ON');
    const directory = new URL('../drizzle/', import.meta.url);
    for (const file of readdirSync(directory).filter((entry) => /^\d{4}_.+\.sql$/.test(entry)).sort()) {
      for (const sql of readFileSync(new URL(file, directory), 'utf8').split('--> statement-breakpoint')) if (sql.trim()) this.sqlite.exec(sql);
    }
  }
  prepare(sql: string) {
    this.queries.push(sql);
    if (this.readOnly && !/^\s*SELECT\b/i.test(sql)) throw new Error('Dry-run prepared non-read SQL');
    return new Statement(this, sql);
  }
  async batch<T>(statements: D1PreparedStatement[]) {
    if (this.readOnly) throw new Error('Dry-run opened a mutation batch');
    const before = this.beforeNextBatch; this.beforeNextBatch = null; before?.();
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements as unknown as Statement[]) results.push(await statement.run<T>());
      this.sqlite.exec('COMMIT'); return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  asD1() { return this as unknown as D1Database; }
}
let sequence = 0;
export async function policyFixture(db: PolicyDatabase, autonomy: 'policy-autonomous' | 'approval-required' = 'policy-autonomous') {
  const id = ++sequence;
  const workspaceId = `policy-workspace-${id}`;
  const now = new Date().toISOString();
  const identity: RequestIdentity = { userId: `policy-owner-${id}`, email: `owner-${id}@example.test`, displayName: 'Synthetic policy owner', requestId: `policy-request-${id}`, runtimeMode: 'device' };
  db.sqlite.prepare("INSERT INTO workspaces (id,owner_user_id,owner_email,owner_name,name,profile,timezone,currency,locale,settings_json,created_at,updated_at) VALUES (?,?,?,?,?,'business','UTC','USD','en-US','{}',?,?)").run(workspaceId, identity.userId, identity.email, identity.displayName, 'Policy fixture', now, now);
  db.sqlite.prepare("INSERT INTO memberships (workspace_id,user_id,email,role,created_at) VALUES (?,?,?,'owner',?)").run(workspaceId, identity.userId, identity.email, now);
  const workspace: WorkspaceContext = { workspaceId, workspace: { id: workspaceId, name: 'Policy fixture', ownerEmail: identity.email, ownerName: identity.displayName, role: 'owner', profile: 'business', timezone: 'UTC', currency: 'USD', locale: 'en-US', settings: {}, createdAt: now, updatedAt: now } };
  const agent = await createAgent(db.asD1(), identity, workspace, { name: 'Policy test agent', autonomy, monthlyBudgetCents: 100 }, `policy-create-${id}`);
  await setAgentSafety(db.asD1(), identity, workspace, { agentId: agent.agentId, status: 'active' });
  const records = [`contact-a-${id}`, `contact-b-${id}`, `company-${id}`];
  for (const [index, recordId] of records.entries()) db.sqlite.prepare("INSERT INTO records (id,workspace_id,object_type,name,owner_user_id,status,fields_json,tags_json,created_at,updated_at) VALUES (?,?,?,?,?,'active','{}','[]',?,?)").run(recordId, workspaceId, index === 2 ? 'company' : 'contact', 'Synthetic record', identity.userId, now, now);
  return { db, identity, workspace, ...agent, records };
}
