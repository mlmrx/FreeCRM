import { getD1 } from '@/db';
import { createAgent, decideApproval, executeAuthorizedRun, proposeAgentAction, setAgentSafety } from '@/server/agent-plane';
import { ensureWorkspace, loadControlPlane } from '@/server/control-plane';
import { requireCapability } from '@/server/capabilities';
import { apiResponse, errorResponse, getRequestIdentity, ApiError, readJsonObject } from '@/server/request-context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const workspace = await ensureWorkspace(db, identity);
    await requireCapability(db, workspace, 'agentPlane');
    const state = await loadControlPlane(db, workspace.workspaceId, workspace.workspace.profile);
    return apiResponse({ data: { agents: state.agents, runs: state.agentRuns, approvals: state.approvals, receipts: state.executionReceipts } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    if (!body || typeof body !== 'object' || typeof body.operation !== 'string') throw new ApiError(400, 'validation_error', 'An agent operation is required.');
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const workspace = await ensureWorkspace(db, identity);
    await requireCapability(db, workspace, 'agentPlane');
    let result: unknown;
    if (body.operation === 'agent.create') result = await createAgent(db, identity, workspace, body as never);
    else if (body.operation === 'agent.safety') result = await setAgentSafety(db, identity, workspace, body as never);
    else if (body.operation === 'action.propose') result = await proposeAgentAction(db, identity, workspace, body as never);
    else if (body.operation === 'approval.decide') result = await decideApproval(db, identity, workspace, body as never);
    else if (body.operation === 'run.execute') {
      if (typeof body.runId !== 'string') throw new ApiError(400, 'validation_error', 'runId is required.');
      result = await executeAuthorizedRun(db, identity, workspace, body.runId);
    } else throw new ApiError(400, 'unsupported_operation', 'Unsupported agent operation.');
    return apiResponse({ data: result }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
