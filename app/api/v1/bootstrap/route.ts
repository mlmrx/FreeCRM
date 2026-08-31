import { getD1 } from '@/db';
import type { CRMSnapshot } from '@/lib/crm-platform';
import { ensureWorkspace, loadControlPlane } from '@/server/control-plane';
import { loadDataPlane } from '@/server/data-plane';
import { ApiError, apiResponse, errorResponse, getRequestIdentity } from '@/server/request-context';
import { hasPermission, requirePermission } from '@/server/authorization';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const context = await ensureWorkspace(db, identity);
    requirePermission(context.workspace.role, 'records:read');
    const resetOperationId = new URL(request.url).searchParams.get('resetOperationId');
    if (resetOperationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resetOperationId)) {
      throw new ApiError(400, 'validation_error', 'resetOperationId must be a UUID.', { field: 'resetOperationId' });
    }
    const [data, control] = await Promise.all([
      loadDataPlane(db, context.workspaceId),
      loadControlPlane(db, context.workspaceId, context.workspace.profile, resetOperationId),
    ]);
    const governance = hasPermission(context.workspace.role, 'agents:manage') || hasPermission(context.workspace.role, 'agents:approve');
    const workflowManagement = hasPermission(context.workspace.role, 'workflows:manage');
    const connectorManagement = hasPermission(context.workspace.role, 'connectors:manage');
    const runtime = identity.runtimeMode === 'device'
      ? { mode: 'device' as const, label: 'Device workspace', detail: 'Local D1 + R2 · loopback only' }
      : identity.runtimeMode === 'sites'
        ? { mode: 'sites' as const, label: 'Private Sites workspace', detail: 'D1 + R2 · signed-in access' }
        : { mode: 'cloudflare-access' as const, label: 'Private Cloudflare workspace', detail: 'D1 + R2 · Access protected' };
    const snapshot: CRMSnapshot = {
      workspace: context.workspace,
      runtime,
      ...data,
      ...control,
      audit: hasPermission(context.workspace.role, 'audit:read') ? control.audit : [],
      integrationJobs: connectorManagement ? control.integrationJobs : [],
      connectorConnections: connectorManagement ? control.connectorConnections : [],
      workflows: workflowManagement ? control.workflows : [],
      workflowRuns: workflowManagement ? control.workflowRuns : [],
      agents: governance ? control.agents : [],
      agentRuns: governance ? control.agentRuns : [],
      approvals: governance ? control.approvals : [],
      executionReceipts: governance ? control.executionReceipts : [],
      generatedAt: new Date().toISOString(),
      demo: Boolean(context.workspace.settings.demo),
    };
    return apiResponse({ data: snapshot });
  } catch (error) {
    return errorResponse(error);
  }
}
