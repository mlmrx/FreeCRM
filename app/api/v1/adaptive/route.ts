import { getD1 } from '@/db';
import { exportAdaptive, mutateAdaptive, normalizeAdaptiveError, readAdaptiveSnapshot } from '@/server/adaptive';
import { requirePermission } from '@/server/authorization';
import { ensureWorkspace } from '@/server/control-plane';
import { apiResponse, getRequestIdentity, readJsonObject, requestErrorResponse, requireSafeMutation } from '@/server/request-context';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const context = await ensureWorkspace(db, identity);
    requirePermission(context.workspace.role, 'records:read');
    if (new URL(request.url).searchParams.has('export')) return apiResponse(await exportAdaptive(db, context, identity), { headers: { 'content-disposition': 'attachment; filename="free-crm-adaptive.json"' } });
    return apiResponse({ data: await readAdaptiveSnapshot(db, context, identity) });
  } catch (error) { return requestErrorResponse(request, normalizeAdaptiveError(error)); }
}
export async function POST(request: Request) {
  try {
    await requireSafeMutation(request, 'application/json');
    const identity = await getRequestIdentity(request);
    const body = await readJsonObject(request, 16_000);
    const db = getD1();
    const context = await ensureWorkspace(db, identity);
    requirePermission(context.workspace.role, 'records:read');
    return apiResponse({ data: await mutateAdaptive(db, context, identity, body, request.signal) });
  } catch (error) { return requestErrorResponse(request, normalizeAdaptiveError(error)); }
}
