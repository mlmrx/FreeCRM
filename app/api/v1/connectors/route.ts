import { getD1 } from '@/db';
import { connectSimulator, disconnectSimulator, syncSimulator } from '@/server/connectors';
import { ensureWorkspace } from '@/server/control-plane';
import { requireCapability } from '@/server/capabilities';
import { ApiError, apiResponse, getRequestIdentity, readJsonObject, requestErrorResponse, requireSafeMutation } from '@/server/request-context';

export async function POST(request: Request) {
  try {
    await requireSafeMutation(request, 'application/json');
    const body = await readJsonObject(request);
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const workspace = await ensureWorkspace(db, identity);
    await requireCapability(db, workspace, 'integrations');
    let data: unknown;
    if (body.operation === 'connect') data = await connectSimulator(db, identity, workspace, body.connectorKey, body.webhookKey, request.headers.get('idempotency-key'));
    else if (body.operation === 'sync') data = await syncSimulator(db, identity, workspace, body.connectionId, request.headers.get('idempotency-key'));
    else if (body.operation === 'disconnect') data = await disconnectSimulator(db, identity, workspace, body.connectionId, request.headers.get('idempotency-key'));
    else throw new ApiError(400, 'unsupported_operation', 'Unsupported connector operation.');
    return apiResponse({ data });
  } catch (error) { return requestErrorResponse(request, error); }
}
