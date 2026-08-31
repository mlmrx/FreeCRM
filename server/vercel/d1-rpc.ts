import {
  D1_RPC_HEADERS,
  D1_RPC_MAX_BATCH_STATEMENTS,
  D1_RPC_PATH,
  D1_RPC_VERSION,
  decodeD1RpcSecret,
  isD1RpcNonce,
  signD1RpcRequest,
  type D1RpcBinding,
  type D1RpcResponse,
  type D1RpcResult,
  type D1RpcStatement,
} from '@/lib/d1-rpc-protocol';

export type D1RpcConfig = {
  url: string;
  secret: string;
  accessClientId: string;
  accessClientSecret: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  nonce?: () => string;
  timeoutMs?: number;
};

export const CLOUDFLARE_ACCESS_SERVICE_HEADERS = {
  clientId: 'CF-Access-Client-Id',
  clientSecretHeader: 'CF-Access-Client-Secret',
} as const;

function accessServiceCredential(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized.length < 16 || normalized.length > 512 || !/^[\x21-\x7e]+$/.test(normalized)) {
    throw new Error(`${name} must be a non-empty printable ASCII Cloudflare Access service-token value.`);
  }
  return normalized;
}

function rpcEndpoint(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('FREE_CRM_D1_RPC_URL must be an absolute URL.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('FREE_CRM_D1_RPC_URL must use HTTPS (literal loopback HTTP is allowed for development).');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== D1_RPC_PATH) {
    throw new Error(`FREE_CRM_D1_RPC_URL must point exactly to ${D1_RPC_PATH} without credentials, query, or fragment.`);
  }
  return url.toString();
}

function normalizeBinding(value: unknown): D1RpcBinding {
  if (value === undefined) throw new TypeError('D1 bindings cannot contain undefined. Use null explicitly.');
  if (value === null || typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw new TypeError('D1 numeric bindings must be finite and safely representable by JavaScript.');
    }
    return value;
  }
  if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
  if (ArrayBuffer.isView(value)) {
    return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  throw new TypeError(`Unsupported D1 binding type: ${typeof value}.`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEnvelope(text: string): D1RpcResponse {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('FREE CRM D1 RPC returned malformed JSON.');
  }
  if (!isObject(value) || value.version !== D1_RPC_VERSION || typeof value.ok !== 'boolean' || typeof value.requestId !== 'string') {
    throw new Error('FREE CRM D1 RPC returned an invalid response envelope.');
  }
  return value as D1RpcResponse;
}

function validRpcResult(value: unknown): value is D1RpcResult {
  return isObject(value) && value.success === true && Array.isArray(value.results) && isObject(value.meta);
}

export class D1RpcPreparedStatement {
  constructor(
    private readonly database: D1RpcDatabase,
    readonly sql: string,
    readonly params: D1RpcBinding[] = [],
  ) {}

  bind(...values: unknown[]): D1RpcPreparedStatement {
    return new D1RpcPreparedStatement(this.database, this.sql, values.map(normalizeBinding));
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const result = await this.database.executeOne(this.toRpcStatement());
    const row = (result.results[0] ?? null) as T | null;
    if (column === undefined || row === null) return row;
    if (typeof row !== 'object' || !(column in row)) throw new Error(`D1 result column \`${column}\` was not found.`);
    return (row as Record<string, unknown>)[column] as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.database.toD1Result<T>(await this.database.executeOne(this.toRpcStatement()));
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.database.toD1Result<T>(await this.database.executeOne(this.toRpcStatement()));
  }

  belongsTo(database: D1RpcDatabase): boolean {
    return this.database === database;
  }

  toRpcStatement(): D1RpcStatement {
    return { sql: this.sql, params: this.params };
  }
}

/**
 * D1-compatible data-plane facade for native Vercel Functions. Requests are
 * authenticated to a user-owned Worker, which executes against a real D1
 * binding. Cloudflare account-control API credentials never enter Vercel.
 */
export class D1RpcDatabase {
  private readonly endpoint: string;
  private readonly secret: Uint8Array;
  private readonly accessClientId: string;
  private readonly accessClientSecret: string;
  private readonly request: typeof globalThis.fetch;
  private readonly clock: () => number;
  private readonly createNonce: () => string;
  private readonly timeoutMs: number;

  constructor(config: D1RpcConfig) {
    this.endpoint = rpcEndpoint(config.url);
    this.secret = decodeD1RpcSecret(config.secret);
    this.accessClientId = accessServiceCredential(config.accessClientId, 'FREE_CRM_D1_ACCESS_CLIENT_ID');
    this.accessClientSecret = accessServiceCredential(config.accessClientSecret, 'FREE_CRM_D1_ACCESS_CLIENT_SECRET');
    this.request = config.fetch ?? globalThis.fetch;
    this.clock = config.now ?? Date.now;
    this.createNonce = config.nonce ?? crypto.randomUUID.bind(crypto);
    this.timeoutMs = config.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1_000 || this.timeoutMs > 60_000) {
      throw new Error('D1 RPC timeout must be between 1,000 and 60,000 milliseconds.');
    }
  }

  prepare(sql: string): D1RpcPreparedStatement {
    if (typeof sql !== 'string' || !sql.trim()) throw new TypeError('D1 SQL cannot be empty.');
    return new D1RpcPreparedStatement(this, sql);
  }

  async batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    if (!statements.length) return [];
    if (statements.length > D1_RPC_MAX_BATCH_STATEMENTS) {
      throw new TypeError(`D1 RPC batches cannot exceed ${D1_RPC_MAX_BATCH_STATEMENTS} statements.`);
    }
    const batch = statements.map((statement) => {
      if (!(statement instanceof D1RpcPreparedStatement) || !statement.belongsTo(this)) {
        throw new TypeError('D1 RPC batches accept only statements prepared by the same adapter.');
      }
      return statement.toRpcStatement();
    });
    const results = await this.execute(batch);
    return results.map((result) => this.toD1Result<T>(result));
  }

  async executeOne(statement: D1RpcStatement): Promise<D1RpcResult> {
    const results = await this.execute([statement]);
    return results[0];
  }

  toD1Result<T>(result: D1RpcResult): D1Result<T> {
    const meta = result.meta;
    return {
      success: true,
      results: result.results as T[],
      meta: {
        duration: Number(meta.duration ?? 0),
        changes: Number(meta.changes ?? 0),
        last_row_id: Number(meta.last_row_id ?? 0),
        changed_db: Boolean(meta.changed_db),
        size_after: Number(meta.size_after ?? 0),
        rows_read: Number(meta.rows_read ?? 0),
        rows_written: Number(meta.rows_written ?? 0),
        ...(typeof meta.served_by_region === 'string' ? { served_by_region: meta.served_by_region } : {}),
        ...(typeof meta.served_by_colo === 'string' ? { served_by_colo: meta.served_by_colo } : {}),
        ...(typeof meta.served_by_primary === 'boolean' ? { served_by_primary: meta.served_by_primary } : {}),
      },
    } as D1Result<T>;
  }

  private async execute(statements: D1RpcStatement[]): Promise<D1RpcResult[]> {
    const body = JSON.stringify({ version: D1_RPC_VERSION, statements });
    const timestamp = Math.floor(this.clock() / 1_000).toString();
    const nonce = this.createNonce();
    if (!isD1RpcNonce(nonce)) throw new Error('D1 RPC nonce generator returned an invalid UUID v4.');
    const signature = await signD1RpcRequest(this.secret, timestamp, nonce, body);
    const response = await this.request(this.endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        [CLOUDFLARE_ACCESS_SERVICE_HEADERS.clientId]: this.accessClientId,
        [CLOUDFLARE_ACCESS_SERVICE_HEADERS.clientSecretHeader]: this.accessClientSecret,
        [D1_RPC_HEADERS.timestamp]: timestamp,
        [D1_RPC_HEADERS.nonce]: nonce,
        [D1_RPC_HEADERS.signature]: signature,
      },
      body,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 16 * 1024 * 1024) {
      throw new Error('FREE CRM D1 RPC response exceeded the 16 MiB safety limit.');
    }
    const responseText = await response.text();
    if (new TextEncoder().encode(responseText).byteLength > 16 * 1024 * 1024) {
      throw new Error('FREE CRM D1 RPC response exceeded the 16 MiB safety limit.');
    }
    const envelope = parseEnvelope(responseText);
    if (envelope.requestId !== nonce) throw new Error('FREE CRM D1 RPC returned a mismatched request identifier.');
    if (!response.ok || !envelope.ok) {
      if (!envelope.ok && /^[a-z0-9_]{1,64}$/.test(envelope.error.code) && typeof envelope.error.message === 'string' && envelope.error.message.length <= 256) {
        throw new Error(`FREE CRM D1 RPC ${envelope.error.code}: ${envelope.error.message}`);
      }
      throw new Error(`FREE CRM D1 RPC request failed with status ${response.status}.`);
    }
    if (!Array.isArray(envelope.results) || envelope.results.length !== statements.length || !envelope.results.every(validRpcResult)) {
      throw new Error('FREE CRM D1 RPC returned an incomplete or invalid database result.');
    }
    return envelope.results;
  }
}
