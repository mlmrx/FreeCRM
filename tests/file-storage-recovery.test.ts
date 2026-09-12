import { createHash } from 'node:crypto';
import { DeleteObjectCommand, GetBucketPolicyStatusCommand, GetBucketVersioningCommand, GetObjectCommand, GetObjectLockConfigurationCommand, GetPublicAccessBlockCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantObjectStorage } from '@/server/object-storage';
import { S3TenantObjectStorage, type S3StorageClient } from '@/server/s3-storage';
import { attachmentContentDisposition } from '@/server/file-headers';

const fixture = vi.hoisted(() => ({
  storage: null as TenantObjectStorage | null,
  batch: vi.fn(async () => Array.from({ length: 6 }, () => ({ success: true, meta: { changes: 1 } }))),
  cleaned: vi.fn(async () => undefined),
  pending: vi.fn(async () => undefined),
}));
vi.mock('@/db', () => ({ getD1: () => ({ prepare: () => ({ bind: () => ({}) }), batch: fixture.batch }) }));
vi.mock('@/server/control-plane', () => ({ ensureWorkspace: async () => ({ workspaceId: 'tenant-a', workspace: { role: 'owner', currency: 'USD' } }) }));
vi.mock('@/server/storage-provider', () => ({ getObjectStorage: () => fixture.storage }));
vi.mock('@/server/request-context', async (original) => ({
  ...await original<typeof import('@/server/request-context')>(),
  getRequestIdentity: async () => ({ userId: 'synthetic-owner', requestId: 'synthetic-request' }),
}));
vi.mock('@/server/capabilities', () => ({ requireCapability: async () => ({ limit: null }) }));
vi.mock('@/server/mutation-fence', async (original) => ({
  ...await original<typeof import('@/server/mutation-fence')>(),
  captureWorkspaceMutationEpoch: async () => 0,
  workspaceMutationFence: () => ({}),
}));
vi.mock('@/server/file-mutations', async (original) => ({
  ...await original<typeof import('@/server/file-mutations')>(),
  readFileMutationReceipt: async () => null,
  completeUploadReceiptStatement: () => ({}),
}));
vi.mock('@/server/upload-intents', async (original) => ({
  // Keep the actual durable upload orchestrator: failed storage must still
  // compensate or retain cleanup state, and must never finalize the record.
  ...await original<typeof import('@/server/upload-intents')>(),
  retryUploadIntentCleanup: async () => 0,
  claimDocumentUpload: async () => ({ status: 'claimed' }),
  markUploadIntentCleaned: fixture.cleaned,
  markUploadIntentCleanupPending: fixture.pending,
}));
import { POST } from '@/app/api/v1/files/route';

const name = 'Résumé.txt';
const content = 'synthetic file bytes';
const hash = createHash('sha256').update(content).digest('hex');
const body = () => new Response(content).body!;
const configuration = { provider: 's3' as const, endpoint: 'https://synthetic-storage.example', region: 'us-east-1', bucket: 'synthetic-private', credentials: { accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret' }, maxBytes: 1024 };
const providerError = (errorName: string, status: number) => Object.assign(new Error('Synthetic provider diagnostics must stay private'), { name: errorName, $metadata: { httpStatusCode: status } });

function s3(overrides: { contentType?: string; contentDisposition?: string; cleanupFails?: boolean } = {}) {
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof GetPublicAccessBlockCommand) return { PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true } };
    if (command instanceof GetBucketPolicyStatusCommand) return { PolicyStatus: { IsPublic: false } };
    if (command instanceof GetBucketVersioningCommand) return {};
    if (command instanceof GetObjectLockConfigurationCommand) throw providerError('ObjectLockConfigurationNotFoundError', 404);
    if (command instanceof PutObjectCommand) throw providerError('PreconditionFailed', 412);
    if (command instanceof GetObjectCommand) return {
      Body: { transformToWebStream: body },
      ContentLength: new TextEncoder().encode(content).length,
      Metadata: { workspaceid: 'tenant-a', 'freecrm-sha256': hash },
      ContentType: overrides.contentType ?? 'text/plain',
      ContentDisposition: overrides.contentDisposition ?? attachmentContentDisposition(name),
    };
    if (command instanceof DeleteObjectCommand) {
      if (overrides.cleanupFails) throw providerError('ServiceUnavailable', 503);
      return {};
    }
    throw new Error('Unexpected synthetic provider command');
  });
  const storage = new S3TenantObjectStorage(configuration, { send } as unknown as S3StorageClient);
  fixture.storage = storage;
  return { storage, send };
}

function upload() {
  const form = new FormData();
  form.set('file', new File([content], name, { type: 'text/plain' }));
  return POST(new Request('http://127.0.0.1/api/v1/files', { method: 'POST', body: form, headers: {
    'content-length': '1024',
    'idempotency-key': '00000000-0000-4000-8000-000000000001',
  } }));
}

describe('file route respects adapter-owned uncertain-write recovery', () => {
  beforeEach(() => { vi.clearAllMocks(); fixture.storage = null; });

  it.each([
    { contentType: 'text/csv' },
    { contentDisposition: 'attachment; filename="different.txt"' },
  ])('never converts S3 exact-header refusal into success based on matching bytes (%j)', async (headers) => {
    const { send } = s3(headers);
    const response = await upload();
    expect(response.status).toBe(503);
    const result = await response.json();
    expect(result).toMatchObject({ error: { code: 'storage_put_unconfirmed' } });
    expect(JSON.stringify(result)).not.toContain('Synthetic provider diagnostics');
    // Only the adapter's strict recovery read, not a second weaker route read.
    expect(send.mock.calls.filter(([command]) => command instanceof GetObjectCommand)).toHaveLength(1);
    expect(fixture.batch).not.toHaveBeenCalled();
    expect(send.mock.calls.filter(([command]) => command instanceof DeleteObjectCommand)).toHaveLength(1);
    expect(fixture.cleaned).toHaveBeenCalledOnce();
    expect(fixture.pending).not.toHaveBeenCalled();
  });

  it('retains the durable cleanup receipt if compensation after S3 refusal fails', async () => {
    s3({ contentType: 'text/csv', cleanupFails: true });
    const response = await upload();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'storage_put_unconfirmed' } });
    expect(fixture.batch).not.toHaveBeenCalled();
    expect(fixture.cleaned).not.toHaveBeenCalled();
    expect(fixture.pending).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ workspaceId: 'tenant-a', errorCode: 'upload_cleanup_failed' }));
  });

  it('accepts the actual S3 adapter receipt after exact bytes and canonical Unicode headers match', async () => {
    const { send } = s3();
    const response = await upload();
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ ok: true, result: { name } });
    expect(send.mock.calls.filter(([command]) => command instanceof GetObjectCommand)).toHaveLength(1);
    expect(send.mock.calls.filter(([command]) => command instanceof DeleteObjectCommand)).toHaveLength(0);
    expect(fixture.batch).toHaveBeenCalledOnce();
    expect(fixture.cleaned).not.toHaveBeenCalled();
  });

  it('preserves the default Blob-style byte recovery despite provider-selected disposition', async () => {
    const get = vi.fn(async () => ({ body: body(), etag: 'synthetic', applyHttpMetadata(headers: Headers) {
      headers.set('content-type', 'text/plain');
      headers.set('content-disposition', 'attachment; filename="blob"');
    } }));
    const remove = vi.fn(async () => undefined);
    fixture.storage = {
      put: async () => { throw new Error('Synthetic uncertain legacy upload'); },
      get, delete: remove, deleteMany: async () => undefined,
      deleteWorkspacePage: async () => ({ deleted: 0, complete: true }),
    };
    const response = await upload();
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ ok: true, result: { name } });
    expect(get).toHaveBeenCalledOnce();
    expect(fixture.batch).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
    expect(fixture.cleaned).not.toHaveBeenCalled();
    expect(fixture.pending).not.toHaveBeenCalled();
  });
});
