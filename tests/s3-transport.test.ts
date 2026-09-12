import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedS3Fetch, boundedS3Request, S3TenantObjectStorage } from '@/server/s3-storage';
import type { S3StorageConfiguration } from '@/server/storage-config';

const configuration: S3StorageConfiguration = { provider: 's3', endpoint: 'https://synthetic-storage.example', region: 'us-east-1', bucket: 'synthetic-private', credentials: { accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret' }, maxBytes: 1024 };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('bounded, origin-confined S3 transport', () => {
  it('aborts a request that never completes, including an SDK XML collector', async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined;
    const pending = boundedS3Request((received) => { signal = received; return new Promise(() => {}); }, 20);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'object_storage_unavailable' });
    await vi.advanceTimersByTimeAsync(21); await assertion; expect(signal?.aborted).toBe(true);
  });
  it('clears deadlines on success and preserves immediate errors', async () => {
    vi.useFakeTimers();
    await expect(boundedS3Request(async () => 42)).resolves.toBe(42);
    await expect(boundedS3Request(async () => { throw new Error('synthetic'); })).rejects.toThrow('synthetic');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('sets manual redirects on actual SDK requests, so configured endpoint redirects are not followed', async () => {
    const requests: Request[] = [];
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => { requests.push(request); throw new TypeError('Synthetic redirect refusal'); }));
    await expect(new S3TenantObjectStorage(configuration).assertReady()).rejects.toMatchObject({ code: 'storage_privacy_unverified' });
    expect(requests.length).toBeGreaterThanOrEqual(4);
    expect(requests.every((request) => request.redirect === 'manual' && new URL(request.url).origin === configuration.endpoint)).toBe(true);
  });
  it.each([301, 302, 303, 307, 308])('refuses status %i without following or hanging on body cancellation', async (status) => {
    const network = vi.fn(async () => new Response(new ReadableStream({ cancel: () => new Promise(() => {}) }), { status, headers: { location: 'https://foreign.example/object' } }));
    vi.stubGlobal('fetch', network);
    await expect(boundedS3Fetch(configuration.bucket, 1024)(new Request(`${configuration.endpoint}/${configuration.bucket}`, { redirect: 'manual' }))).rejects.toMatchObject({ code: 'object_storage_unavailable' });
    expect(network).toHaveBeenCalledOnce();
  });
  it('caps object response bodies before the SDK consumes them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(1025))));
    await expect(boundedS3Fetch(configuration.bucket, 1024)(`${configuration.endpoint}/${configuration.bucket}/tenant/record/blob`)).rejects.toMatchObject({ code: 'storage_size_limit' });
  });
  it('caps bucket-control XML independently at 8 MiB, allowing escaped maximal keys', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(8 * 1024 * 1024 + 1))));
    await expect(boundedS3Fetch(configuration.bucket, 10 * 1024 * 1024)(`${configuration.endpoint}/${configuration.bucket}?list-type=2`)).rejects.toMatchObject({ code: 'storage_size_limit' });
  });
  it('preserves response status, headers and exact bytes, including empty responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('synthetic', { status: 200, headers: { 'content-type': 'application/xml' } })));
    const response = await boundedS3Fetch(configuration.bucket, 1024)(`${configuration.endpoint}/${configuration.bucket}`);
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('application/xml'); expect(await response.text()).toBe('synthetic');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    expect((await boundedS3Fetch(configuration.bucket, 1024)(`${configuration.endpoint}/${configuration.bucket}`)).status).toBe(204);
  });
});
