import { ApiError } from './request-context';

export type StoredObject = {
  body: ReadableStream;
  etag: string;
  applyHttpMetadata(headers: Headers): void;
};

export type PutObjectOptions = {
  contentType: string;
  contentDisposition: string;
  metadata?: Record<string, string>;
};

/** Provider-neutral tenant storage contract suitable for R2, local files, or S3. */
export interface TenantObjectStorage {
  put(workspaceId: string, reference: string, body: ReadableStream | ArrayBuffer, options: PutObjectOptions): Promise<string>;
  get(workspaceId: string, reference: string): Promise<StoredObject | null>;
  delete(workspaceId: string, reference: string): Promise<void>;
}

export function tenantObjectKey(workspaceId: string, reference: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(workspaceId)) throw new ApiError(400, 'invalid_storage_key', 'Workspace storage identifier is invalid.');
  const prefix = `${workspaceId}/`;
  const relative = reference.startsWith(prefix) ? reference.slice(prefix.length) : reference;
  if (!relative || relative.length > 900 || relative.startsWith('/') || relative.includes('\\') || relative.includes('\0')) throw new ApiError(400, 'invalid_storage_key', 'Object storage reference is invalid.');
  const segments = relative.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.length > 240)) throw new ApiError(400, 'invalid_storage_key', 'Object storage reference is invalid.');
  return `${prefix}${segments.join('/')}`;
}

export class R2TenantObjectStorage implements TenantObjectStorage {
  constructor(private readonly bucket: R2Bucket) {}

  async put(workspaceId: string, reference: string, body: ReadableStream | ArrayBuffer, options: PutObjectOptions): Promise<string> {
    const key = tenantObjectKey(workspaceId, reference);
    await this.bucket.put(key, body, {
      httpMetadata: { contentType: options.contentType, contentDisposition: options.contentDisposition },
      customMetadata: { ...options.metadata, workspaceId },
    });
    return key;
  }

  async get(workspaceId: string, reference: string): Promise<StoredObject | null> {
    const object = await this.bucket.get(tenantObjectKey(workspaceId, reference));
    if (!object) return null;
    return { body: object.body, etag: object.httpEtag, applyHttpMetadata: (headers) => object.writeHttpMetadata(headers) };
  }

  async delete(workspaceId: string, reference: string): Promise<void> {
    await this.bucket.delete(tenantObjectKey(workspaceId, reference));
  }
}
