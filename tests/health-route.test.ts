import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getD1, getFiles, getRequestIdentity, requireActivatedRuntime } = vi.hoisted(() => ({
  getD1: vi.fn(),
  getFiles: vi.fn(),
  getRequestIdentity: vi.fn(),
  requireActivatedRuntime: vi.fn(),
}));

vi.mock('@/db', () => ({ getD1, getFiles }));
vi.mock('@/server/request-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/request-context')>();
  return { ...actual, getRequestIdentity, requireActivatedRuntime };
});

import { GET } from '@/app/api/v1/health/route';
import { ApiError } from '@/server/request-context';
import { EXPECTED_D1_MIGRATIONS } from '@/server/schema-readiness';

type LedgerRow = { id: number; name: string };

function readyProviders(events: string[], rows: LedgerRow[] = [...EXPECTED_D1_MIGRATIONS]) {
  const schemaAll = vi.fn(async () => {
    events.push('schema:all');
    return { success: true, results: rows };
  });
  const prepare = vi.fn((sql: string) => {
    expect(sql).toBe('SELECT id,name FROM d1_migrations ORDER BY id');
    events.push('database:schema');
    return { all: schemaAll };
  });
  const head = vi.fn(async () => {
    events.push('files:head');
    return null;
  });
  getD1.mockImplementation(() => {
    events.push('database:get');
    return { prepare };
  });
  getFiles.mockImplementation(() => {
    events.push('files:get');
    return { head };
  });
  return { prepare, schemaAll, head };
}

describe('authenticated readiness route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireActivatedRuntime.mockResolvedValue(undefined);
    getRequestIdentity.mockResolvedValue({ userId: 'owner' });
  });

  it.each([
    [401, 'authentication_required'],
    [403, 'access_denied'],
  ])('rejects identity status %i before touching paid provider operations', async (status, code) => {
    getRequestIdentity.mockRejectedValue(new ApiError(status, code, 'Denied.'));

    const response = await GET(new Request('https://freecrm.dev/api/v1/health'));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
    expect(getD1).not.toHaveBeenCalled();
    expect(getFiles).not.toHaveBeenCalled();
  });

  it('checks identity and the exact migration ledger before other provider readiness calls', async () => {
    const events: string[] = [];
    requireActivatedRuntime.mockImplementation(async () => { events.push('runtime'); });
    getRequestIdentity.mockImplementation(async () => { events.push('identity'); return { userId: 'owner' }; });
    readyProviders(events);

    const response = await GET(new Request('https://freecrm.dev/api/v1/health'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ready',
      database: 'connected',
      schema: 'current',
      migrationCount: EXPECTED_D1_MIGRATIONS.length,
      latestMigration: EXPECTED_D1_MIGRATIONS.at(-1)?.name,
      objectStorage: 'connected',
    });
    expect(events).toEqual([
      'runtime',
      'identity',
      'database:get',
      'database:schema',
      'schema:all',
      'files:get',
      'files:head',
    ]);
  });

  it('returns a stable 503 and does not touch object storage for a partially migrated database', async () => {
    const events: string[] = [];
    readyProviders(events, EXPECTED_D1_MIGRATIONS.slice(0, -1));

    const response = await GET(new Request('https://freecrm.dev/api/v1/health'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'database_schema_not_ready',
        message: 'The database schema is not ready. Apply the checked-in D1 migrations before serving traffic.',
        details: null,
      },
    });
    expect(getFiles).not.toHaveBeenCalled();
    expect(events).toEqual(['database:get', 'database:schema', 'schema:all']);
  });

  it('returns the same stable 503 when an empty database has no migration ledger', async () => {
    const events: string[] = [];
    const providers = readyProviders(events);
    providers.schemaAll.mockRejectedValueOnce(new Error('no such table: d1_migrations'));

    const response = await GET(new Request('https://freecrm.dev/api/v1/health'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'database_schema_not_ready' } });
    expect(getFiles).not.toHaveBeenCalled();
    expect(events).toEqual(['database:get', 'database:schema']);
  });

  it('rejects a non-canonical migration ledger even when every expected name appears', async () => {
    const events: string[] = [];
    const reordered = [...EXPECTED_D1_MIGRATIONS];
    [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
    readyProviders(events, reordered);

    const response = await GET(new Request('https://freecrm.dev/api/v1/health'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'database_schema_not_ready' } });
    expect(getFiles).not.toHaveBeenCalled();
  });
});
