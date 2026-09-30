import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AuditViewer, { AuditResults } from '@/app/audit-viewer';
import { auditDateQuery, createAuditClient } from '@/lib/audit-client';
import type { AuditPage } from '@/lib/audit-types';

const page: AuditPage = { events: [], filters: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-02T00:00:00.000Z', actor: '', family: '', outcome: '', record: '' }, nextCursor: null, scanned: 0, scanLimit: 500, pageSize: 50, partial: false, warnings: [], canExport: true };
const response = (value: unknown) => new Response(JSON.stringify({ data: value }), { headers: { 'content-type': 'application/json' } });
describe('audit viewer states and accessibility', () => {
  it('renders labeled filters, explicit limits, and a private loading state on the server', () => {
    const html = renderToStaticMarkup(createElement(AuditViewer));
    for (const text of ['From date (UTC)', 'Through date (UTC)', 'Actor ID', 'Action family', 'Outcome', 'Affected record ID', 'Apply filters', 'Reset filters', 'Loading audit history', '500 candidates', 'CSV exports one page', 'refreshing its applied search', 'Newer events may change the rows.']) expect(html).toContain(text);
    expect(html).toContain('aria-busy="true"'); expect(html).toContain('role="status"');
    expect(html).not.toContain('localStorage');
  });
  it('distinguishes final emptiness, bounded-scan emptiness, and partial failure', () => {
    expect(renderToStaticMarkup(createElement(AuditResults, { page }))).toContain('No matching audit events in this date range.');
    const continuation = renderToStaticMarkup(createElement(AuditResults, { page: { ...page, scanned: 500, nextCursor: 'next' } }));
    expect(continuation).toContain('No matches in this part of history'); expect(continuation).toContain('More history remains');
    const partial = renderToStaticMarkup(createElement(AuditResults, { page: { ...page, partial: true, warnings: ['Synthetic incomplete row.'] } }));
    expect(partial).toContain('role="alert"'); expect(partial).toContain('Partial results');
  });
  it('renders technical IDs as escaped text in an accessible horizontal table', () => {
    const html = renderToStaticMarkup(createElement(AuditResults, { page: { ...page, events: [{ id: 'event-a', createdAt: page.filters.from, actor: '<script>bad()</script>', action: 'agent.approval.approved', family: 'agent', outcome: 'approved', entityType: 'contact', entityId: 'record-a', requestId: 'request-a' }] } }));
    expect(html).toContain('&lt;script&gt;bad()'); expect(html).not.toContain('<script>');
    expect(html).toContain('scope="col"'); expect(html).toContain('role="region"'); expect(html).toContain('tabindex="0"'); expect(html.toLowerCase()).toContain('datetime=');
  });
  it('keeps 44px targets, small-screen reflow and keyboard focus visible', () => {
    const css = readFileSync(new URL('../app/audit-viewer.module.css', import.meta.url), 'utf8');
    expect(css).toContain('min-height: 44px'); expect(css).toContain('focus-visible'); expect(css).toContain('@media (max-width: 520px)'); expect(css).toContain('overflow-x: auto');
    expect(css).toContain('max-height: min(65vh, 640px)'); expect(css).toContain('overflow-y: auto'); expect(css).toContain('position: sticky');
  });
});
describe('audit request client', () => {
  it('constructs inclusive UI dates as exclusive UTC API bounds without leaking extra form keys', () => {
    const fields = { actor: 'owner-a', family: '', outcome: '', record: '', from: 'must-not-override', through: 'not-a-query-key' };
    const query = new URLSearchParams(auditDateQuery('2026-09-01', '2026-09-01', fields));
    expect(query.get('from')).toBe('2026-09-01T00:00:00.000Z'); expect(query.get('to')).toBe('2026-09-02T00:00:00.000Z'); expect(query.has('through')).toBe(false);
    expect(() => auditDateQuery('2026-02-31', '2026-03-03', fields)).toThrow('calendar');
    expect(() => auditDateQuery('2025-01-01', '2026-09-01', fields)).toThrow('366');
  });
  it('retries an identical cursor after a transport error and uses no-store same-origin GET', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(response(page));
    const client = createAuditClient(fetcher);
    await expect(client.get('cursor=exact-cursor')).rejects.toThrow('offline');
    expect(await client.get('cursor=exact-cursor')).toEqual(page);
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual(['/api/v1/audit?cursor=exact-cursor', '/api/v1/audit?cursor=exact-cursor']);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'same-origin' });
  });
  it('reports safe denial without rendering sensitive server error payloads', async () => {
    const client = createAuditClient(vi.fn<typeof fetch>().mockResolvedValue(new Response('private provider diagnostic', { status: 403 })));
    await expect(client.get('')).rejects.toThrow('Ask a workspace owner');
    await expect(client.get('')).rejects.not.toThrow('private provider');
  });
  it('rejects incomplete and over-capacity pages', async () => {
    for (const value of [{}, { ...page, scanned: 501 }, { ...page, events: Array.from({ length: 51 }, () => ({})) }, { ...page, filters: { ...page.filters, from: 'invalid date' } }, { ...page, warnings: [{}] }]) await expect(createAuditClient(vi.fn<typeof fetch>().mockResolvedValue(response(value))).get('')).rejects.toThrow('incomplete');
  });
  it('preserves filters/cursor for CSV and rejects a disguised or unbounded response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('event_id\r\n', { headers: { 'content-type': 'text/csv', 'x-free-crm-audit-scope': 'current-page; not-complete-history', 'x-free-crm-audit-partial': 'true' } })).mockResolvedValueOnce(new Response('<html>sign in</html>', { headers: { 'content-type': 'text/html' } }));
    const client = createAuditClient(fetcher);
    expect((await client.csv('cursor=exact-cursor&actor=owner-a')).partial).toBe(true);
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/audit?cursor=exact-cursor&actor=owner-a&format=csv');
    await expect(client.csv('')).rejects.toThrow('bounded audit CSV');
  });
});
