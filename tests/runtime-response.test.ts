import { afterEach, describe, expect, it, vi } from 'vitest';
import { largeJsonResponse, largeTextResponse } from '@/server/runtime-response';

async function readResponseChunks(response: Response): Promise<{ body: string; chunks: number }> {
  const reader = response.body?.getReader();
  if (!reader) return { body: '', chunks: 0 };

  const decoder = new TextDecoder();
  let body = '';
  let chunks = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks += 1;
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  return { body, chunks };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('large runtime responses', () => {
  it('streams Vercel text in multiple exact UTF-8 chunks', async () => {
    vi.stubEnv('VERCEL', '1');
    // Put the first UTF-16 code unit of the eagle directly on a chunk boundary.
    const body = `${'a'.repeat((32 * 1024) - 1)}🦅${'b'.repeat(70_000)}`;
    const response = largeTextResponse(body, {
      status: 206,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-length': String(body.length),
        'x-test-header': 'preserved',
      },
    });

    const result = await readResponseChunks(response);
    expect(response.status).toBe(206);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('x-test-header')).toBe('preserved');
    expect(response.headers.get('content-length')).toBeNull();
    expect(result.chunks).toBeGreaterThan(1);
    expect(result.body).toBe(body);
  });

  it('streams Vercel JSON with the existing API headers and exact bytes', async () => {
    vi.stubEnv('VERCEL', '1');
    const data = { message: 'Celebrate love of CRM 🦅', values: Array.from({ length: 5_000 }, (_, index) => `record-${index}`) };
    const response = largeJsonResponse(data, { status: 202, headers: { 'x-test-header': 'preserved' } });

    const result = await readResponseChunks(response);
    expect(response.status).toBe(202);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-test-header')).toBe('preserved');
    expect(result.chunks).toBeGreaterThan(1);
    expect(result.body).toBe(JSON.stringify(data));
  });

  it('preserves the existing buffered contract outside Vercel', async () => {
    vi.stubEnv('VERCEL', '');
    const data = { ok: true, runtime: 'device-or-cloudflare' };
    const response = largeJsonResponse(data, { status: 201, headers: { 'x-test-header': 'preserved' } });

    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-test-header')).toBe('preserved');
    await expect(response.text()).resolves.toBe(JSON.stringify(data));
  });
});
