import { env } from 'cloudflare:workers';

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

export function getRequestIdentity(request: Request): RequestIdentity {
  const url = new URL(request.url);
  const userId = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email');
  const requestId = request.headers.get('x-request-id')?.slice(0, 128) || crypto.randomUUID();
  const localHost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname);

  // The single-user device runtime deliberately ignores identity headers supplied by
  // the browser. Only the hosted identity gateway is allowed to establish a user.
  if (env.FREE_CRM_LOCAL_MODE === 'true' && localHost) {
    return {
      userId: 'local-development-user',
      email: 'owner@free-crm.local',
      displayName: 'Local owner',
      requestId,
    };
  }

  if (userId && email) {
    return {
      userId,
      email,
      displayName: decodedName(request) || email.split('@')[0] || email,
      requestId,
    };
  }

  if (process.env.NODE_ENV !== 'production' && localHost) {
    return {
      userId: 'local-development-user',
      email: 'owner@free-crm.local',
      displayName: 'Local owner',
      requestId,
    };
  }

  throw new ApiError(401, 'authentication_required', 'Sign in to access this workspace.');
}

export function apiResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return apiResponse({ error: { code: error.code, message: error.message, details: error.details ?? null } }, { status: error.status });
  }
  console.error('FREE CRM API error', error);
  return apiResponse({ error: { code: 'internal_error', message: 'The request could not be completed.' } }, { status: 500 });
}
