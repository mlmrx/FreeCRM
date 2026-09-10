import { getD1 } from '@/db';
import { requirePermission } from '@/server/authorization';
import { ensureWorkspace } from '@/server/control-plane';
import { brainId, exportBrain, mutateBrain, normalizeBrainError, readBrainConversation, readBrainSnapshot, readBrainSource, searchBrain } from '@/server/brain';
import { apiResponse, getRequestIdentity, readJsonObject, requestErrorResponse, requireSafeMutation } from '@/server/request-context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const context = await ensureWorkspace(db, identity);
    requirePermission(context.workspace.role, 'records:read');
    const params = new URL(request.url).searchParams;
    if (params.has('export')) return apiResponse(await exportBrain(db, context, identity), { headers: { 'content-disposition': 'attachment; filename="free-crm-second-brain.json"' } });
    if (params.has('sourceId')) return apiResponse({ data: await readBrainSource(db, context.workspaceId, brainId(params.get('sourceId'))) });
    if (params.has('conversationId')) return apiResponse({ data: await readBrainConversation(db, context.workspaceId, brainId(params.get('conversationId'))) });
    if (params.has('search')) return apiResponse({ data: await searchBrain(db, context.workspaceId, params.get('search')) });
    return apiResponse({ data: await readBrainSnapshot(db, context, identity) });
  } catch (error) { return requestErrorResponse(request, normalizeBrainError(error)); }
}

export async function POST(request: Request) {
  try {
    await requireSafeMutation(request, 'application/json');
    const identity = await getRequestIdentity(request);
    const body = await readJsonObject(request, 256_000);
    const db = getD1();
    const context = await ensureWorkspace(db, identity);
    requirePermission(context.workspace.role, 'records:read');
    return apiResponse({ data: await mutateBrain(db, context, identity, body, request.signal) });
  } catch (error) { return requestErrorResponse(request, normalizeBrainError(error)); }
}
