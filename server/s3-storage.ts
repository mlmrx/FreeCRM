import { DeleteObjectCommand, DeleteObjectsCommand, GetBucketPolicyStatusCommand, GetBucketVersioningCommand, GetObjectCommand, GetObjectLockConfigurationCommand, GetPublicAccessBlockCommand, ListObjectsV2Command, PutObjectCommand, S3Client, type GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { FetchHttpHandler } from '@smithy/fetch-http-handler';
import { ApiError } from './request-context';
import { tenantObjectKey, tenantObjectPrefix, type PutObjectOptions, type StoredObject, type TenantObjectStorage } from './object-storage';
import type { S3StorageConfiguration } from './storage-config';
import { MAX_CONTENT_DISPOSITION_LENGTH, normalizeContentDisposition } from './file-headers';

export type S3StorageClient = Pick<S3Client, 'send'>;
const privateFlags = ['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'] as const;
const unavailable = () => new ApiError(503, 'object_storage_unavailable', 'Private object storage is unavailable. Retry after the server-side configuration or service has recovered.');
const integrity = () => new ApiError(503, 'storage_integrity_failed', 'Object storage returned content that did not match its authenticated integrity metadata.');
const code = (error: unknown) => error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
const statusCode = (error: unknown) => error && typeof error === 'object' && '$metadata' in error ? (error.$metadata as { httpStatusCode?: number })?.httpStatusCode : undefined;
/** Includes SDK XML collection and retries, not only arrival of response headers. */
export async function boundedS3Request<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, timeoutMs); });
  try { return await Promise.race([operation(controller.signal), deadline]); }
  finally { clearTimeout(timer); }
}
/** Bound SDK XML bodies too; its default collector otherwise has no byte cap. */
export function boundedS3Fetch(bucket: string, maximum: number): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init); const response = await fetch(request);
    // workerd supports manual, not redirect:error. Never follow the location.
    if (response.status >= 300 && response.status < 400 || response.type === 'opaqueredirect') {
      void response.body?.cancel().catch(() => {}); throw unavailable();
    }
    if (!response.body) return response;
    const path = new URL(request.url).pathname;
    // 1,000 maximal UTF-8 keys may expand further through XML entity escaping.
    const limit = path === `/${bucket}` || path === `/${bucket}/` ? 8 * 1024 * 1024 : maximum;
    const bytes = await boundedStorageBytes(response.body, limit);
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}
function canonicalKey(workspaceId: string, reference: string) {
  const key = tenantObjectKey(workspaceId, reference);
  const relative = key.slice(tenantObjectPrefix(workspaceId).length);
  if (new TextEncoder().encode(key).byteLength > 1024) throw new ApiError(400, 'invalid_storage_key', 'S3 object keys cannot exceed 1,024 UTF-8 bytes.');
  if (relative.startsWith('~')) {
    const match = relative.match(/^~epoch\/(\d{20})\/[^/]+\/.+$/);
    if (!match || !Number.isSafeInteger(Number(match[1]))) throw new ApiError(400, 'invalid_storage_key', 'The reserved mutation-epoch namespace must use canonical product keys.');
  } else if (!/^[A-Za-z0-9][A-Za-z0-9:_-]*\//.test(relative)) {
    throw new ApiError(400, 'invalid_storage_key', 'Legacy S3 keys require an ASCII product-record directory; arbitrary bucket contents are not supported.');
  }
  return key;
}
function epoch(workspaceId: string, key: string): number | null {
  const match = key.slice(tenantObjectPrefix(workspaceId).length).match(/^~epoch\/(\d{20})\//);
  return match ? Number(match[1]) : null;
}
function safeHeader(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) throw integrity();
  return value;
}
export async function boundedStorageBytes(body: ReadableStream | ArrayBuffer, maximum: number, timeoutMs = 10000): Promise<Uint8Array<ArrayBuffer>> {
  if (body instanceof ArrayBuffer) {
    if (body.byteLength > maximum) throw new ApiError(413, 'storage_size_limit', 'Object exceeds this runtime’s bounded file size limit.');
    return new Uint8Array(body);
  }
  if (!body || typeof body.getReader !== 'function') throw integrity();
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(unavailable()), timeoutMs); });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]); if (done) break;
      if (!(value instanceof Uint8Array)) throw integrity();
      total += value.byteLength;
      if (total > maximum) throw new ApiError(413, 'storage_size_limit', 'Object exceeds this runtime’s bounded file size limit.');
      chunks.push(value);
    }
  } catch (error) { void reader.cancel().catch(() => {}); throw error; }
  finally { clearTimeout(timer); reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
async function sha256(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function metadata(options: PutObjectOptions, workspaceId: string, digest: string) {
  const result: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(options.metadata ?? {})) {
    const key = rawKey.toLowerCase();
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(key) || ['workspaceid', 'freecrm-sha256'].includes(key) || Object.hasOwn(result, key) || typeof value !== 'string' || value.length > 256 || /[^\x20-\x7e]/.test(value)) throw new ApiError(400, 'invalid_storage_metadata', 'Object metadata must use bounded, unambiguous ASCII keys and values.');
    result[key] = value;
  }
  result.workspaceid = workspaceId; result['freecrm-sha256'] = digest;
  if (JSON.stringify(result).length > 1800) throw new ApiError(400, 'invalid_storage_metadata', 'Object metadata exceeds the supported size.');
  return result;
}
function byteOrder(a: string, b: string) {
  const left = new TextEncoder().encode(a); const right = new TextEncoder().encode(b);
  for (let index = 0; index < Math.min(left.length, right.length); index++) if (left[index] !== right[index]) return left[index] - right[index];
  return left.length - right.length;
}

/** Private general-purpose buckets only. Never uses ACLs, presigned URLs, or SDK credential discovery. */
export class S3TenantObjectStorage implements TenantObjectStorage {
  readonly handlesPutRecovery = true as const;
  private readonly client: S3StorageClient;
  constructor(private readonly config: S3StorageConfiguration, client?: S3StorageClient) {
    this.client = client ?? new S3Client({ endpoint: config.endpoint, region: config.region, credentials: config.credentials, forcePathStyle: true, maxAttempts: 2,
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', followRegionRedirects: false,
      requestHandler: new FetchHttpHandler({ requestTimeout: 10000, requestInit: () => ({ redirect: 'manual' }), customFetch: boundedS3Fetch(config.bucket, config.maxBytes) }) });
  }
  async assertReady(): Promise<void> {
    try {
      const Bucket = this.config.bucket;
      const [block, versioning, status, lock] = await Promise.all([
        boundedS3Request((signal) => this.client.send(new GetPublicAccessBlockCommand({ Bucket }), { abortSignal: signal })), boundedS3Request((signal) => this.client.send(new GetBucketVersioningCommand({ Bucket }), { abortSignal: signal })),
        boundedS3Request((signal) => this.client.send(new GetBucketPolicyStatusCommand({ Bucket }), { abortSignal: signal })).catch((error: unknown) => {
          if (code(error) === 'NoSuchBucketPolicy' && statusCode(error) === 404) return { PolicyStatus: { IsPublic: false } };
          throw error;
        }), boundedS3Request((signal) => this.client.send(new GetObjectLockConfigurationCommand({ Bucket }), { abortSignal: signal })).catch((error: unknown) => {
          if (code(error) === 'ObjectLockConfigurationNotFoundError' && statusCode(error) === 404) return null;
          throw error;
        }),
      ]);
      if (privateFlags.some((flag) => block.PublicAccessBlockConfiguration?.[flag] !== true) || versioning.Status !== undefined || versioning.MFADelete !== undefined
        || status.PolicyStatus?.IsPublic !== false || lock !== null) throw unavailable();
    } catch { throw new ApiError(503, 'storage_privacy_unverified', 'Storage privacy or safe cleanup semantics could not be verified. Require all four public-access blocks, a private bucket policy, and no versioning or Object Lock.'); }
  }
  private async readObject(workspaceId: string, key: string) {
    let object: GetObjectCommandOutput;
    try { object = await boundedS3Request((signal) => this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }), { abortSignal: signal })); }
    catch (error) { if (code(error) === 'NoSuchKey' && statusCode(error) === 404) return null; throw unavailable(); }
    const body = object.Body?.transformToWebStream();
    if (!body) throw integrity();
    if (!Number.isSafeInteger(object.ContentLength) || object.ContentLength! < 0 || object.ContentLength! > this.config.maxBytes || object.Metadata?.workspaceid !== workspaceId || !/^[0-9a-f]{64}$/.test(object.Metadata?.['freecrm-sha256'] ?? '') || object.VersionId && object.VersionId !== 'null') {
      void body.cancel().catch(() => {}); throw integrity();
    }
    const bytes = await boundedStorageBytes(body, this.config.maxBytes);
    const digest = await sha256(bytes);
    if (bytes.byteLength !== object.ContentLength || digest !== object.Metadata!['freecrm-sha256']) throw integrity();
    const contentType = safeHeader(object.ContentType, 256); const contentDisposition = safeHeader(object.ContentDisposition, MAX_CONTENT_DISPOSITION_LENGTH);
    if (/[^\x20-\x7e]/.test(contentDisposition)) throw integrity();
    return { bytes, digest, contentType, contentDisposition };
  }
  async put(workspaceId: string, reference: string, body: ReadableStream | ArrayBuffer, options: PutObjectOptions): Promise<string> {
    const key = canonicalKey(workspaceId, reference);
    const bytes = await boundedStorageBytes(body, this.config.maxBytes); const digest = await sha256(bytes);
    const contentType = safeHeader(options.contentType, 256);
    const contentDisposition = normalizeContentDisposition(options.contentDisposition);
    const custom = metadata(options, workspaceId, digest);
    await this.assertReady();
    try {
      const response = await boundedS3Request((signal) => this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: bytes, ContentLength: bytes.byteLength, ContentType: contentType, ContentDisposition: contentDisposition, Metadata: custom, IfNoneMatch: '*' }), { abortSignal: signal }));
      if (response.VersionId && response.VersionId !== 'null') throw integrity();
    } catch {
      // Conditional creation can commit before its response is observed. Never
      // treat an ETag or user metadata alone as proof of the stored content.
      await this.assertReady();
      const existing = await this.readObject(workspaceId, key);
      if (!existing || existing.digest !== digest || existing.contentType !== contentType || existing.contentDisposition !== contentDisposition) throw new ApiError(503, 'storage_put_unconfirmed', 'Upload could not be confirmed for this exact content. Retry the original operation; no overwrite was attempted.');
    }
    return key;
  }
  async get(workspaceId: string, reference: string): Promise<StoredObject | null> {
    const key = canonicalKey(workspaceId, reference); await this.assertReady();
    const object = await this.readObject(workspaceId, key); if (!object) return null;
    return { body: new ReadableStream({ start(controller) { controller.enqueue(object.bytes); controller.close(); } }), etag: `"${object.digest}"`, applyHttpMetadata(headers) { headers.set('content-type', object.contentType); headers.set('content-disposition', object.contentDisposition); headers.set('content-length', String(object.bytes.byteLength)); } };
  }
  async delete(workspaceId: string, reference: string): Promise<void> {
    const key = canonicalKey(workspaceId, reference); await this.assertReady();
    try { const response = await boundedS3Request((signal) => this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }), { abortSignal: signal })); if (response.DeleteMarker || response.VersionId && response.VersionId !== 'null') throw unavailable(); }
    catch { throw unavailable(); }
  }
  private async deleteKeys(keys: string[]) {
    if (!keys.length) return;
    try {
      const result = await boundedS3Request((signal) => this.client.send(new DeleteObjectsCommand({ Bucket: this.config.bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: false } }), { abortSignal: signal }));
      const deleted = result.Deleted ?? [];
      if (result.Errors?.length || deleted.length !== keys.length || new Set(deleted.map((item) => item.Key)).size !== keys.length || deleted.some((item) => !item.Key || !keys.includes(item.Key) || item.DeleteMarker || item.VersionId && item.VersionId !== 'null')) throw unavailable();
    } catch { throw new ApiError(503, 'storage_delete_incomplete', 'One or more object deletions are unconfirmed. Keep the cleanup receipt and retry the same bounded batch.'); }
  }
  async deleteMany(workspaceId: string, references: readonly string[]): Promise<void> {
    if (references.length > 1000) throw new ApiError(400, 'storage_batch_too_large', 'Object deletion batches are limited to 1,000 references.');
    const keys = [...new Set(references.map((reference) => canonicalKey(workspaceId, reference)))];
    if (!keys.length) return; await this.assertReady(); await this.deleteKeys(keys);
  }
  async deleteWorkspacePage(workspaceId: string, beforeMutationEpoch: number): Promise<{ deleted: number; complete: boolean }> {
    if (!Number.isSafeInteger(beforeMutationEpoch) || beforeMutationEpoch < 0) throw new ApiError(400, 'invalid_storage_epoch', 'Object storage epoch is invalid.');
    const prefix = tenantObjectPrefix(workspaceId); await this.assertReady();
    try {
      const page = await boundedS3Request((signal) => this.client.send(new ListObjectsV2Command({ Bucket: this.config.bucket, Prefix: prefix, MaxKeys: 1000 }), { abortSignal: signal }));
      const contents = page.Contents ?? [];
      if (contents.length > 1000 || typeof page.IsTruncated !== 'boolean' || page.Prefix !== undefined && page.Prefix !== prefix || page.IsTruncated && !contents.length || page.KeyCount !== undefined && page.KeyCount !== contents.length) throw unavailable();
      const keys = contents.map((item) => { if (typeof item.Key !== 'string' || !item.Key.startsWith(prefix) || canonicalKey(workspaceId, item.Key) !== item.Key) throw unavailable(); return item.Key; });
      if (keys.some((key, index) => index > 0 && byteOrder(keys[index - 1], key) >= 0)) throw unavailable();
      const eligible = keys.filter((key) => { const value = epoch(workspaceId, key); return value === null || value < beforeMutationEpoch; });
      await this.deleteKeys(eligible);
      const last = keys.at(-1); const lastEpoch = last ? epoch(workspaceId, last) : null;
      return { deleted: eligible.length, complete: !page.IsTruncated || lastEpoch !== null && lastEpoch >= beforeMutationEpoch };
    } catch (error) { if (error instanceof ApiError && error.code === 'storage_delete_incomplete') throw error; throw new ApiError(503, 'storage_listing_unverified', 'The bounded tenant listing could not be verified. No unverified or foreign keys will be deleted.'); }
  }
}
