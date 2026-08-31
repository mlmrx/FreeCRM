export const D1_RPC_VERSION = 1 as const;
export const D1_RPC_PATH = '/v1/d1';
export const D1_RPC_MAX_CLOCK_SKEW_SECONDS = 300;
// Cloudflare Workers Free permits at most 50 D1 queries per invocation. Keep
// two queries in reserve for the durable mutation nonce claim and bounded
// expiry pruning. All-read batches deliberately keep the same portable limit.
export const D1_RPC_PROVIDER_MAX_QUERIES = 50;
export const D1_RPC_INTERNAL_MUTATION_STATEMENTS = 2;
export const D1_RPC_MAX_BATCH_STATEMENTS = D1_RPC_PROVIDER_MAX_QUERIES - D1_RPC_INTERNAL_MUTATION_STATEMENTS;
export const D1_RPC_NONCE_PRUNE_LIMIT = 100;
export const D1_RPC_NONCE_RETENTION_SECONDS = D1_RPC_MAX_CLOCK_SKEW_SECONDS * 2 + 1;
export const D1_RPC_MAX_BOUND_PARAMETERS = 100;
export const D1_RPC_MAX_REQUEST_BYTES = 1024 * 1024;
export const D1_RPC_MAX_SQL_BYTES = 100_000;

export const D1_RPC_HEADERS = {
  nonce: 'x-free-crm-nonce',
  signature: 'x-free-crm-signature',
  timestamp: 'x-free-crm-timestamp',
} as const;

export type D1RpcBinding = string | number | null | number[];

export type D1RpcStatement = {
  sql: string;
  params: D1RpcBinding[];
};

export type D1RpcRequest = {
  version: typeof D1_RPC_VERSION;
  statements: D1RpcStatement[];
};

export type D1RpcMeta = {
  duration?: number;
  size_after?: number;
  rows_read?: number;
  rows_written?: number;
  last_row_id?: number;
  changed_db?: boolean;
  changes?: number;
  served_by_region?: string;
  served_by_colo?: string;
  served_by_primary?: boolean;
  timings?: { sql_duration_ms?: number };
  total_attempts?: number;
  [key: string]: unknown;
};

export type D1RpcResult = {
  success: true;
  results: unknown[];
  meta: D1RpcMeta;
};

export type D1RpcSuccess = {
  ok: true;
  version: typeof D1_RPC_VERSION;
  requestId: string;
  results: D1RpcResult[];
};

export type D1RpcFailure = {
  ok: false;
  version: typeof D1_RPC_VERSION;
  requestId: string;
  error: {
    code: string;
    message: string;
  };
};

export type D1RpcResponse = D1RpcSuccess | D1RpcFailure;

const encoder = new TextEncoder();
const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error('FREE_CRM_D1_RPC_SECRET must be a base64url-encoded 32-byte secret.');
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function decodeD1RpcSecret(value: string): Uint8Array {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(normalized)) {
    throw new Error('FREE_CRM_D1_RPC_SECRET must be a base64url-encoded 32-byte secret.');
  }
  const decoded = base64UrlDecode(normalized);
  if (decoded.byteLength !== 32 || base64UrlEncode(decoded) !== normalized) {
    throw new Error('FREE_CRM_D1_RPC_SECRET must be a base64url-encoded 32-byte secret.');
  }
  return decoded;
}

export function isD1RpcNonce(value: string): boolean {
  return uuidV4Pattern.test(value);
}

export function isD1RpcTimestamp(value: string): boolean {
  return /^\d{10,11}$/.test(value) && Number.isSafeInteger(Number(value));
}

async function bodyDigest(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(body));
  return base64UrlEncode(new Uint8Array(digest));
}

async function signatureInput(timestamp: string, nonce: string, body: string): Promise<Uint8Array> {
  const digest = await bodyDigest(body);
  return encoder.encode([
    'FREE-CRM-D1-RPC',
    `v${D1_RPC_VERSION}`,
    'POST',
    D1_RPC_PATH,
    timestamp,
    nonce,
    digest,
  ].join('\n'));
}

async function importHmacKey(secret: Uint8Array, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  const raw = Uint8Array.from(secret).buffer;
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export async function signD1RpcRequest(secret: Uint8Array, timestamp: string, nonce: string, body: string): Promise<string> {
  if (!isD1RpcTimestamp(timestamp) || !isD1RpcNonce(nonce)) throw new Error('D1 RPC signing metadata is invalid.');
  const key = await importHmacKey(secret, 'sign');
  const input = Uint8Array.from(await signatureInput(timestamp, nonce, body)).buffer;
  const signature = await crypto.subtle.sign('HMAC', key, input);
  return `v1=${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyD1RpcRequestSignature(
  secret: Uint8Array,
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
): Promise<boolean> {
  if (!isD1RpcTimestamp(timestamp) || !isD1RpcNonce(nonce) || !/^v1=[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  let supplied: Uint8Array;
  try {
    supplied = base64UrlDecode(signature.slice(3));
  } catch {
    return false;
  }
  if (supplied.byteLength !== 32) return false;
  const key = await importHmacKey(secret, 'verify');
  const input = Uint8Array.from(await signatureInput(timestamp, nonce, body)).buffer;
  return crypto.subtle.verify('HMAC', key, Uint8Array.from(supplied).buffer, input);
}
