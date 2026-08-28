import { getD1 } from '@/db';
import { executeCommand } from '@/server/commands';
import { ensureWorkspace } from '@/server/control-plane';
import { ApiError, apiResponse, errorResponse, getRequestIdentity } from '@/server/request-context';
import { parseCommand } from '@/server/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 1_000_000) throw new ApiError(413, 'request_too_large', 'Request body exceeds 1 MB.');
    const rawBody = await request.text();
    if (rawBody.length > 1_000_000) throw new ApiError(413, 'request_too_large', 'Request body exceeds 1 MB.');
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
    const response = await executeCommand(db, identity, context, command, idempotencyKey, rawBody);
    return apiResponse(response);
  } catch (error) {
    return errorResponse(error);
  }
}
