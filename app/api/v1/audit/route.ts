import { getD1 } from '@/db';
import { auditCsv } from '@/lib/audit-types';
import { readAuditPage, recordAuditExport } from '@/server/audit';
import { ensureWorkspace } from '@/server/control-plane';
import { errorResponse, getRequestIdentity } from '@/server/request-context';
import { largeJsonResponse, largeTextResponse } from '@/server/runtime-response';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const context = await ensureWorkspace(db, identity);
    const params = new URL(request.url).searchParams;
    const page = await readAuditPage(db, context, params);
    if (params.get('format') === 'csv') {
      const csv = auditCsv(page.events);
      await recordAuditExport(db, context, identity, page);
      return largeTextResponse(csv, { headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="free-crm-audit-page.csv"',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-free-crm-audit-scope': 'current-page; not-complete-history',
      'x-free-crm-audit-returned': String(page.events.length),
      'x-free-crm-audit-scanned': String(page.scanned),
      'x-free-crm-audit-partial': String(page.partial),
      'x-free-crm-audit-next-cursor': page.nextCursor ?? '',
      } });
    }
    return largeJsonResponse({ data: page });
  } catch (error) { return errorResponse(error); }
}
