import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureWorkspace, executeCommand, getD1, getRequestIdentity, requireCapability } = vi.hoisted(() => ({
  ensureWorkspace: vi.fn(),
  executeCommand: vi.fn(),
  getD1: vi.fn(),
  getRequestIdentity: vi.fn(),
  requireCapability: vi.fn(),
}));

vi.mock('@/db', () => ({ getD1 }));
vi.mock('@/server/capabilities', () => ({ requireCapability }));
vi.mock('@/server/commands', () => ({ executeCommand }));
vi.mock('@/server/control-plane', () => ({ ensureWorkspace }));
vi.mock('@/server/request-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/request-context')>();
  return { ...actual, getRequestIdentity };
});

import { POST } from '@/app/api/v1/imports/csv/route';

const context = {
  workspaceId: 'workspace-a',
  workspace: { role: 'owner', profile: 'personal', currency: 'USD' },
};

function request(body: Record<string, unknown>, key?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (key) headers['idempotency-key'] = key;
  return new Request('https://freecrm.dev/api/v1/imports/csv', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('CSV import API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestIdentity.mockResolvedValue({ userId: 'owner-a', email: 'owner@example.test', requestId: 'request-a' });
    getD1.mockReturnValue({});
    ensureWorkspace.mockResolvedValue(context);
    requireCapability.mockResolvedValue({ enabled: true });
    executeCommand.mockResolvedValue({ ok: true, result: { imported: 1, recordIds: ['record-a'] } });
  });

  it('returns a no-store preview without mutating the database', async () => {
    const response = await POST(request({ mode: 'preview', objectType: 'contact', csv: 'name,email\nAda,ada@example.com' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      data: {
        mode: 'preview',
        objectType: 'contact',
        totalRows: 1,
        validRows: 1,
        invalidRows: 0,
        preview: [{ row: 2, name: 'Ada', email: 'ada@example.com' }],
      },
    });
    expect(requireCapability).toHaveBeenNthCalledWith(1, {}, context, 'integrations');
    expect(requireCapability).toHaveBeenNthCalledWith(2, {}, context, 'relationships');
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('requires an idempotency key before opening the tenant database for a commit', async () => {
    const response = await POST(request({ mode: 'commit', objectType: 'contact', csv: 'name,email\nAda,ada@example.com' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'idempotency_key_required' } });
    expect(getRequestIdentity).not.toHaveBeenCalled();
    expect(getD1).not.toHaveBeenCalled();
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('commits only a fully valid preview through the atomic command service', async () => {
    const body = { mode: 'commit', objectType: 'lead', csv: 'name,email\nAda,ada@example.com' };
    const response = await POST(request(body, 'csv-import-key'));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: { mode: 'commit', objectType: 'lead', totalRows: 1, imported: 1, recordIds: ['record-a'] },
      replayed: false,
    });
    expect(executeCommand).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ userId: 'owner-a' }),
      context,
      { type: 'csv.import', payload: { records: [expect.objectContaining({ objectType: 'lead', name: 'Ada', email: 'ada@example.com' })] } },
      'csv-import-key',
      JSON.stringify(body),
    );
  });

  it('refuses partial commits and reports the exact failing CSV row', async () => {
    const response = await POST(request({ mode: 'commit', objectType: 'contact', csv: 'name,email\nAda,bad-email' }, 'csv-import-key'));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'csv_rows_invalid', details: { invalidRows: 1, errors: [{ row: 2, field: 'email' }] } },
    });
    expect(executeCommand).not.toHaveBeenCalled();
  });
});
