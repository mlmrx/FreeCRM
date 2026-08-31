import { describe, expect, it } from 'vitest';
import { createActor, createRelationship, createTimelineActivity, createWorkObject } from '@/server/crm-kernel';
import type { WorkspaceContext } from '@/server/control-plane';
import type { RequestIdentity } from '@/server/request-context';

type Receipt = { request_hash: string; response_json: string };

class FakeStatement {
  args: unknown[] = [];

  constructor(readonly owner: KernelMemoryD1, readonly sql: string) {}

  bind(...args: unknown[]) {
    this.args = args;
    return this;
  }

  async run() {
    return { success: true, meta: {}, results: [] };
  }

  async first<T>() {
    return this.owner.first(this) as T | null;
  }

  async all<T>() {
    return { success: true, meta: {}, results: this.owner.all(this) as T[] };
  }
}

class KernelMemoryD1 {
  readonly receipts = new Map<string, Receipt>();
  readonly inserts = new Map<string, string[]>();

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  private receiptKey(statement: FakeStatement) {
    return `${statement.args[0]}:${statement.args[1]}:${statement.args[2]}`;
  }

  first(statement: FakeStatement): unknown {
    if (statement.sql.includes('FROM idempotency_records')) return this.receipts.get(this.receiptKey(statement)) ?? null;
    if (statement.sql.includes('SELECT mutation_epoch FROM workspaces')) return { mutation_epoch: 0 };
    if (statement.sql.includes('SELECT COUNT(*) count FROM actors')) return { count: 2 };
    if (statement.sql.includes('SELECT id FROM actors')
      || statement.sql.includes('SELECT id FROM records')
      || statement.sql.includes('SELECT id FROM work_objects')
      || statement.sql.includes('SELECT id FROM agent_runs')) return { id: statement.args[1] };
    return null;
  }

  all(statement: FakeStatement): unknown[] {
    if (statement.sql.includes('FROM capability_overrides')) return [];
    return [];
  }

  async batch(statements: D1PreparedStatement[]) {
    const pending = statements as unknown as FakeStatement[];
    const receipt = pending.find((statement) => statement.sql.includes('INSERT INTO idempotency_records'));
    if (!receipt) throw new Error('kernel mutation omitted its atomic idempotency receipt');
    const key = this.receiptKey(receipt);
    if (this.receipts.has(key)) throw new Error('UNIQUE constraint failed: idempotency_records');

    for (const statement of pending) {
      const table = [
        ['INSERT INTO actors ', 'actors'],
        ['INSERT INTO party_relationships ', 'party_relationships'],
        ['INSERT INTO work_objects ', 'work_objects'],
        ['INSERT INTO timeline_activities ', 'timeline_activities'],
      ].find(([prefix]) => statement.sql.includes(prefix))?.[1];
      if (!table) continue;
      const ids = this.inserts.get(table) ?? [];
      ids.push(String(statement.args[0]));
      this.inserts.set(table, ids);
    }

    this.receipts.set(key, { request_hash: String(receipt.args[3]), response_json: String(receipt.args[4]) });
    return pending.map(() => ({ success: true, meta: {}, results: [] }));
  }
}

const identity: RequestIdentity = {
  userId: 'owner-a',
  email: 'owner@example.test',
  displayName: 'Owner',
  requestId: 'request-a',
  runtimeMode: 'device',
};

function workspace(id = 'workspace-a'): WorkspaceContext {
  return {
    workspaceId: id,
    workspace: {
      id,
      name: 'A',
      ownerEmail: identity.email,
      ownerName: identity.displayName,
      role: 'owner',
      profile: 'business',
      timezone: 'UTC',
      currency: 'USD',
      locale: 'en-US',
      settings: {},
      createdAt: '',
      updatedAt: '',
    },
  };
}

function d1(db: KernelMemoryD1) {
  return db as unknown as D1Database;
}

describe('CRM kernel create idempotency', () => {
  it('requires a caller idempotency key before a valid create can touch storage', async () => {
    await expect(createActor({} as D1Database, identity, workspace(), { kind: 'human', displayName: 'Ada' })).rejects.toMatchObject({
      status: 400,
      code: 'idempotency_key_required',
    });
  });

  it('atomically receipts and replays all four create operations without duplicate rows', async () => {
    const db = new KernelMemoryD1();
    const cases = [
      {
        table: 'actors',
        body: { operation: 'actor.create', kind: 'human', displayName: 'Ada' },
        run: (key: string) => createActor(d1(db), identity, workspace(), { kind: 'human', displayName: 'Ada' }, { key, requestBody: JSON.stringify({ operation: 'actor.create', kind: 'human', displayName: 'Ada' }) }),
      },
      {
        table: 'party_relationships',
        body: { operation: 'relationship.create', sourceActorId: 'actor-a', targetActorId: 'actor-b', relationshipType: 'advisor' },
        run: (key: string) => createRelationship(d1(db), identity, workspace(), { sourceActorId: 'actor-a', targetActorId: 'actor-b', relationshipType: 'advisor' }, { key, requestBody: JSON.stringify({ operation: 'relationship.create', sourceActorId: 'actor-a', targetActorId: 'actor-b', relationshipType: 'advisor' }) }),
      },
      {
        table: 'work_objects',
        body: { operation: 'work.create', kind: 'work_item', title: 'Follow up' },
        run: (key: string) => createWorkObject(d1(db), identity, workspace(), { kind: 'work_item', title: 'Follow up' }, { key, requestBody: JSON.stringify({ operation: 'work.create', kind: 'work_item', title: 'Follow up' }) }),
      },
      {
        table: 'timeline_activities',
        body: { operation: 'activity.create', subjectType: 'actor', subjectId: 'actor-a', activityType: 'note', summary: 'Called' },
        run: (key: string) => createTimelineActivity(d1(db), identity, workspace(), { subjectType: 'actor', subjectId: 'actor-a', activityType: 'note', summary: 'Called' }, { key, requestBody: JSON.stringify({ operation: 'activity.create', subjectType: 'actor', subjectId: 'actor-a', activityType: 'note', summary: 'Called' }) }),
      },
    ] as const;

    for (const [index, testCase] of cases.entries()) {
      const key = `stable-key-${index}`;
      const first = await testCase.run(key);
      const replay = await testCase.run(key);
      expect(first.replayed).toBe(false);
      expect(replay).toEqual({ data: first.data, replayed: true });
      expect(db.inserts.get(testCase.table)).toEqual([first.data.id]);
      expect(testCase.body.operation).toBeTypeOf('string');
    }
    expect(db.receipts.size).toBe(4);
  });

  it('uses the receipt uniqueness fence to collapse concurrent retries', async () => {
    const db = new KernelMemoryD1();
    const input = { kind: 'organization', displayName: 'Northstar' };
    const idempotency = { key: 'concurrent-key', requestBody: JSON.stringify({ operation: 'actor.create', ...input }) };

    const [one, two] = await Promise.all([
      createActor(d1(db), identity, workspace(), input, idempotency),
      createActor(d1(db), identity, workspace(), input, idempotency),
    ]);

    expect(one.data.id).toBe(two.data.id);
    expect([one.replayed, two.replayed].sort()).toEqual([false, true]);
    expect(db.inserts.get('actors')).toHaveLength(1);
  });

  it('rejects key reuse with a different request and scopes receipts by tenant', async () => {
    const db = new KernelMemoryD1();
    const key = 'tenant-stable-key';
    const firstBody = JSON.stringify({ operation: 'actor.create', kind: 'human', displayName: 'Ada' });
    const otherBody = JSON.stringify({ operation: 'actor.create', kind: 'human', displayName: 'Grace' });
    const first = await createActor(d1(db), identity, workspace('workspace-a'), { kind: 'human', displayName: 'Ada' }, { key, requestBody: firstBody });

    await expect(createActor(d1(db), identity, workspace('workspace-a'), { kind: 'human', displayName: 'Grace' }, { key, requestBody: otherBody })).rejects.toMatchObject({
      status: 409,
      code: 'idempotency_conflict',
    });

    const otherTenant = await createActor(d1(db), identity, workspace('workspace-b'), { kind: 'human', displayName: 'Ada' }, { key, requestBody: firstBody });
    expect(otherTenant.data.id).not.toBe(first.data.id);
    expect(db.inserts.get('actors')).toHaveLength(2);
  });
});
