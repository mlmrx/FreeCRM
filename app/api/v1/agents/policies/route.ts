import { getD1 } from '@/db';
import { agentPolicySettings, dryRunAgentPolicy, existingPolicyWorkspace, saveAgentPolicy } from '@/server/agent-policies';
import { requireCapability } from '@/server/capabilities';
import { ApiError, apiResponse, getRequestIdentity, readJsonObject, requestErrorResponse, requireSafeMutation } from '@/server/request-context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const workspace = await existingPolicyWorkspace(db, identity);
    await requireCapability(db, workspace, 'agentPlane');
    await requireCapability(db, workspace, 'advancedPolicies');
    return apiResponse({ data: await agentPolicySettings(db, workspace, new URL(request.url).searchParams.get('agentId')) });
  } catch (error) { return requestErrorResponse(request, error); }
}

export async function POST(request: Request) {
  try {
    await requireSafeMutation(request, 'application/json');
    const body = await readJsonObject(request, 32000);
    if (Object.keys(body).some((key) => !['operation', 'agentId', 'policy', 'proposal', 'expectedVersion'].includes(key))) throw new ApiError(400, 'validation_error', 'Unsupported policy request field.');
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const workspace = await existingPolicyWorkspace(db, identity);
    await requireCapability(db, workspace, 'agentPlane');
    await requireCapability(db, workspace, 'advancedPolicies');
    if (body.operation === 'dry-run') return apiResponse({ data: await dryRunAgentPolicy(db, workspace, body as never) });
    if (body.operation === 'save') return apiResponse({ data: await saveAgentPolicy(db, identity, workspace, body as never, request.headers.get('idempotency-key')) });
    throw new ApiError(400, 'unsupported_operation', 'Unsupported policy operation.');
  } catch (error) { return requestErrorResponse(request, error); }
}
