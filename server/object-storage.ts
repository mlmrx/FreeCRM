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
  deleteMany(workspaceId: string, references: readonly string[]): Promise<void>;
  deleteWorkspacePage(workspaceId: string, beforeMutationEpoch: number): Promise<{ deleted: number; complete: boolean }>;
}

const epochNamespace = '~epoch';
const epochWidth = 20;

export function tenantObjectPrefix(workspaceId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(workspaceId)) throw new ApiError(400, 'invalid_storage_key', 'Workspace storage identifier is invalid.');
  return `${workspaceId}/`;
}

export function tenantObjectKey(workspaceId: string, reference: string): string {
  const prefix = tenantObjectPrefix(workspaceId);
  const relative = reference.startsWith(prefix) ? reference.slice(prefix.length) : reference;
  if (!relative || relative.length > 900 || relative.startsWith('/') || relative.includes('\\') || relative.includes('\0')) throw new ApiError(400, 'invalid_storage_key', 'Object storage reference is invalid.');
  const segments = relative.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.length > 240)) throw new ApiError(400, 'invalid_storage_key', 'Object storage reference is invalid.');
  return `${prefix}${segments.join('/')}`;
}

export function tenantEpochObjectKey(workspaceId: string, mutationEpoch: number, reference: string): string {
  if (!Number.isSafeInteger(mutationEpoch) || mutationEpoch < 0) throw new ApiError(400, 'invalid_storage_epoch', 'Object storage epoch is invalid.');
  return tenantObjectKey(workspaceId, `${epochNamespace}/${String(mutationEpoch).padStart(epochWidth, '0')}/${reference}`);
}

function objectMutationEpoch(workspaceId: string, reference: string): number | null {
  const prefix = tenantObjectPrefix(workspaceId);
  const key = tenantObjectKey(workspaceId, reference);
  const match = key.slice(prefix.length).match(/^~epoch\/(\d{20})\//);
  if (!match) return null;
  const epoch = Number(match[1]);
  return Number.isSafeInteger(epoch) ? epoch : null;
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

  async deleteMany(workspaceId: string, references: readonly string[]): Promise<void> {
    if (references.length > 1_000) throw new ApiError(400, 'storage_batch_too_large', 'Object deletion batches are limited to 1,000 references.');
    if (!references.length) return;
    await this.bucket.delete(references.map((reference) => tenantObjectKey(workspaceId, reference)));
  }

  async deleteWorkspacePage(workspaceId: string, beforeMutationEpoch: number): Promise<{ deleted: number; complete: boolean }> {
    if (!Number.isSafeInteger(beforeMutationEpoch) || beforeMutationEpoch < 0) throw new ApiError(400, 'invalid_storage_epoch', 'Object storage epoch is invalid.');
    const prefix = tenantObjectPrefix(workspaceId);
    const page = await this.bucket.list({ prefix, limit: 1_000 });
    const keys = page.objects
      .map((object) => tenantObjectKey(workspaceId, object.key))
      .filter((key) => {
        const epoch = objectMutationEpoch(workspaceId, key);
        // Pre-epoch objects are legacy data and therefore precede every reset
        // boundary. Fixed-width epoch keys use a high-sorting namespace, so
        // every older product-owned key sorts before current-epoch keys.
        return epoch === null || epoch < beforeMutationEpoch;
      });
    if (keys.length) await this.bucket.delete(keys);
    const lastObject = page.objects.at(-1);
    const lastEpoch = lastObject ? objectMutationEpoch(workspaceId, lastObject.key) : null;
    const lastObjectWasEligible = Boolean(lastObject) && (lastEpoch === null || lastEpoch < beforeMutationEpoch);
    return { deleted: keys.length, complete: !page.truncated || !lastObjectWasEligible };
  }
}
