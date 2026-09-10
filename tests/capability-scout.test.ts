import { afterEach, describe, expect, it, vi } from 'vitest';
import { capabilityScoutLimits, fetchCapabilityReleases } from '../server/capability-scout';

const vendorRelease = (changes: Record<string, unknown> = {}) => ({ id: 100, name: 'Calendar and contacts', tag_name: 'v1.0.0', body: 'Improve meetings and contacts.', html_url: 'https://github.com/twentyhq/twenty/releases/tag/v1.0.0', published_at: '2026-01-01T00:00:00Z', draft: false, prerelease: false, ...changes });
const response = (body: unknown, changes: ResponseInit = {}) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, ...changes });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('public capability scout', () => {
  it('fetches only a fixed public repository with no credentials or private context', async () => {
    const fetcher = vi.fn().mockResolvedValue(response([vendorRelease()]));
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchCapabilityReleases(['twenty', 'twenty']);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/twentyhq/twenty/releases?per_page=5&page=1');
    expect(options).toMatchObject({ method: 'GET', redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    expect(options.body).toBeUndefined();
    expect(options.headers).toEqual({ Accept: 'application/vnd.github+json', 'User-Agent': 'FREECRM-Capability-Scout' });
    expect(result.errors).toEqual([]);
    expect(result.releases[0]).toMatchObject({ id: 'twenty-100', projectId: 'twenty', publishedAt: '2026-01-01T00:00:00.000Z', topics: ['relationships'], suggestedPackIds: ['relationship-radar'] });
  });

  it('never requests arbitrary projects or attacker-controlled urls', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchCapabilityReleases(['https://internal.example/private', 'not-reviewed']);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.errors).toEqual([{ projectId: 'invalid-project', code: 'project_not_allowed' }, { projectId: 'not-reviewed', code: 'project_not_allowed' }]);
  });

  it('bounds projects, releases and body size without following pagination links', async () => {
    const values = Array.from({ length: 20 }, (_, id) => vendorRelease({ id: id + 1, body: 'contact '.repeat(3_000) }));
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response(values, { headers: { 'Content-Type': 'application/json', Link: '<https://evil.example>; rel="next"' } })));
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchCapabilityReleases(['twenty', 'unknown1', 'unknown2', 'unknown3', 'espocrm']);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.releases).toHaveLength(5);
    expect(result.releases.every((item) => item.body.length === capabilityScoutLimits.bodyCharacters)).toBe(true);
  });

  it('skips drafts, prereleases, future dates and invalid calendar dates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([vendorRelease({ id: 1, draft: true }), vendorRelease({ id: 2, prerelease: true }), vendorRelease({ id: 3, published_at: '2099-01-01T00:00:00Z' }), vendorRelease({ id: 4, published_at: '2026-02-31T00:00:00Z' }), vendorRelease({ id: 5 })])));
    const result = await fetchCapabilityReleases(['twenty']);
    expect(result.releases.map((item) => item.id)).toEqual(['twenty-5']);
    expect(result.errors).toEqual([{ projectId: 'twenty', code: 'invalid_release' }]);
  });

  it('deduplicates releases and leaves unmatched capabilities unclassified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([vendorRelease({ name: 'Build fixes', body: 'Dependency upgrades only.' }), vendorRelease()])));
    const result = await fetchCapabilityReleases(['twenty']);
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0]).toMatchObject({ topics: [], suggestedPackIds: [] });
  });

  it.each(['https://evil.example/releases/tag/v1', 'https://github.com/twentyhq/other/releases/tag/v1', 'https://github.com/twentyhq/twenty/releases/tag/v1?secret=x', 'https://github.com/twentyhq/twenty/releases/tag/%2e%2e/v1'])('rejects incorrect release provenance: %s', async (html_url) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([vendorRelease({ html_url })])));
    expect((await fetchCapabilityReleases(['twenty'])).releases).toEqual([]);
  });

  it.each([301, 302, 307, 308])('rejects redirects with status %s before parsing a response', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status, headers: { Location: 'http://169.254.169.254/latest/meta-data/' } }));
    vi.stubGlobal('fetch', fetcher);
    expect((await fetchCapabilityReleases(['twenty'])).errors[0].code).toBe('redirect_rejected');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects redirected responses even if a fetch implementation reports success', async () => {
    const redirected = response([vendorRelease()]);
    Object.defineProperty(redirected, 'redirected', { value: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(redirected));
    expect((await fetchCapabilityReleases(['twenty'])).errors[0].code).toBe('redirect_rejected');
  });

  it('rejects a successful response attributed to another endpoint', async () => {
    const redirected = response([vendorRelease()]);
    Object.defineProperty(redirected, 'url', { value: 'https://evil.example/data' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(redirected));
    expect((await fetchCapabilityReleases(['twenty'])).errors[0].code).toBe('redirect_rejected');
  });

  it.each([403, 429, 500])('returns bounded public failure codes for HTTP %s without leaking error bodies', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Sensitive provider diagnostics', { status })));
    const result = await fetchCapabilityReleases(['twenty']);
    expect(result).toEqual({ releases: [], errors: [{ projectId: 'twenty', code: status === 500 ? 'http_error' : 'rate_limited' }] });
  });

  it('keeps valid projects when one project fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => url.includes('/frappe/') ? Promise.reject(new Error('private error details')) : Promise.resolve(response([vendorRelease()]))));
    const result = await fetchCapabilityReleases(['twenty', 'frappe-crm']);
    expect(result.releases).toHaveLength(1);
    expect(result.errors).toEqual([{ projectId: 'frappe-crm', code: 'unavailable' }]);
  });

  it('enforces the declared response-size limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([], { headers: { 'Content-Type': 'application/json', 'Content-Length': String(capabilityScoutLimits.responseBytes + 1) } })));
    expect((await fetchCapabilityReleases(['twenty'])).errors[0].code).toBe('response_too_large');
  });

  it('enforces streamed response-size limits without trusting content length', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(capabilityScoutLimits.responseBytes + 1)); controller.close(); } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { headers: { 'Content-Type': 'application/json' } })));
    expect((await fetchCapabilityReleases(['twenty'])).errors[0].code).toBe('response_too_large');
  });

  it.each([new Response('not json', { headers: { 'Content-Type': 'application/json' } }), response({ releases: [] }), new Response('[]', { headers: { 'Content-Type': 'text/html' } })])('rejects malformed response bodies', async (invalid) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(invalid));
    expect((await fetchCapabilityReleases(['twenty'])).errors[0].code).toBe('invalid_response');
  });

  it('returns cancellation without starting a request if the caller already stopped', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    controller.abort();
    expect((await fetchCapabilityReleases(['twenty'], controller.signal)).errors[0].code).toBe('cancelled');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('times out stalled fetch implementations and aborts the request', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => undefined));
    vi.stubGlobal('fetch', fetcher);
    const pending = fetchCapabilityReleases(['twenty']);
    await vi.advanceTimersByTimeAsync(capabilityScoutLimits.timeoutMs);
    expect((await pending).errors[0].code).toBe('timeout');
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('times out a stalled streamed body as well as the initial fetch', async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { headers: { 'Content-Type': 'application/json' } })));
    const pending = fetchCapabilityReleases(['twenty']);
    await vi.advanceTimersByTimeAsync(capabilityScoutLimits.timeoutMs);
    expect((await pending).errors[0].code).toBe('timeout');
    expect(cancelled).toBe(true);
  });
});
