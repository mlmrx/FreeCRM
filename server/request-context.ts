import { env } from 'cloudflare:workers';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export type RequestIdentity = {
  userId: string;
  email: string;
  displayName: string;
  requestId: string;
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

function decodedName(request: Request): string | null {
  const value = request.headers.get('oai-authenticated-user-full-name');
  const encoding = request.headers.get('oai-authenticated-user-full-name-encoding');
  if (!value || encoding !== 'percent-encoded-utf-8') return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
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

  if (env.FREE_CRM_AUTH_MODE === 'sites') {
    const userId = request.headers.get('oai-authenticated-user-id');
    const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
    if (!userId || !email) throw new ApiError(401, 'authentication_required', 'Sign in to access this workspace.');
    return {
      userId,
      email,
      displayName: decodedName(request) || email.split('@')[0] || email,
      requestId: requestId(request),
    };
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
    };
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

export async function readJsonObject(request: Request, maxBytes = 64_000): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes) throw new ApiError(413, 'request_too_large', `Request body exceeds ${maxBytes} bytes.`);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new ApiError(413, 'request_too_large', `Request body exceeds ${maxBytes} bytes.`);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'invalid_payload', 'Request body must be a JSON object.');
  return value as Record<string, unknown>;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return apiResponse({ error: { code: error.code, message: error.message, details: error.details ?? null } }, { status: error.status });
  }
  console.error('FREE CRM API error', error);
  return apiResponse({ error: { code: 'internal_error', message: 'The request could not be completed.' } }, { status: 500 });
}
