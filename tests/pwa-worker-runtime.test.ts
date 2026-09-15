import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const origin = 'http://127.0.0.1:3591';
const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
type WorkerRequest = { url: string; method: string; mode: string; redirect: string };
type WorkerFetchEvent = { request: WorkerRequest; respondWith: (value: Promise<Response>) => void };

function cachedDocument(path: string, redirected: boolean, body = '<h1>You are offline.</h1>') {
  // Model the real Cache API response from the Worker's /offline.html → /offline
  // redirect. Browser navigation acceptance is additionally tested by Playwright.
  const response = new Response(body, { headers: {
    'content-type': 'text/html; charset=utf-8', 'content-encoding': 'gzip',
    'content-length': '999', 'content-security-policy': "default-src 'none'",
  } });
  Object.defineProperties(response, {
    url: { value: new URL(path, origin).href }, type: { value: 'basic' }, redirected: { value: redirected },
  });
  return response;
}

function workerFixture(entries: Map<string, Response>) {
  let handler: ((event: WorkerFetchEvent) => void) | undefined;
  const match = vi.fn(async (key: string | WorkerRequest) => entries.get(typeof key === 'string' ? key : new URL(key.url).pathname));
  const fetch = vi.fn(async () => { throw new TypeError('Network disconnected'); });
  runInNewContext(source, {
    URL, Response, Headers, fetch, caches: { match },
    self: { location: { origin }, addEventListener: (name: string, callback: (event: WorkerFetchEvent) => void) => { if (name === 'fetch') handler = callback; } },
  });
  return {
    match, fetch,
    navigate(path: string, changes: Partial<WorkerRequest> = {}) {
      const respondWith = vi.fn<(value: Promise<Response>) => void>();
      handler!({ request: { url: new URL(path, origin).href, method: 'GET', mode: 'navigate', redirect: 'manual', ...changes }, respondWith });
      return respondWith;
    },
  };
}

describe('executed public service-worker navigation fallback', () => {
  it.each([false, true])('returns a fresh navigation-safe offline document after a cached redirect=%s', async (redirected) => {
    const fallback = cachedDocument(redirected ? '/offline' : '/offline.html', redirected);
    const worker = workerFixture(new Map([['/offline.html', fallback]]));
    const respond = worker.navigate('/insights/uncached-offline-fixture');
    expect(respond).toHaveBeenCalledOnce();
    const result = await respond.mock.calls[0][0];
    expect(result).not.toBe(fallback);
    expect(result.status).toBe(200);
    expect(result.redirected).toBe(false);
    expect(result.url).toBe('');
    expect(result.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(result.headers.get('content-security-policy')).toBe("default-src 'none'");
    expect(result.headers.has('content-encoding')).toBe(false);
    expect(result.headers.has('content-length')).toBe(false);
    expect(await result.text()).toBe('<h1>You are offline.</h1>');
  });

  it('uses the exact cached public page before the generic offline document', async () => {
    const page = cachedDocument('/how-it-works', false, '<h1>Public guide</h1>');
    const worker = workerFixture(new Map([['/how-it-works', page]]));
    const respond = worker.navigate('/how-it-works');
    expect(await respond.mock.calls[0][0]).toBe(page);
    expect(worker.match).toHaveBeenCalledTimes(1);
  });

  it('explicitly allows the public glossary without broadening adjacent paths', async () => {
    const page = cachedDocument('/glossary', false, '<h1>Public glossary</h1>');
    const worker = workerFixture(new Map([['/glossary', page]]));
    expect(await worker.navigate('/glossary').mock.calls[0][0]).toBe(page);
    expect(worker.navigate('/glossary-private')).not.toHaveBeenCalled();
  });

  it.each(['/workspace', '/workspace/record', '/brain', '/today', '/api/v1/bootstrap', '/auth/signin', '/start', '/insights-private'])('never intercepts private or non-allowlisted navigation %s', (path) => {
    const worker = workerFixture(new Map([['/offline.html', cachedDocument('/offline', true)]]));
    expect(worker.navigate(path)).not.toHaveBeenCalled();
    expect(worker.fetch).not.toHaveBeenCalled();
    expect(worker.match).not.toHaveBeenCalled();
  });

  it('never intercepts cross-origin navigation or mutations', () => {
    const worker = workerFixture(new Map());
    expect(worker.navigate('https://example.test/insights/article')).not.toHaveBeenCalled();
    expect(worker.navigate('/insights', { method: 'POST' })).not.toHaveBeenCalled();
    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it.each(['/auth/signin', '/workspace', 'https://example.test/offline'])('does not synthesize an offline document redirected to %s', async (path) => {
    const worker = workerFixture(new Map([['/offline.html', cachedDocument(path, true)]]));
    expect((await worker.navigate('/insights/article').mock.calls[0][0]).type).toBe('error');
  });

  it('returns an explicit network error when the offline document is unavailable', async () => {
    const worker = workerFixture(new Map());
    expect((await worker.navigate('/insights/article').mock.calls[0][0]).type).toBe('error');
  });
});
