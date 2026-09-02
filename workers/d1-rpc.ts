import {
  D1_RPC_HEADERS,
  D1_RPC_MAX_BATCH_STATEMENTS,
  D1_RPC_MAX_BOUND_PARAMETERS,
  D1_RPC_MAX_CLOCK_SKEW_SECONDS,
  D1_RPC_MAX_REQUEST_BYTES,
  D1_RPC_MAX_SQL_BYTES,
  D1_RPC_NONCE_PRUNE_LIMIT,
  D1_RPC_NONCE_RETENTION_SECONDS,
  D1_RPC_PATH,
  D1_RPC_PROVIDER_MAX_QUERIES,
  D1_RPC_VERSION,
  decodeD1RpcSecret,
  isD1RpcNonce,
  isD1RpcTimestamp,
  verifyD1RpcRequestSignature,
  type D1RpcBinding,
  type D1RpcFailure,
  type D1RpcRequest,
  type D1RpcStatement,
  type D1RpcSuccess,
} from '../lib/d1-rpc-protocol';

type Env = {
  DB: D1Database;
  FREE_CRM_D1_RPC_SECRET?: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const responseHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
};
const recentReadNonces = new Map<string, number>();
const safeDatabaseTokens = [
  'agent capability limit exceeded',
  'agent authorization is no longer valid',
  'run is not executable',
  'invalid agent identity state',
  'connector_sync_claims',
  'connector sync state changed',
  'record_mutation_claims',
  'record capability limit exceeded',
  'workspace record limit exceeded',
  'record payload exceeds limits',
  'note capacity exceeded',
  'workspace reset in progress',
  'workspace_reset_in_progress',
  'workspace_mutation_epoch_stale',
  'audit_events_reset_fence',
  'upload_intent_epoch_stale',
  'upload_intent_not_committed',
  'upload_intent_capacity',
] as const;
const allowedFirstTokens = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WITH']);
const forbiddenTokens = new Set([
  'ALTER', 'ANALYZE', 'ATTACH', 'BEGIN', 'COMMIT', 'CREATE', 'DETACH', 'DROP',
  'EXPLAIN', 'PRAGMA', 'REINDEX', 'RELEASE', 'ROLLBACK', 'SAVEPOINT', 'TRANSACTION',
  'TRUNCATE', 'VACUUM',
]);

function json(body: Record<string, unknown>, status: number, additionalHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...responseHeaders, ...additionalHeaders } });
}

function failure(requestId: string, status: number, code: string, message: string): Response {
  const body: D1RpcFailure = { ok: false, version: D1_RPC_VERSION, requestId, error: { code, message } };
  return json(body, status);
}

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validBinding(value: unknown): value is D1RpcBinding {
  if (value === null || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value));
  return Array.isArray(value) && value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255);
}

function validateSql(sql: string): string | null {
  if (!sql.trim()) return 'SQL cannot be empty.';
  if (encoder.encode(sql).byteLength > D1_RPC_MAX_SQL_BYTES) return `SQL cannot exceed ${D1_RPC_MAX_SQL_BYTES} bytes.`;
  if (sql.includes('\0')) return 'SQL cannot contain NUL bytes.';
  const tokens: string[] = [];
  let quote: "'" | '"' | '`' | ']' | null = null;
  let sawTerminator = false;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (quote) {
      if (quote === ']' && character === ']') quote = null;
      else if (quote !== ']' && character === quote) {
        if (sql[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '[') {
      quote = ']';
      continue;
    }
    if ((character === '-' && sql[index + 1] === '-') || (character === '/' && sql[index + 1] === '*')) {
      return 'SQL comments are not accepted by the data-plane endpoint.';
    }
    if (character === ';') {
      if (sawTerminator || sql.slice(index + 1).trim()) return 'Only one SQL statement is accepted per batch entry.';
      sawTerminator = true;
      continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      let end = index + 1;
      while (end < sql.length && /[A-Za-z0-9_$]/.test(sql[end])) end += 1;
      tokens.push(sql.slice(index, end).toUpperCase());
      index = end - 1;
    }
  }
  if (quote) return 'SQL contains an unterminated quoted value or identifier.';
  if (!tokens.length || !allowedFirstTokens.has(tokens[0])) return 'Only SELECT, INSERT, UPDATE, DELETE, and WITH data-plane statements are accepted.';
  if (tokens.some((token) => forbiddenTokens.has(token))) return 'Schema, transaction, and database-control statements are not accepted by the data-plane endpoint.';
  return null;
}

function validateRequest(value: unknown): { request?: D1RpcRequest; error?: string; mutating?: boolean } {
  if (!record(value) || !exactKeys(value, ['statements', 'version']) || value.version !== D1_RPC_VERSION || !Array.isArray(value.statements)) {
    return { error: 'Request envelope is invalid.' };
  }
  if (value.statements.length < 1 || value.statements.length > D1_RPC_MAX_BATCH_STATEMENTS) {
    return { error: `A request must contain 1 to ${D1_RPC_MAX_BATCH_STATEMENTS} statements.` };
  }
  const statements: D1RpcStatement[] = [];
  let mutating = false;
  for (const candidate of value.statements) {
    if (!record(candidate) || !exactKeys(candidate, ['params', 'sql']) || typeof candidate.sql !== 'string' || !Array.isArray(candidate.params)) {
      return { error: 'Statement envelope is invalid.' };
    }
    if (candidate.params.length > D1_RPC_MAX_BOUND_PARAMETERS || !candidate.params.every(validBinding)) {
      return { error: `Statement parameters are invalid or exceed ${D1_RPC_MAX_BOUND_PARAMETERS} bindings.` };
    }
    const sqlError = validateSql(candidate.sql);
    if (sqlError) return { error: sqlError };
    // A validated statement whose first token is SELECT cannot write in D1.
    // WITH is intentionally treated as mutating because it may prefix DML.
    mutating ||= !/^\s*SELECT\b/i.test(candidate.sql);
    statements.push({ sql: candidate.sql, params: candidate.params as D1RpcBinding[] });
  }
  return { request: { version: D1_RPC_VERSION, statements }, mutating };
}

function bindValue(value: D1RpcBinding): string | number | null | ArrayBuffer {
  return Array.isArray(value) ? Uint8Array.from(value).buffer : value;
}

function replayedRead(nonce: string, nowSeconds: number): boolean {
  for (const [cachedNonce, expiresAt] of recentReadNonces) {
    if (expiresAt < nowSeconds) recentReadNonces.delete(cachedNonce);
  }
  if (recentReadNonces.has(nonce)) return true;
  recentReadNonces.set(nonce, nowSeconds + D1_RPC_MAX_CLOCK_SKEW_SECONDS);
  while (recentReadNonces.size > 1_024) {
    const oldest = recentReadNonces.keys().next().value as string | undefined;
    if (!oldest) break;
    recentReadNonces.delete(oldest);
  }
  return false;
}

function databaseMessage(error: unknown): string {
  const raw = String(error).toLowerCase();
  return safeDatabaseTokens.find((token) => raw.includes(token)) ?? 'Database operation failed.';
}

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > D1_RPC_MAX_REQUEST_BYTES) {
        await reader.cancel('request_too_large').catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== D1_RPC_PATH || url.search) return json({ error: 'not_found' }, 404);
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  let secret: Uint8Array;
  try {
    secret = decodeD1RpcSecret(env.FREE_CRM_D1_RPC_SECRET ?? '');
  } catch {
    return failure('', 503, 'service_unconfigured', 'D1 RPC is not configured.');
  }
  if (!env.DB || typeof env.DB.prepare !== 'function' || typeof env.DB.batch !== 'function') {
    return failure('', 503, 'service_unconfigured', 'D1 RPC is not configured.');
  }
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType !== 'application/json' && contentType !== 'application/json; charset=utf-8') {
    return failure('', 415, 'unsupported_media_type', 'Content-Type must be application/json.');
  }
  const timestamp = request.headers.get(D1_RPC_HEADERS.timestamp) ?? '';
  const nonce = request.headers.get(D1_RPC_HEADERS.nonce) ?? '';
  const signature = request.headers.get(D1_RPC_HEADERS.signature) ?? '';
  const requestId = isD1RpcNonce(nonce) ? nonce : '';
  if (!isD1RpcTimestamp(timestamp) || !requestId) {
    return failure(requestId, 401, 'authentication_failed', 'Request authentication failed.');
  }
  const nowSeconds = Math.floor(Date.now() / 1_000);
  if (Math.abs(nowSeconds - Number(timestamp)) > D1_RPC_MAX_CLOCK_SKEW_SECONDS) {
    return failure(requestId, 401, 'authentication_failed', 'Request authentication failed.');
  }
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > D1_RPC_MAX_REQUEST_BYTES) {
    return failure(requestId, 413, 'request_too_large', 'Request body is too large.');
  }
  const bytes = await readBoundedBody(request);
  if (!bytes) return failure(requestId, 413, 'request_too_large', 'Request body is too large.');
  let body: string;
  try {
    body = decoder.decode(bytes);
  } catch {
    return failure(requestId, 400, 'invalid_request', 'Request body must be valid UTF-8 JSON.');
  }
  if (!await verifyD1RpcRequestSignature(secret, timestamp, nonce, body, signature)) {
    return failure(requestId, 401, 'authentication_failed', 'Request authentication failed.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return failure(requestId, 400, 'invalid_request', 'Request body must be valid JSON.');
  }
  const validated = validateRequest(parsed);
  if (!validated.request) return failure(requestId, 400, 'invalid_request', validated.error ?? 'Request is invalid.');
  const mutating = validated.mutating === true;
  if (!mutating && replayedRead(nonce, nowSeconds)) {
    return failure(requestId, 409, 'replayed_request', 'Request nonce was already used.');
  }
  try {
    const prepared = validated.request.statements.map((statement) => {
      const query = env.DB.prepare(statement.sql);
      return statement.params.length ? query.bind(...statement.params.map(bindValue)) : query;
    });
    const internal = mutating ? [
      env.DB.prepare(
        'DELETE FROM d1_rpc_nonce_claims WHERE nonce IN (SELECT nonce FROM d1_rpc_nonce_claims WHERE expires_at < ? ORDER BY expires_at ASC LIMIT ?)',
      ).bind(nowSeconds, D1_RPC_NONCE_PRUNE_LIMIT),
      env.DB.prepare(
        'INSERT INTO d1_rpc_nonce_claims (nonce, claimed_at, expires_at) VALUES (?, ?, ?)',
      ).bind(nonce, nowSeconds, nowSeconds + D1_RPC_NONCE_RETENTION_SECONDS),
    ] : [];
    const submitted = [...internal, ...prepared];
    if (submitted.length > D1_RPC_PROVIDER_MAX_QUERIES) {
      throw new Error('D1 RPC query budget exceeded.');
    }
    const batchResults = await env.DB.batch(submitted);
    if (!Array.isArray(batchResults) || batchResults.length !== submitted.length || batchResults.some((result) => result.success !== true)) {
      throw new Error('D1 returned an invalid batch result.');
    }
    const results = batchResults.slice(internal.length);
    const response: D1RpcSuccess = { ok: true, version: D1_RPC_VERSION, requestId, results };
    return json(response, 200);
  } catch (error) {
    if (mutating && String(error).toLowerCase().includes('d1_rpc_nonce_replayed')) {
      return failure(requestId, 409, 'replayed_request', 'Request nonce was already used.');
    }
    return failure(requestId, 503, 'database_error', databaseMessage(error));
  }
}

const d1RpcWorker = {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};

export default d1RpcWorker;
