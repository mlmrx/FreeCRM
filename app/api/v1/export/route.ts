import { getD1 } from '@/db';
import { asCsv } from '@/lib/crm-platform';
import { ensureWorkspace, loadControlPlane } from '@/server/control-plane';
import { loadDataPlane } from '@/server/data-plane';
import { errorResponse, getRequestIdentity } from '@/server/request-context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const identity = getRequestIdentity(request);
    const db = getD1();
    const context = await ensureWorkspace(db, identity);
    const [data, control] = await Promise.all([loadDataPlane(db, context.workspaceId), loadControlPlane(db, context.workspaceId)]);
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
      format: 'free-crm-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      workspace: context.workspace,
      records: data.records,
      links: data.links,
      notes: data.notes,
      modules: control.modules,
      integrations: control.integrations.map((integration) => ({ ...integration, config: { ...integration.config, webhookUrl: undefined } })),
      workflows: control.workflows,
      audit: control.audit,
    }, null, 2);
    return new Response(body, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="free-crm-backup-${date}.json"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
