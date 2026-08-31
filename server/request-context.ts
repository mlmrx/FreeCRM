import { env } from 'cloudflare:workers';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export type RequestIdentity = {
  userId: string;
  email: string;
  displayName: string;
  requestId: string;
  runtimeMode: 'device' | 'cloudflare-access' | 'authjs';
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export type CloudflareAccessConfig = {
  issuer: string;
  audience: string;
  ownerEmail: string;
  jwksUrl: URL;
};

export type AccessTokenVerifier = (token: string, config: CloudflareAccessConfig) => Promise<JWTPayload>;

const remoteKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function normalizeAccessTeamDomain(value: string): string {
  const raw = value.trim();
  let url: URL;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    throw new ApiError(503, 'deployment_locked', 'Cloud access is not configured yet.');
  }
  const host = url.hostname.toLowerCase();
  const safeOrigin = url.protocol === 'https:'
    && !url.username
    && !url.password
    && !url.port
    && (url.pathname === '/' || url.pathname === '')
    && !url.search
    && !url.hash
    && host.endsWith('.cloudflareaccess.com')
    && host.length > '.cloudflareaccess.com'.length;
  if (!safeOrigin) throw new ApiError(503, 'deployment_locked', 'Cloud access is not configured yet.');
  return `https://${host}`;
}

function cloudflareAccessConfig(): CloudflareAccessConfig {
  const teamDomain = env.FREE_CRM_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.FREE_CRM_ACCESS_AUD?.trim();
  const ownerEmail = env.FREE_CRM_OWNER_EMAIL?.trim().toLowerCase();
  if (!teamDomain
    || !audience
    || audience.length > 512
    || !/^[A-Za-z0-9_-]+$/.test(audience)
    || !ownerEmail
    || ownerEmail.length > 320
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    throw new ApiError(503, 'deployment_locked', 'Cloud access is not configured yet.');
  }
  const issuer = normalizeAccessTeamDomain(teamDomain);
  return { issuer, audience, ownerEmail, jwksUrl: new URL('/cdn-cgi/access/certs', issuer) };
}

async function verifyCloudflareAccessToken(token: string, config: CloudflareAccessConfig): Promise<JWTPayload> {
  let keySet = remoteKeySets.get(config.issuer);
  if (!keySet) {
    keySet = createRemoteJWKSet(config.jwksUrl);
    remoteKeySets.set(config.issuer, keySet);
  }
  const { payload } = await jwtVerify(token, keySet, {
    algorithms: ['RS256'],
    issuer: config.issuer,
    audience: config.audience,
  });
  return payload;
}

async function stableAccessUserId(issuer: string, subject: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${issuer}\n${subject}`));
  return `cloudflare:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function requestId(request: Request): string {
  return request.headers.get('x-request-id')?.slice(0, 128) || crypto.randomUUID();
}

function localIdentity(request: Request): RequestIdentity {
  return {
    userId: 'local-development-user',
    email: 'owner@free-crm.local',
    displayName: 'Local owner',
    requestId: requestId(request),
    runtimeMode: 'device',
  };
}

export async function getRequestIdentity(request: Request, verifier: AccessTokenVerifier = verifyCloudflareAccessToken): Promise<RequestIdentity> {
  const url = new URL(request.url);
  const localHost = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'].includes(url.hostname);
  const cloudflareProxied = request.headers.has('cf-ray') || request.headers.has('cf-connecting-ip');

  // The single-user device runtime deliberately ignores identity headers supplied by
  // the browser. Wrangler may add Cloudflare connection headers even in local mode,
  // so the literal request hostname is the security boundary.
  if (env.FREE_CRM_LOCAL_MODE === 'true') {
    if (!localHost) throw new ApiError(403, 'local_mode_denied', 'Device mode is available only on this machine.');
    return localIdentity(request);
  }

  if (env.FREE_CRM_AUTH_MODE === 'cloudflare-access') {
    const config = cloudflareAccessConfig();
    const token = request.headers.get('cf-access-jwt-assertion');
    if (!token) throw new ApiError(401, 'authentication_required', 'Sign in through Cloudflare Access.');
    let payload: JWTPayload;
    try {
      payload = await verifier(token, config);
    } catch {
      throw new ApiError(403, 'access_denied', 'Cloudflare Access could not verify this request.');
    }
    const subject = typeof payload.sub === 'string' ? payload.sub.trim() : '';
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!subject || !email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ApiError(403, 'access_denied', 'Cloudflare Access did not provide a usable identity.');
    }
    if (email !== config.ownerEmail) throw new ApiError(403, 'access_denied', 'This identity is not the configured FREE CRM owner.');
    const displayName = typeof payload.name === 'string' && payload.name.trim()
      ? payload.name.trim().slice(0, 200)
      : email.split('@')[0] || email;
    return {
      userId: await stableAccessUserId(config.issuer, subject),
      email,
      displayName,
      requestId: requestId(request),
      runtimeMode: 'cloudflare-access',
    };
  }

  if (env.FREE_CRM_AUTH_MODE === 'authjs') {
    const { authorizeVercelRequest, VercelAuthConfigurationError } = await import('./vercel-auth');
    try {
      const decision = await authorizeVercelRequest(request);
      if (decision.status === 'unauthenticated') throw new ApiError(401, 'authentication_required', 'Sign in with GitHub to access this workspace.');
      if (decision.status === 'forbidden') throw new ApiError(403, 'access_denied', 'This identity is not the configured FREE CRM owner.');
      return { ...decision.identity, runtimeMode: 'authjs' };
    } catch (error) {
      if (error instanceof VercelAuthConfigurationError) throw new ApiError(503, 'deployment_locked', 'Cloud authentication is not configured yet.');
      throw error;
    }
  }

  if (process.env.NODE_ENV !== 'production' && localHost && !cloudflareProxied) return localIdentity(request);

  throw new ApiError(503, 'deployment_locked', 'This FREE CRM deployment is sealed until an identity provider is configured.');
}

export function apiResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function drainUnreadRequestBody(request: Request): Promise<void> {
  if (!request.body || request.bodyUsed) return;
  try {
    // This intentionally streams into a zero-buffer sink. workerd currently
    // requires rejected incoming bodies to be drained; cancel() alone can
    // still leave its proxy trying to read after the response is sent.
    await request.body.pipeTo(new WritableStream());
  } catch {
    // A locked or concurrently consumed stream no longer needs draining here.
  }
}

async function rejectUnreadRequest(request: Request, error: ApiError): Promise<never> {
  // Workers runtimes may continue forwarding an unread request body after the
  // route has returned its response. Explicitly drain rejected request bodies
  // so a denied or oversized POST cannot destabilize the worker.
  await drainUnreadRequestBody(request);
  throw error;
}

export async function readJsonObject(request: Request, maxBytes = 64_000): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes) {
    return rejectUnreadRequest(request, new ApiError(413, 'request_too_large', `Request body exceeds ${maxBytes} bytes.`));
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new ApiError(413, 'request_too_large', `Request body exceeds ${maxBytes} bytes.`);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'invalid_payload', 'Request body must be a JSON object.');
  return value as Record<string, unknown>;
}

export async function requireActivatedRuntime(): Promise<void> {
  if (env.FREE_CRM_LOCAL_MODE === 'true') return;
  if (env.FREE_CRM_AUTH_MODE === 'cloudflare-access') {
    cloudflareAccessConfig();
    return;
  }
  if (env.FREE_CRM_AUTH_MODE === 'authjs') {
    const { readVercelAuthSettings, VercelAuthConfigurationError } = await import('./vercel-auth');
    try {
      readVercelAuthSettings();
      return;
    } catch (error) {
      if (error instanceof VercelAuthConfigurationError) throw new ApiError(503, 'deployment_locked', 'Cloud authentication is not configured yet.');
      throw error;
    }
  }
  throw new ApiError(503, 'deployment_locked', 'This FREE CRM deployment is sealed until an identity provider is configured.');
}

/**
 * Native Vercel has no free, trusted machine-ingress boundary equivalent to a
 * dedicated Cloudflare Access Service Auth application. Keep webhook traffic
 * away from the data plane until that boundary exists; the workspace key alone
 * must not let unauthenticated traffic consume cross-cloud database capacity.
 */
export function requireMachineWebhookIngress(runtimeMode?: RequestIdentity['runtimeMode']): void {
  if (runtimeMode === 'authjs' || env.FREE_CRM_AUTH_MODE === 'authjs' || process.env.VERCEL === '1') {
    throw new ApiError(503, 'webhook_ingress_unavailable', 'Machine webhook ingress is unavailable on the native Vercel runtime. Use the device or protected Cloudflare runtime.');
  }
}

export async function requireSafeMutation(request: Request, expectedContentType?: 'application/json' | 'multipart/form-data'): Promise<void> {
  const fetchSite = request.headers.get('sec-fetch-site')?.toLowerCase();
  if (fetchSite === 'cross-site') {
    return rejectUnreadRequest(request, new ApiError(403, 'cross_site_request_denied', 'Cross-site browser mutations are not allowed.'));
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== 'null') {
    let source: URL;
    try {
      source = new URL(origin);
    } catch {
      return rejectUnreadRequest(request, new ApiError(403, 'cross_site_request_denied', 'Mutation origin is invalid.'));
    }
    if (source.origin !== new URL(request.url).origin) {
      return rejectUnreadRequest(request, new ApiError(403, 'cross_site_request_denied', 'Cross-site browser mutations are not allowed.'));
    }
  }
  if (expectedContentType) {
    const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith(expectedContentType)) {
      return rejectUnreadRequest(request, new ApiError(415, 'content_type_required', `Content-Type must be ${expectedContentType}.`));
    }
  } else {
    // Bodyless mutations (currently document DELETE) must not leave an
    // unexpected client-supplied stream unread on their success path.
    await drainUnreadRequestBody(request);
  }
}

export async function requestErrorResponse(request: Request, error: unknown): Promise<Response> {
  await drainUnreadRequestBody(request);
  return errorResponse(error);
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return apiResponse({ error: { code: error.code, message: error.message, details: error.details ?? null } }, { status: error.status });
  }
  if (String(error).includes('record capability limit exceeded')) {
    return apiResponse({ error: { code: 'capability_limit', message: 'This workspace capability is disabled or has reached its record limit.', details: null } }, { status: 409 });
  }
  if (String(error).includes('workspace record limit exceeded')) {
    return apiResponse({ error: { code: 'workspace_record_limit', message: 'This workspace has reached the supported record capacity.', details: null } }, { status: 409 });
  }
  if (String(error).includes('record payload exceeds limits')) {
    return apiResponse({ error: { code: 'record_payload_too_large', message: 'Record fields or tags exceed the supported encoded size.', details: null } }, { status: 409 });
  }
  if (String(error).includes('note capacity exceeded')) {
    return apiResponse({ error: { code: 'note_limit', message: 'This record or workspace has reached the supported note capacity.', details: null } }, { status: 409 });
  }
  if (String(error).includes('record_mutation_claims')) {
    return apiResponse({ error: { code: 'stale_record', message: 'This record changed elsewhere. Refresh and try again.', details: null } }, { status: 409 });
  }
  if (String(error).includes('workspace reset in progress')) {
    return apiResponse({ error: { code: 'workspace_reset_in_progress', message: 'This workspace is being reset. Retry after the reset completes.', details: null } }, { status: 423 });
  }
  console.error('FREE CRM API error', error);
  return apiResponse({ error: { code: 'internal_error', message: 'The request could not be completed.' } }, { status: 500 });
}
