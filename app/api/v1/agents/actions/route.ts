import { getD1 } from '@/db';
import { createAgent, decideApproval, executeAuthorizedRun, proposeAgentAction, setAgentSafety } from '@/server/agent-plane';
import { requirePermission } from '@/server/authorization';
import { requireCapability } from '@/server/capabilities';
import { ensureWorkspace, loadControlPlane } from '@/server/control-plane';
import { ApiError, apiResponse, errorResponse, getRequestIdentity, readJsonObject, requestErrorResponse, requireSafeMutation } from '@/server/request-context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const workspace = await ensureWorkspace(db, identity);
    await requireCapability(db, workspace, 'agentPlane');
    requirePermission(workspace.workspace.role, 'agents:manage');
    const state = await loadControlPlane(db, workspace.workspaceId, workspace.workspace.profile);
    return apiResponse({ data: { agents: state.agents, runs: state.agentRuns, approvals: state.approvals, receipts: state.executionReceipts } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireSafeMutation(request, 'application/json');
    const body = await readJsonObject(request, 32_000);
    if (typeof body.operation !== 'string') throw new ApiError(400, 'validation_error', 'An agent operation is required.');
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const workspace = await ensureWorkspace(db, identity);
    await requireCapability(db, workspace, 'agentPlane');

    let data: unknown;
    let status = 200;
    if (body.operation === 'agent.create') {
      data = await createAgent(db, identity, workspace, body as never);
      status = 201;
    } else if (body.operation === 'agent.safety') {
      data = await setAgentSafety(db, identity, workspace, body as never);
    } else if (body.operation === 'action.propose') {
      data = await proposeAgentAction(db, identity, workspace, body as never);
      status = 201;
    } else if (body.operation === 'approval.decide') {
      data = await decideApproval(db, identity, workspace, body as never);
    } else if (body.operation === 'run.execute') {
      data = await executeAuthorizedRun(db, identity, workspace, body.runId);
    } else {
      throw new ApiError(400, 'unsupported_operation', 'Unsupported agent operation.');
    }
    return apiResponse({ data }, { status });
  } catch (error) {
    return requestErrorResponse(request, error);
  }
}
