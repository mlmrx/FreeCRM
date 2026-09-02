import { getD1, getFiles } from '@/db';
import { executeCommand } from '@/server/commands';
import { ensureWorkspace } from '@/server/control-plane';
import { ApiError, apiResponse, getRequestIdentity, readBoundedRequestText, requestErrorResponse, requireSafeMutation } from '@/server/request-context';
import { parseCommand } from '@/server/validation';
import { R2TenantObjectStorage } from '@/server/object-storage';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await requireSafeMutation(request, 'application/json');
    const rawBody = await readBoundedRequestText(request, 1_000_000, 'Request body exceeds 1 MB.');
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.');
    }
    const identity = await getRequestIdentity(request);
    const command = parseCommand(json);
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey) throw new ApiError(400, 'idempotency_key_required', 'Idempotency-Key header is required.');
    const db = getD1();
    const context = await ensureWorkspace(db, identity);
    const storage = new R2TenantObjectStorage(getFiles());
    const response = await executeCommand(db, identity, context, command, idempotencyKey, rawBody, {
      deleteWorkspaceObjects: (workspaceId, beforeMutationEpoch) => storage.deleteWorkspacePage(workspaceId, beforeMutationEpoch),
    });
    return apiResponse(response);
  } catch (error) {
    return requestErrorResponse(request, error);
  }
}
