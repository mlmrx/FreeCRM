import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditPage } from '@/lib/audit-types';

const { getD1, getRequestIdentity, ensureWorkspace, readAuditPage, recordAuditExport } = vi.hoisted(() => ({ getD1: vi.fn(), getRequestIdentity: vi.fn(), ensureWorkspace: vi.fn(), readAuditPage: vi.fn(), recordAuditExport: vi.fn() }));
vi.mock('@/db', () => ({ getD1 }));
vi.mock('@/server/control-plane', () => ({ ensureWorkspace }));
vi.mock('@/server/audit', () => ({ readAuditPage, recordAuditExport }));
vi.mock('@/server/request-context', async (original) => ({ ...await original<typeof import('@/server/request-context')>(), getRequestIdentity }));
import { ApiError } from '@/server/request-context';
import { GET } from '@/app/api/v1/audit/route';

const page: AuditPage = { events: [{ id: 'event-a', createdAt: '2026-09-01T00:00:00.000Z', actor: 'owner-a', action: 'record.update', family: 'record', outcome: 'unknown', entityType: 'contact', entityId: 'record-a', requestId: 'request-a' }], filters: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-02T00:00:00.000Z', actor: '', family: '', outcome: '', record: '' }, nextCursor: 'synthetic-cursor', scanned: 50, scanLimit: 500, pageSize: 50, partial: false, warnings: [], canExport: true };
const identity = { userId: 'owner-a', requestId: 'request-a' };
const context = { workspaceId: 'workspace-a', workspace: { role: 'owner' } };
beforeEach(() => { vi.clearAllMocks(); getD1.mockReturnValue({}); getRequestIdentity.mockResolvedValue(identity); ensureWorkspace.mockResolvedValue(context); readAuditPage.mockResolvedValue(page); recordAuditExport.mockResolvedValue(undefined); });

describe('audit GET API', () => {
  it('returns an authenticated no-store page without export writes', async () => {
    const result = await GET(new Request('https://example.test/api/v1/audit?actor=owner-a'));
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(result.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await result.json()).toEqual({ data: page });
    expect(ensureWorkspace).toHaveBeenCalledWith({}, identity);
    expect(readAuditPage).toHaveBeenCalledWith({}, context, new URLSearchParams({ actor: 'owner-a' }));
    expect(recordAuditExport).not.toHaveBeenCalled();
  });
  it('returns only the safe current-page CSV with explicit completeness headers and an export receipt', async () => {
    const result = await GET(new Request('https://example.test/api/v1/audit?format=csv'));
    expect(result.status).toBe(200);
    expect(result.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(result.headers.get('content-disposition')).toContain('free-crm-audit-page.csv');
    expect(result.headers.get('x-free-crm-audit-scope')).toBe('current-page; not-complete-history');
    expect(result.headers.get('x-free-crm-audit-next-cursor')).toBe(page.nextCursor);
    expect(result.headers.get('x-free-crm-audit-returned')).toBe('1');
    expect(await result.text()).toContain('"owner-a","record.update","record","unknown"');
    expect(recordAuditExport).toHaveBeenCalledWith({}, context, identity, page);
  });
  it('refuses unauthenticated access before workspace resolution', async () => {
    getRequestIdentity.mockRejectedValue(new ApiError(401, 'authentication_required', 'Sign in.'));
    expect((await GET(new Request('https://example.test/api/v1/audit'))).status).toBe(401);
    expect(getD1).not.toHaveBeenCalled(); expect(readAuditPage).not.toHaveBeenCalled();
  });
  it('returns permission failure without exporting or exposing events', async () => {
    readAuditPage.mockRejectedValue(new ApiError(403, 'forbidden', 'Permission audit:read is required.'));
    const result = await GET(new Request('https://example.test/api/v1/audit?format=csv'));
    expect(result.status).toBe(403); expect(await result.text()).not.toContain('event-a'); expect(recordAuditExport).not.toHaveBeenCalled();
  });
  it('does not release a CSV when its audit receipt cannot be recorded', async () => {
    recordAuditExport.mockRejectedValue(new ApiError(503, 'audit_export_unavailable', 'Export unavailable.'));
    const result = await GET(new Request('https://example.test/api/v1/audit?format=csv'));
    expect(result.status).toBe(503); expect(result.headers.get('content-type')).toContain('application/json'); expect(await result.text()).not.toContain('event-a');
  });
});
