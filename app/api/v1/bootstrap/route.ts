import { getD1 } from '@/db';
import type { CRMSnapshot } from '@/lib/crm-platform';
import { ensureWorkspace, loadControlPlane } from '@/server/control-plane';
import { loadDataPlane } from '@/server/data-plane';
import { apiResponse, errorResponse, getRequestIdentity } from '@/server/request-context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const identity = getRequestIdentity(request);
    const db = getD1();
    const context = await ensureWorkspace(db, identity);
    const [data, control] = await Promise.all([
      loadDataPlane(db, context.workspaceId),
      loadControlPlane(db, context.workspaceId),
    ]);
    const snapshot: CRMSnapshot = {
      workspace: context.workspace,
      ...data,
      ...control,
      generatedAt: new Date().toISOString(),
      demo: Boolean(context.workspace.settings.demo),
    };
    return apiResponse({ data: snapshot });
  } catch (error) {
    return errorResponse(error);
  }
}
