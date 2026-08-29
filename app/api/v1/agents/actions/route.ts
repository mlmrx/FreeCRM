import { getD1 } from '@/db';
import { autonomyLevels } from '@/lib/multi-edition';
import { proposeAgentAction, type ProposedAgentAction } from '@/server/agent-plane';
import { ensureWorkspace } from '@/server/control-plane';
import { apiResponse, errorResponse, getRequestIdentity, ApiError } from '@/server/request-context';

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<ProposedAgentAction>;
    if (!body || typeof body !== 'object' || !autonomyLevels.includes(body.autonomy as never) || !Array.isArray(body.allowedScopes)) throw new ApiError(400, 'validation_error', 'A valid agent action is required.');
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const workspace = await ensureWorkspace(db, identity);
    const result = await proposeAgentAction(db, identity, workspace, body as ProposedAgentAction);
    return apiResponse({ data: result }, { status: result.replayed ? 200 : 201 });
  } catch (error) { return errorResponse(error); }
}
