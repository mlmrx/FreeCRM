import { getD1 } from '@/db';
import { asCsv } from '@/lib/crm-platform';
import { ensureWorkspace, loadControlPlane } from '@/server/control-plane';
import { loadDataPlane } from '@/server/data-plane';
import { errorResponse, getRequestIdentity } from '@/server/request-context';
import { requirePermission } from '@/server/authorization';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const context = await ensureWorkspace(db, identity);
    requirePermission(context.workspace.role, 'data:export');
    const [data, control, counts] = await Promise.all([
      loadDataPlane(db, context.workspaceId),
      loadControlPlane(db, context.workspaceId),
      db.prepare(`SELECT
        (SELECT COUNT(*) FROM records WHERE workspace_id=?) AS records_count,
        (SELECT COUNT(*) FROM record_links WHERE workspace_id=?) AS links_count,
        (SELECT COUNT(*) FROM notes WHERE workspace_id=?) AS notes_count,
        (SELECT COUNT(*) FROM invoice_payments WHERE workspace_id=?) AS payments_count,
        (SELECT COUNT(*) FROM audit_events WHERE workspace_id=?) AS audit_count
      `).bind(context.workspaceId, context.workspaceId, context.workspaceId, context.workspaceId, context.workspaceId).first<{ records_count: number; links_count: number; notes_count: number; payments_count: number; audit_count: number }>(),
    ]);
    const date = new Date().toISOString().slice(0, 10);
    if (new URL(request.url).searchParams.get('format') === 'csv') {
      return new Response(asCsv(data.records), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="free-crm-records-${date}.csv"`,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    }
    const body = JSON.stringify({
      format: 'free-crm-portable-snapshot',
      version: 2,
      exportedAt: new Date().toISOString(),
      scope: {
        recoveryBackup: false,
        includes: ['workspace settings', 'CRM records', 'record links', 'notes', 'invoice payment receipts', 'module settings', 'sanitized integration metadata', 'workflow rules', 'recent audit events'],
        excludes: ['R2 document bytes', 'provider backups', 'connector credentials and delivery state', 'idempotency and outbox state', 'workflow run history', 'agent identities, authorizations, traces, approvals, and receipts'],
        completeness: {
          records: { returned: data.records.length, total: counts?.records_count ?? data.records.length },
          links: { returned: data.links.length, total: counts?.links_count ?? data.links.length },
          notes: { returned: data.notes.length, total: counts?.notes_count ?? data.notes.length },
          invoicePayments: { returned: data.invoicePayments.length, total: counts?.payments_count ?? data.invoicePayments.length },
          audit: { returned: control.audit.length, total: counts?.audit_count ?? control.audit.length },
        },
      },
      workspace: context.workspace,
      records: data.records,
      links: data.links,
      notes: data.notes,
      invoicePayments: data.invoicePayments,
      modules: control.modules,
      integrations: control.integrations.map((integration) => ({ ...integration, config: { ...integration.config, webhookUrl: undefined } })),
      workflows: control.workflows,
      audit: control.audit,
    }, null, 2);
    return new Response(body, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="free-crm-snapshot-${date}.json"`,
        'x-free-crm-export-scope': 'portable-crm-metadata; not-a-recovery-backup',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
