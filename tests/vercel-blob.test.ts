import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const blobSdk = vi.hoisted(() => {
  class BlobNotFoundError extends Error {}
  return {
    BlobNotFoundError,
    deleteBlob: vi.fn(),
    getBlob: vi.fn(),
    headBlob: vi.fn(),
    listBlobs: vi.fn(),
    putBlob: vi.fn(),
  };
});

vi.mock('@vercel/blob', () => ({
  BlobNotFoundError: blobSdk.BlobNotFoundError,
  del: blobSdk.deleteBlob,
  get: blobSdk.getBlob,
  head: blobSdk.headBlob,
  list: blobSdk.listBlobs,
  put: blobSdk.putBlob,
}));

import { env as vercelEnv } from '@/server/vercel/cloudflare-workers';

const blobTokenKey = ['BLOB', 'READ', 'WRITE', 'TOKEN'].join('_');
const originalBlobToken = process.env[blobTokenKey];

describe('private Vercel Blob R2 facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env[blobTokenKey] = ['vercel', 'blob', 'rw', 'test', 'only'].join('_');
  });

  afterAll(() => {
    if (originalBlobToken === undefined) delete process.env[blobTokenKey];
    else process.env[blobTokenKey] = originalBlobToken;
  });

  it('fails closed when the private store credential is missing', () => {
    delete process.env[blobTokenKey];
    expect(() => vercelEnv.FILES).toThrow('BLOB_READ_WRITE_TOKEN is required');
  });

  it('writes deterministic private objects and preserves response metadata', async () => {
    const uploadedAt = new Date('2026-08-31T12:00:00.000Z');
    blobSdk.putBlob.mockResolvedValue({
      pathname: 'tenant-a/~epoch/00000000000000000001/file-a/blob',
      etag: 'etag-a',
      contentType: 'application/pdf',
      contentDisposition: 'attachment',
      uploadedAt,
      url: 'https://private.example.invalid/file-a',
      downloadUrl: 'https://private.example.invalid/file-a?download=1',
    });
    const body = new ArrayBuffer(3);
    const key = 'tenant-a/~epoch/00000000000000000001/file-a/blob';

    const result = await vercelEnv.FILES.put(key, body, {
      httpMetadata: { contentType: 'application/pdf', contentDisposition: 'attachment; filename="report.pdf"' },
    });

    expect(blobSdk.putBlob).toHaveBeenCalledWith(key, body, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/pdf',
    });
    expect(result?.key).toBe(key);
    expect(result?.etag).toBe('etag-a');
  });

  it('reads private bytes without exposing a public URL and applies metadata', async () => {
    const stream = new ReadableStream<Uint8Array>();
    blobSdk.getBlob.mockResolvedValue({
      statusCode: 200,
      stream,
      headers: new Headers(),
      blob: {
        pathname: 'tenant-a/file-a',
        etag: 'etag-a',
        size: 23,
        uploadedAt: new Date('2026-08-31T12:00:00.000Z'),
        contentType: 'application/pdf',
        contentDisposition: 'attachment; filename="report.pdf"',
        cacheControl: 'private, no-store',
        url: 'https://private.example.invalid/file-a',
        downloadUrl: 'https://private.example.invalid/file-a?download=1',
      },
    });

    const result = await vercelEnv.FILES.get('tenant-a/file-a');

    expect(blobSdk.getBlob).toHaveBeenCalledWith('tenant-a/file-a', { access: 'private' });
    expect(result?.body).toBe(stream);
    expect(result).not.toHaveProperty('url');
    const headers = new Headers();
    result?.writeHttpMetadata(headers);
    expect(headers.get('content-type')).toBe('application/pdf');
    expect(headers.get('content-disposition')).toBe('attachment; filename="report.pdf"');
  });

  it('maps missing metadata to null and forwards bounded list/delete operations', async () => {
    blobSdk.headBlob.mockRejectedValue(new blobSdk.BlobNotFoundError());
    blobSdk.listBlobs.mockResolvedValue({
      blobs: [{
        pathname: 'tenant-a/file-a',
        etag: 'etag-a',
        size: 23,
        uploadedAt: new Date('2026-08-31T12:00:00.000Z'),
        url: 'https://private.example.invalid/file-a',
        downloadUrl: 'https://private.example.invalid/file-a?download=1',
      }],
      cursor: 'next-page',
      hasMore: true,
    });

    await expect(vercelEnv.FILES.head('tenant-a/missing')).resolves.toBeNull();
    const page = await vercelEnv.FILES.list({ prefix: 'tenant-a/', cursor: 'page-a', limit: 5_000 });
    await vercelEnv.FILES.delete(['tenant-a/file-a', 'tenant-a/file-b']);

    expect(blobSdk.listBlobs).toHaveBeenCalledWith({ prefix: 'tenant-a/', cursor: 'page-a', limit: 1_000 });
    expect(page.objects.map((object) => object.key)).toEqual(['tenant-a/file-a']);
    expect(page).toMatchObject({ truncated: true, cursor: 'next-page' });
    expect(blobSdk.deleteBlob).toHaveBeenCalledWith(['tenant-a/file-a', 'tenant-a/file-b']);
  });
});
