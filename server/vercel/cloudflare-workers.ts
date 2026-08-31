import {
  BlobNotFoundError,
  del as deleteBlob,
  get as getBlob,
  head as headBlob,
  list as listBlobs,
  put as putBlob,
} from '@vercel/blob';
import { D1RpcDatabase } from './d1-rpc';

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the Vercel runtime.`);
  return value;
}

let database: D1Database | undefined;

function databaseBinding(): D1Database {
  database ??= new D1RpcDatabase({
    url: requiredEnvironment('FREE_CRM_D1_RPC_URL'),
    secret: requiredEnvironment('FREE_CRM_D1_RPC_SECRET'),
    accessClientId: requiredEnvironment('FREE_CRM_D1_ACCESS_CLIENT_ID'),
    accessClientSecret: requiredEnvironment('FREE_CRM_D1_ACCESS_CLIENT_SECRET'),
  }) as unknown as D1Database;
  return database;
}

function httpMetadata(contentType?: string, contentDisposition?: string): R2HTTPMetadata {
  return {
    contentType: contentType || 'application/octet-stream',
    contentDisposition: contentDisposition || undefined,
  };
}

const blobBucket = {
  async put(key: string, body: ReadableStream | ArrayBuffer, options?: R2PutOptions) {
    const metadata = options?.httpMetadata;
    const contentType = metadata && 'contentType' in metadata ? metadata.contentType : undefined;
    const blob = await putBlob(key, body, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType,
    });
    return {
      key: blob.pathname,
      version: blob.etag,
      size: 0,
      etag: blob.etag,
      httpEtag: blob.etag,
      uploaded: new Date(),
      checksums: {},
      writeHttpMetadata(headers: Headers) {
        if (blob.contentType) headers.set('content-type', blob.contentType);
        if (blob.contentDisposition) headers.set('content-disposition', blob.contentDisposition);
      },
    } as unknown as R2Object;
  },

  async get(key: string) {
    const result = await getBlob(key, { access: 'private' });
    if (!result || result.statusCode !== 200) return null;
    const metadata = httpMetadata(result.blob.contentType, result.blob.contentDisposition);
    return {
      key: result.blob.pathname,
      version: result.blob.etag,
      size: result.blob.size ?? 0,
      etag: result.blob.etag,
      httpEtag: result.blob.etag,
      uploaded: result.blob.uploadedAt,
      body: result.stream,
      bodyUsed: false,
      checksums: {},
      httpMetadata: metadata,
      customMetadata: {},
      writeHttpMetadata(headers: Headers) {
        if (metadata.contentType) headers.set('content-type', metadata.contentType);
        if (metadata.contentDisposition) headers.set('content-disposition', metadata.contentDisposition);
      },
    } as unknown as R2ObjectBody;
  },

  async head(key: string) {
    try {
      const blob = await headBlob(key);
      const metadata = httpMetadata(blob.contentType, blob.contentDisposition);
      return {
        key: blob.pathname,
        version: blob.etag,
        size: blob.size,
        etag: blob.etag,
        httpEtag: blob.etag,
        uploaded: blob.uploadedAt,
        checksums: {},
        httpMetadata: metadata,
        customMetadata: {},
        writeHttpMetadata(headers: Headers) {
          if (metadata.contentType) headers.set('content-type', metadata.contentType);
          if (metadata.contentDisposition) headers.set('content-disposition', metadata.contentDisposition);
        },
      } as unknown as R2Object;
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  },

  async delete(keys: string | string[]) {
    await deleteBlob(keys);
  },

  async list(options?: R2ListOptions) {
    const page = await listBlobs({
      prefix: options?.prefix,
      cursor: options?.cursor,
      limit: Math.min(options?.limit ?? 1_000, 1_000),
    });
    return {
      objects: page.blobs.map((blob) => ({
        key: blob.pathname,
        version: blob.etag,
        size: blob.size,
        etag: blob.etag,
        httpEtag: blob.etag,
        uploaded: blob.uploadedAt,
        checksums: {},
      })),
      truncated: page.hasMore,
      cursor: page.cursor,
      delimitedPrefixes: [],
    } as unknown as R2Objects;
  },
} as unknown as R2Bucket;

/**
 * Build-time replacement for `cloudflare:workers` in native Next.js builds.
 * The Worker/Vinext build keeps using the real Cloudflare module.
 */
export const env = {
  get DB(): D1Database {
    return databaseBinding();
  },
  get FILES(): R2Bucket {
    requiredEnvironment('BLOB_READ_WRITE_TOKEN');
    return blobBucket;
  },
  get FREE_CRM_LOCAL_MODE(): string | undefined {
    return process.env.FREE_CRM_LOCAL_MODE;
  },
  get FREE_CRM_AUTH_MODE(): string | undefined {
    return process.env.FREE_CRM_AUTH_MODE;
  },
  get FREE_CRM_ACCESS_TEAM_DOMAIN(): string | undefined {
    return process.env.FREE_CRM_ACCESS_TEAM_DOMAIN;
  },
  get FREE_CRM_ACCESS_AUD(): string | undefined {
    return process.env.FREE_CRM_ACCESS_AUD;
  },
  get FREE_CRM_OWNER_EMAIL(): string | undefined {
    return process.env.FREE_CRM_OWNER_EMAIL;
  },
};
