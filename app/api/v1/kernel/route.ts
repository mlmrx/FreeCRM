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
    const body = await readJsonObject(request, 32_000);
    const identity = await getRequestIdentity(request);
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey) throw new ApiError(400, 'idempotency_key_required', 'Idempotency-Key header is required.');
    const db = getD1(); const workspace = await ensureWorkspace(db, identity);
    const idempotency = { key: idempotencyKey, requestBody: JSON.stringify(body) };
    let outcome: { data: Record<string, unknown>; replayed: boolean };
    if (body.operation === 'actor.create') outcome = await createActor(db, identity, workspace, body, idempotency);
    else if (body.operation === 'relationship.create') outcome = await createRelationship(db, identity, workspace, body, idempotency);
    else if (body.operation === 'work.create') outcome = await createWorkObject(db, identity, workspace, body, idempotency);
    else if (body.operation === 'activity.create') outcome = await createTimelineActivity(db, identity, workspace, body, idempotency);
    else throw new ApiError(400, 'unsupported_operation', 'Unsupported CRM kernel operation.');
    return apiResponse(outcome, { status: 201 });
  } catch (error) { return requestErrorResponse(request, error); }
}
