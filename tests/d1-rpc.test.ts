import { describe, expect, it, vi } from 'vitest';

import {
  D1_RPC_HEADERS,
  D1_RPC_INTERNAL_MUTATION_STATEMENTS,
  D1_RPC_MAX_BATCH_STATEMENTS,
  D1_RPC_NONCE_PRUNE_LIMIT,
  D1_RPC_NONCE_RETENTION_SECONDS,
  D1_RPC_PROVIDER_MAX_QUERIES,
  D1_RPC_VERSION,
  decodeD1RpcSecret,
  signD1RpcRequest,
  verifyD1RpcRequestSignature,
} from '@/lib/d1-rpc-protocol';
import { CLOUDFLARE_ACCESS_SERVICE_HEADERS, D1RpcDatabase } from '@/server/vercel/d1-rpc';
import d1RpcWorker from '@/workers/d1-rpc';

const secret = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const endpoint = 'https://free-crm-d1-rpc.example.workers.dev/v1/d1';
const fixedNonce = '11111111-1111-4111-8111-111111111111';
const fixedNow = 2_000_000_000_000;
const accessClientId = '0123456789abcdef0123456789abcdef.access';
const accessClientSecret = ['synthetic', 'cloudflare', 'access', 'service', 'value'].join('-');
const accessCredentials = { accessClientId, accessClientSecret };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function result(results: unknown[] = [], changes = 0): D1Result<unknown> {
  return {
    success: true,
    results,
    meta: {
      duration: 1,
      size_after: 1,
      rows_read: results.length,
      rows_written: changes,
      last_row_id: 0,
      changed_db: changes > 0,
      changes,
    },
  };
}

async function signedWorkerRequest(
  payload: unknown,
  options: { nonce?: string; timestamp?: string; signature?: string } = {},
) {
  const body = JSON.stringify(payload);
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1_000).toString();
  const nonce = options.nonce ?? crypto.randomUUID();
  const signature = options.signature ?? await signD1RpcRequest(decodeD1RpcSecret(secret), timestamp, nonce, body);
  return new Request(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [D1_RPC_HEADERS.timestamp]: timestamp,
      [D1_RPC_HEADERS.nonce]: nonce,
      [D1_RPC_HEADERS.signature]: signature,
    },
    body,
  });
}

type FakeStatement = {
  sql: string;
  params: unknown[];
  bind: (...params: unknown[]) => FakeStatement;
};

function fakeDatabase(batchImplementation?: (statements: FakeStatement[]) => Promise<D1Result<unknown>[]>) {
  const batch = vi.fn(async (statements: FakeStatement[]) => (
    batchImplementation ? batchImplementation(statements) : statements.map(() => result())
  ));
  const database = {
    prepare(sql: string): FakeStatement {
      const statement: FakeStatement = {
        sql,
        params: [],
        bind(...params: unknown[]) {
          return { ...statement, params };
        },
      };
      return statement;
    },
    batch,
  } as unknown as D1Database;
  return { database, batch };
}

describe('Vercel D1 RPC adapter', () => {
  it('signs one request, preserves bindings, and maps the real D1 result shape', async () => {
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      const body = String(init?.body);
      const headers = new Headers(init?.headers);
      expect(headers.get(CLOUDFLARE_ACCESS_SERVICE_HEADERS.clientId)).toBe(accessClientId);
      expect(headers.get(CLOUDFLARE_ACCESS_SERVICE_HEADERS.clientSecretHeader)).toBe(accessClientSecret);
      await expect(verifyD1RpcRequestSignature(
        decodeD1RpcSecret(secret),
        headers.get(D1_RPC_HEADERS.timestamp) ?? '',
        headers.get(D1_RPC_HEADERS.nonce) ?? '',
        body,
        headers.get(D1_RPC_HEADERS.signature) ?? '',
      )).resolves.toBe(true);
      expect(JSON.parse(body)).toEqual({
        version: D1_RPC_VERSION,
        statements: [{
          sql: 'SELECT id FROM records WHERE workspace_id=? AND archived_at IS ?',
          params: ['workspace-1', null],
        }],
      });
      return jsonResponse({
        ok: true,
        version: D1_RPC_VERSION,
        requestId: headers.get(D1_RPC_HEADERS.nonce),
        results: [{ success: true, results: [{ id: 'record-1' }], meta: { rows_read: 1 } }],
      });
    });
    const db = new D1RpcDatabase({ url: endpoint, secret, ...accessCredentials, fetch: request, now: () => fixedNow, nonce: () => fixedNonce });

    const response = await db.prepare('SELECT id FROM records WHERE workspace_id=? AND archived_at IS ?')
      .bind('workspace-1', null)
      .all<{ id: string }>();

    expect(response.results).toEqual([{ id: 'record-1' }]);
    expect(response.meta.rows_read).toBe(1);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('submits one atomic batch, serializes binary values, and rejects foreign statements', async () => {
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(JSON.parse(String(init?.body)).statements).toEqual([
        { sql: 'INSERT INTO records(id) VALUES (?)', params: [[1, 2, 255]] },
        { sql: 'SELECT COUNT(*) AS count FROM records', params: [] },
      ]);
      return jsonResponse({
        ok: true,
        version: D1_RPC_VERSION,
        requestId: headers.get(D1_RPC_HEADERS.nonce),
        results: [
          { success: true, results: [], meta: { changes: 1 } },
          { success: true, results: [{ count: 1 }], meta: {} },
        ],
      });
    });
    const config = { url: endpoint, secret, ...accessCredentials, fetch: request, now: () => fixedNow, nonce: () => fixedNonce };
    const db = new D1RpcDatabase(config);
    const other = new D1RpcDatabase(config);
    const statements = [
      db.prepare('INSERT INTO records(id) VALUES (?)').bind(new Uint8Array([1, 2, 255])),
      db.prepare('SELECT COUNT(*) AS count FROM records'),
    ];

    const results = await db.batch(statements as unknown as D1PreparedStatement[]);
    expect(results[0].meta.changes).toBe(1);
    expect(results[1].results).toEqual([{ count: 1 }]);
    await expect(db.batch([other.prepare('SELECT 1') as unknown as D1PreparedStatement])).rejects.toThrow('same adapter');
  });

  it('reserves two of the Workers Free 50-query budget for mutation replay safety', async () => {
    expect(D1_RPC_PROVIDER_MAX_QUERIES).toBe(50);
    expect(D1_RPC_INTERNAL_MUTATION_STATEMENTS).toBe(2);
    expect(D1_RPC_MAX_BATCH_STATEMENTS).toBe(48);
    const request = vi.fn<typeof fetch>();
    const db = new D1RpcDatabase({ url: endpoint, secret, ...accessCredentials, fetch: request, now: () => fixedNow, nonce: () => fixedNonce });
    const statements = Array.from(
      { length: D1_RPC_MAX_BATCH_STATEMENTS + 1 },
      () => db.prepare('SELECT 1') as unknown as D1PreparedStatement,
    );

    await expect(db.batch(statements)).rejects.toThrow('cannot exceed 48 statements');
    expect(request).not.toHaveBeenCalled();
  });

  it('fails closed on invalid configuration and untrusted response envelopes', async () => {
    expect(() => new D1RpcDatabase({ url: 'http://example.com/v1/d1', secret, ...accessCredentials })).toThrow('HTTPS');
    expect(() => new D1RpcDatabase({ url: endpoint, secret: 'too-short', ...accessCredentials })).toThrow('32-byte secret');
    expect(() => new D1RpcDatabase({ url: endpoint, secret, accessClientId: '', accessClientSecret })).toThrow('FREE_CRM_D1_ACCESS_CLIENT_ID');
    expect(() => new D1RpcDatabase({ url: endpoint, secret, accessClientId, accessClientSecret: ['contains', 'whitespace'].join(' ') })).toThrow('FREE_CRM_D1_ACCESS_CLIENT_SECRET');
    const request = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      ok: true,
      version: D1_RPC_VERSION,
      requestId: '22222222-2222-4222-8222-222222222222',
      results: [{ success: true, results: [], meta: {} }],
    }));
    const db = new D1RpcDatabase({ url: endpoint, secret, ...accessCredentials, fetch: request, now: () => fixedNow, nonce: () => fixedNonce });
    await expect(db.prepare('SELECT 1').first()).rejects.toThrow('mismatched request identifier');
  });
});

describe('user-owned D1 RPC Worker', () => {
  it('verifies the signature and executes the complete request through one D1 batch', async () => {
    const { database, batch } = fakeDatabase(async () => [
      result([], 100),
      result([], 1),
      result([], 1),
      result([{ value: 'ok' }]),
    ]);
    const request = await signedWorkerRequest({
      version: D1_RPC_VERSION,
      statements: [
        { sql: 'INSERT INTO records(id) VALUES (?)', params: ['record-1'] },
        { sql: "SELECT CASE WHEN ?='yes' THEN 'ok;still-one-statement' END AS value", params: ['yes'] },
      ],
    });

    const response = await d1RpcWorker.fetch(request, { DB: database, FREE_CRM_D1_RPC_SECRET: secret });
    const body = await response.json() as { ok: boolean; results: D1Result<unknown>[] };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.results[1].results).toEqual([{ value: 'ok' }]);
    expect(body.results).toHaveLength(2);
    expect(batch).toHaveBeenCalledTimes(1);
    const submitted = batch.mock.calls[0][0] as unknown as FakeStatement[];
    expect(submitted).toHaveLength(4);
    expect(submitted[0].sql).toContain('DELETE FROM d1_rpc_nonce_claims');
    expect(submitted[0].sql).toContain('LIMIT ?');
    expect(submitted[0].params[1]).toBe(D1_RPC_NONCE_PRUNE_LIMIT);
    expect(submitted[1].sql).toContain('INSERT INTO d1_rpc_nonce_claims');
    expect(submitted[1].params[0]).toBe(request.headers.get(D1_RPC_HEADERS.nonce));
    expect(submitted[1].params[2]).toBe(Number(submitted[1].params[1]) + D1_RPC_NONCE_RETENTION_SECONDS);
    expect(submitted.slice(2).map((statement) => [statement.sql, statement.params])).toEqual([
      ['INSERT INTO records(id) VALUES (?)', ['record-1']],
      ["SELECT CASE WHEN ?='yes' THEN 'ok;still-one-statement' END AS value", ['yes']],
    ]);
  });

  it('does not spend D1 writes on an all-read batch', async () => {
    const { database, batch } = fakeDatabase(async () => [result([{ value: 1 }])]);
    const request = await signedWorkerRequest({
      version: D1_RPC_VERSION,
      statements: [{ sql: 'SELECT 1 AS value', params: [] }],
    }, { nonce: '33333333-3333-4333-8333-333333333333' });

    const response = await d1RpcWorker.fetch(request, { DB: database, FREE_CRM_D1_RPC_SECRET: secret });

    expect(response.status).toBe(200);
    const submitted = batch.mock.calls[0][0] as unknown as FakeStatement[];
    expect(submitted.map((statement) => statement.sql)).toEqual(['SELECT 1 AS value']);
  });

  it('returns a stable conflict when D1 atomically rejects a mutation nonce across isolates', async () => {
    const claimed = new Set<string>();
    const { database, batch } = fakeDatabase(async (statements) => {
      const nonce = String(statements[1].params[0]);
      if (claimed.has(nonce)) throw new Error('D1_ERROR: d1_rpc_nonce_replayed');
      claimed.add(nonce);
      return statements.map(() => result());
    });
    const payload = {
      version: D1_RPC_VERSION,
      statements: [{ sql: 'UPDATE records SET name=? WHERE id=?', params: ['Safe', 'record-1'] }],
    };
    const nonce = '44444444-4444-4444-8444-444444444444';
    const first = await signedWorkerRequest(payload, { nonce });
    const replay = await signedWorkerRequest(payload, { nonce });

    expect((await d1RpcWorker.fetch(first, { DB: database, FREE_CRM_D1_RPC_SECRET: secret })).status).toBe(200);
    const replayResponse = await d1RpcWorker.fetch(replay, { DB: database, FREE_CRM_D1_RPC_SECRET: secret });
    expect(replayResponse.status).toBe(409);
    await expect(replayResponse.json()).resolves.toMatchObject({
      ok: false,
      requestId: nonce,
      error: { code: 'replayed_request', message: 'Request nonce was already used.' },
    });
    expect(batch).toHaveBeenCalledTimes(2);
  });

  it('rejects bad signatures and stale timestamps before D1 is touched', async () => {
    const { database, batch } = fakeDatabase();
    const badSignature = await signedWorkerRequest({
      version: D1_RPC_VERSION,
      statements: [{ sql: 'SELECT 1', params: [] }],
    }, { signature: `v1=${'A'.repeat(43)}` });
    const staleTimestamp = (Math.floor(Date.now() / 1_000) - 301).toString();
    const stale = await signedWorkerRequest({
      version: D1_RPC_VERSION,
      statements: [{ sql: 'SELECT 1', params: [] }],
    }, { timestamp: staleTimestamp });

    expect((await d1RpcWorker.fetch(badSignature, { DB: database, FREE_CRM_D1_RPC_SECRET: secret })).status).toBe(401);
    expect((await d1RpcWorker.fetch(stale, { DB: database, FREE_CRM_D1_RPC_SECRET: secret })).status).toBe(401);
    expect(batch).not.toHaveBeenCalled();
  });

  it('cancels a chunked request stream as soon as the body crosses the 1 MiB limit', async () => {
    const { database, batch } = fakeDatabase();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(600 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const timestamp = Math.floor(Date.now() / 1_000).toString();
    const request = new Request(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [D1_RPC_HEADERS.timestamp]: timestamp,
        [D1_RPC_HEADERS.nonce]: crypto.randomUUID(),
        [D1_RPC_HEADERS.signature]: `v1=${'A'.repeat(43)}`,
      },
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const response = await d1RpcWorker.fetch(request, { DB: database, FREE_CRM_D1_RPC_SECRET: secret });

    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(batch).not.toHaveBeenCalled();
  });

  it('allows only strict, parameterized data-plane request shapes', async () => {
    const { database, batch } = fakeDatabase();
    const requests = await Promise.all([
      signedWorkerRequest({ version: D1_RPC_VERSION, statements: [{ sql: 'DROP TABLE records', params: [] }] }),
      signedWorkerRequest({ version: D1_RPC_VERSION, statements: [{ sql: 'SELECT 1; DELETE FROM records', params: [] }] }),
      signedWorkerRequest({ version: D1_RPC_VERSION, statements: [{ sql: 'SELECT ?', params: [[256]] }] }),
      signedWorkerRequest({ version: D1_RPC_VERSION, statements: [{ sql: 'SELECT 1 -- comment', params: [] }] }),
    ]);

    for (const request of requests) {
      const response = await d1RpcWorker.fetch(request, { DB: database, FREE_CRM_D1_RPC_SECRET: secret });
      expect(response.status).toBe(400);
    }
    expect(batch).not.toHaveBeenCalled();
  });

  it('returns only allowlisted constraint tokens from D1 failures', async () => {
    const { database } = fakeDatabase(async () => {
      throw new Error('D1_ERROR: workspace_mutation_epoch_stale; SQL contained private_table_name');
    });
    const request = await signedWorkerRequest({
      version: D1_RPC_VERSION,
      statements: [{ sql: 'INSERT INTO audit_events(id) VALUES (?)', params: ['event-1'] }],
    });

    const response = await d1RpcWorker.fetch(request, { DB: database, FREE_CRM_D1_RPC_SECRET: secret });
    const body = await response.json() as { error: { code: string; message: string } };

    expect(response.status).toBe(503);
    expect(body.error).toEqual({ code: 'database_error', message: 'workspace_mutation_epoch_stale' });
    expect(JSON.stringify(body)).not.toContain('private_table_name');
  });

  it('preserves the safe authorization-race token for Vercel retry handling', async () => {
    const { database } = fakeDatabase(async () => {
      throw new Error('D1_ERROR: agent authorization is no longer valid');
    });
    const request = await signedWorkerRequest({
      version: D1_RPC_VERSION,
      statements: [{ sql: 'UPDATE agent_runs SET status=? WHERE workspace_id=? AND id=?', params: ['authorized', 'workspace-1', 'run-1'] }],
    });

    const response = await d1RpcWorker.fetch(request, { DB: database, FREE_CRM_D1_RPC_SECRET: secret });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'database_error', message: 'agent authorization is no longer valid' },
    });
  });
});
