import { describe, expect, it } from 'vitest';

import { ensureWorkspace } from '@/server/control-plane';
import type { RequestIdentity } from '@/server/request-context';

type CapturedStatement = {
  sql: string;
  params: unknown[];
};

type WorkspaceRow = {
  id: string;
  owner_email: string;
  owner_name: string;
  name: string;
  profile: 'personal';
  timezone: string;
  currency: string;
  locale: string;
  settings_json: string;
  created_at: string;
  updated_at: string;
  role: 'owner';
};

function initialWorkspaceDatabase(existing?: WorkspaceRow, existingUserId = 'owner-subject-123') {
  const workspaces = new Map<string, WorkspaceRow>(existing ? [[existing.id, existing]] : []);
  const memberships = new Map<string, string[]>(existing ? [[existingUserId, [existing.id]]] : []);
  let ownerReads = 0;
  let releaseInitialReads: (() => void) | undefined;
  const initialReadsReady = new Promise<void>((resolve) => { releaseInitialReads = resolve; });
  let batchAttempts = 0;

  const database = {
    prepare(sql: string) {
      const statement: CapturedStatement = { sql, params: [] };
      return {
        ...statement,
        bind(...params: unknown[]) {
          const bound = { sql, params };
          return {
            ...bound,
            async first<T>() {
              if (!sql.includes('FROM memberships m')) return null;
              const userId = String(params[0]);
              const workspaceId = typeof params[1] === 'string' ? params[1] : undefined;
              if (!existing && !workspaceId && ownerReads < 2) {
                ownerReads += 1;
                if (ownerReads === 2) releaseInitialReads?.();
                await initialReadsReady;
                return null;
              }
              const memberWorkspaceIds = memberships.get(userId) ?? [];
              const resolvedId = workspaceId && memberWorkspaceIds.includes(workspaceId) ? workspaceId : memberWorkspaceIds[0];
              const row = resolvedId ? workspaces.get(resolvedId) : undefined;
              return (row ?? null) as T | null;
            },
          };
        },
      };
    },
    async batch(statements: CapturedStatement[]) {
      batchAttempts += 1;
      const workspaceInsert = statements.find((statement) => statement.sql.includes('INSERT INTO workspaces'));
      const membershipInsert = statements.find((statement) => statement.sql.includes('INSERT INTO memberships'));
      if (!workspaceInsert) throw new Error('Expected the workspace insert in the initialization batch.');
      if (!membershipInsert) throw new Error('Expected the membership insert in the initialization batch.');
      const [id, , ownerEmail, ownerName, name, settingsJson, createdAt, updatedAt] = workspaceInsert.params as string[];
      const [, userId] = membershipInsert.params as string[];
      if (workspaces.has(id)) throw new Error('UNIQUE constraint failed: workspaces.id');
      workspaces.set(id, {
        id,
        owner_email: ownerEmail,
        owner_name: ownerName,
        name,
        profile: 'personal',
        timezone: 'America/Los_Angeles',
        currency: 'USD',
        locale: 'en-US',
        settings_json: settingsJson,
        created_at: createdAt,
        updated_at: updatedAt,
        role: 'owner',
      });
      memberships.set(userId, [...(memberships.get(userId) ?? []), id]);
      return statements.map(() => ({ success: true, results: [], meta: { changes: 1 } }));
    },
  } as unknown as D1Database;

  return { database, workspaces, batchAttempts: () => batchAttempts };
}

const identity: RequestIdentity = {
  userId: 'owner-subject-123',
  email: 'owner@example.test',
  displayName: 'Owner',
  requestId: 'request-1',
  runtimeMode: 'authjs',
};

describe('first workspace initialization', () => {
  it('converges concurrent owner initialization on one opaque workspace ID and recovers the loser', async () => {
    const state = initialWorkspaceDatabase();

    const [first, second] = await Promise.all([
      ensureWorkspace(state.database, identity),
      ensureWorkspace(state.database, { ...identity, requestId: 'request-2' }),
    ]);

    expect(first.workspaceId).toBe(second.workspaceId);
    expect(first.workspaceId).toMatch(/^workspace-[0-9a-f]{64}$/);
    expect(first.workspaceId).not.toContain(identity.userId);
    expect(first.workspaceId).not.toContain(identity.email);
    expect(state.workspaces.size).toBe(1);
    expect(state.batchAttempts()).toBe(2);
  });

  it('returns an existing workspace without deriving or writing a replacement ID', async () => {
    const existing: WorkspaceRow = {
      id: 'legacy-random-workspace-id',
      owner_email: identity.email,
      owner_name: identity.displayName,
      name: 'Existing CRM',
      profile: 'personal',
      timezone: 'UTC',
      currency: 'USD',
      locale: 'en-US',
      settings_json: '{}',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      role: 'owner',
    };
    const state = initialWorkspaceDatabase(existing);

    const result = await ensureWorkspace(state.database, identity);

    expect(result.workspaceId).toBe(existing.id);
    expect(state.workspaces.size).toBe(1);
    expect(state.batchAttempts()).toBe(0);
  });
});
