import { getD1 } from '@/db';
import { createActor, createRelationship, createTimelineActivity, createWorkObject, loadKernel } from '@/server/crm-kernel';
import { ensureWorkspace } from '@/server/control-plane';
import { ApiError, apiResponse, errorResponse, getRequestIdentity, readJsonObject, requestErrorResponse, requireSafeMutation } from '@/server/request-context';

export async function GET(request: Request) {
  try { const identity = await getRequestIdentity(request); const db = getD1(); const workspace = await ensureWorkspace(db, identity); return apiResponse({ data: await loadKernel(db, workspace) }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    await requireSafeMutation(request, 'application/json');
    const body = await readJsonObject(request, 32_000); const identity = await getRequestIdentity(request); const db = getD1(); const workspace = await ensureWorkspace(db, identity);
    let data: unknown;
    if (body.operation === 'actor.create') data = await createActor(db, identity, workspace, body);
    else if (body.operation === 'relationship.create') data = await createRelationship(db, identity, workspace, body);
    else if (body.operation === 'work.create') data = await createWorkObject(db, identity, workspace, body);
    else if (body.operation === 'activity.create') data = await createTimelineActivity(db, identity, workspace, body);
    else throw new ApiError(400, 'unsupported_operation', 'Unsupported CRM kernel operation.');
    return apiResponse({ data }, { status: 201 });
  } catch (error) { return requestErrorResponse(request, error); }
}
