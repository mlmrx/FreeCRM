import { createHash } from 'node:crypto';
import { DeleteObjectCommand, DeleteObjectsCommand, GetBucketPolicyStatusCommand, GetBucketVersioningCommand, GetObjectCommand, GetObjectLockConfigurationCommand, GetPublicAccessBlockCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { boundedStorageBytes, S3TenantObjectStorage, type S3StorageClient } from '@/server/s3-storage';
import { tenantEpochObjectKey } from '@/server/object-storage';
import type { S3StorageConfiguration } from '@/server/storage-config';

type Command = DeleteObjectCommand | DeleteObjectsCommand | GetBucketPolicyStatusCommand | GetBucketVersioningCommand | GetObjectCommand | GetObjectLockConfigurationCommand | GetPublicAccessBlockCommand | ListObjectsV2Command | PutObjectCommand;
type Overrides = Record<string, (command: Command) => unknown | Promise<unknown>>;
const configuration: S3StorageConfiguration = { provider: 's3', endpoint: 'https://synthetic-storage.example', region: 'test-1', bucket: 'synthetic-private', credentials: { accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret' }, maxBytes: 1024 };
const flags = { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true };
const options = { contentType: 'text/plain', contentDisposition: 'attachment; filename="file.txt"' };
const invalidMetadata: Record<string, string>[] = [{ workspaceId: 'foreign' }, { 'freecrm-sha256': 'reserved' }, { RecordId: 'one', recordid: 'two' }, { 'invalid key': 'value' }, { value: 'non-ASCII界' }, { value: 'x'.repeat(257) }];
const bytes = (value: string) => new TextEncoder().encode(value);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const failure = (name: string, status = 503) => Object.assign(new Error('Synthetic provider failure; do not expose provider diagnostics'), { name, $metadata: { httpStatusCode: status } });
const stream = (value: string) => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes(value)); controller.close(); } });
function object(value = 'hello', overrides: Record<string, unknown> = {}) {
  return { Body: { transformToWebStream: () => stream(value) }, ContentLength: bytes(value).length, Metadata: { workspaceid: 'tenant-a', 'freecrm-sha256': digest(value) }, ETag: 'provider-etag-is-not-an-integrity-proof', ContentType: options.contentType, ContentDisposition: options.contentDisposition, ...overrides };
}
function harness(overrides: Overrides = {}, config: S3StorageConfiguration = configuration) {
  const calls: Command[] = [];
  const send = vi.fn(async (command: Command) => {
    calls.push(command);
    const override = overrides[command.constructor.name];
    if (override) return override(command);
    if (command instanceof GetPublicAccessBlockCommand) return { PublicAccessBlockConfiguration: flags };
    if (command instanceof GetBucketVersioningCommand) return {};
    if (command instanceof GetBucketPolicyStatusCommand) return { PolicyStatus: { IsPublic: false } };
    if (command instanceof GetObjectLockConfigurationCommand) throw failure('ObjectLockConfigurationNotFoundError', 404);
    if (command instanceof GetObjectCommand) throw failure('NoSuchKey', 404);
    if (command instanceof PutObjectCommand || command instanceof DeleteObjectCommand) return {};
    if (command instanceof DeleteObjectsCommand) return { Deleted: command.input.Delete?.Objects };
    if (command instanceof ListObjectsV2Command) return { IsTruncated: false, Contents: [] };
    throw new Error('Unexpected command');
  });
  return { storage: new S3TenantObjectStorage(config, { send } as unknown as S3StorageClient), calls, send };
}
const dataCalls = (calls: Command[]) => calls.filter((command) => command instanceof PutObjectCommand || command instanceof GetObjectCommand || command instanceof DeleteObjectCommand || command instanceof DeleteObjectsCommand || command instanceof ListObjectsV2Command);

describe('S3 fail-closed private bucket verification', () => {
  it('checks all four bucket controls before any object request, on every operation', async () => {
    const { storage, calls } = harness();
    await storage.get('tenant-a', 'record/file');
    await storage.delete('tenant-a', 'record/file');
    expect(calls.map((command) => command.constructor.name)).toEqual([
      'GetPublicAccessBlockCommand', 'GetBucketVersioningCommand', 'GetBucketPolicyStatusCommand', 'GetObjectLockConfigurationCommand', 'GetObjectCommand',
      'GetPublicAccessBlockCommand', 'GetBucketVersioningCommand', 'GetBucketPolicyStatusCommand', 'GetObjectLockConfigurationCommand', 'DeleteObjectCommand',
    ]);
    expect(calls.every((command) => command.input.Bucket === configuration.bucket)).toBe(true);
  });

  it.each(Object.keys(flags))('requires %s to be literally true', async (flag) => {
    for (const invalid of [false, undefined, 'true', 1, null]) {
      const { storage, calls } = harness({ GetPublicAccessBlockCommand: () => ({ PublicAccessBlockConfiguration: { ...flags, [flag]: invalid } }) });
      await expect(storage.get('tenant-a', 'record/file')).rejects.toMatchObject({ status: 503, code: 'storage_privacy_unverified' });
      expect(dataCalls(calls)).toEqual([]);
    }
  });

  it.each(['GetPublicAccessBlockCommand', 'GetBucketVersioningCommand', 'GetBucketPolicyStatusCommand', 'GetObjectLockConfigurationCommand'])('rejects unsupported or unavailable %s', async (commandName) => {
    for (const error of [failure('NotImplemented', 501), failure('AccessDenied', 403), new Error('synthetic unreachable endpoint')]) {
      const { storage, calls } = harness({ [commandName]: () => { throw error; } });
      await expect(storage.delete('tenant-a', 'record/file')).rejects.toMatchObject({ code: 'storage_privacy_unverified' });
      expect(dataCalls(calls)).toEqual([]);
    }
  });

  it.each([
    ['GetPublicAccessBlockCommand', {}], ['GetPublicAccessBlockCommand', null],
    ['GetBucketVersioningCommand', { Status: 'Enabled' }], ['GetBucketVersioningCommand', { Status: 'Suspended' }], ['GetBucketVersioningCommand', { MFADelete: 'Disabled' }],
    ['GetBucketPolicyStatusCommand', {}], ['GetBucketPolicyStatusCommand', { PolicyStatus: { IsPublic: true } }], ['GetBucketPolicyStatusCommand', { PolicyStatus: { IsPublic: 'false' } }],
    ['GetObjectLockConfigurationCommand', {}], ['GetObjectLockConfigurationCommand', { ObjectLockConfiguration: {} }], ['GetObjectLockConfigurationCommand', { ObjectLockConfiguration: { ObjectLockEnabled: 'Enabled' } }],
  ])('rejects malformed or incompatible %s response %j', async (commandName, response) => {
    const { storage, calls } = harness({ [commandName as string]: () => response });
    await expect(storage.deleteWorkspacePage('tenant-a', 1)).rejects.toMatchObject({ code: 'storage_privacy_unverified' });
    expect(dataCalls(calls)).toEqual([]);
  });

  it('accepts only the precise absent-policy and absent-lock 404 responses', async () => {
    const { storage } = harness({ GetBucketPolicyStatusCommand: () => { throw failure('NoSuchBucketPolicy', 404); } });
    await expect(storage.assertReady()).resolves.toBeUndefined();
    for (const [commandName, name] of [['GetBucketPolicyStatusCommand', 'NoSuchBucketPolicy'], ['GetObjectLockConfigurationCommand', 'ObjectLockConfigurationNotFoundError']]) {
      for (const error of [failure(name, 500), Object.assign(new Error(), { name }), failure('NotFound', 404)]) {
        await expect(harness({ [commandName]: () => { throw error; } }).storage.assertReady()).rejects.toMatchObject({ code: 'storage_privacy_unverified' });
      }
    }
  });

  it('does not recover a put after privacy has become unverifiable', async () => {
    let privacyChecks = 0;
    const { storage, calls } = harness({
      GetPublicAccessBlockCommand: () => ({ PublicAccessBlockConfiguration: ++privacyChecks === 1 ? flags : { ...flags, BlockPublicPolicy: false } }),
      PutObjectCommand: () => { throw failure('TimeoutError'); }, GetObjectCommand: () => object(),
    });
    await expect(storage.put('tenant-a', 'record/file', bytes('hello').buffer, options)).rejects.toMatchObject({ code: 'storage_privacy_unverified' });
    expect(calls.some((command) => command instanceof GetObjectCommand)).toBe(false);
  });
});

describe('S3 tenant keys and immutable uploads', () => {
  it('fences all object operations under the authenticated tenant and deduplicates a bounded deletion batch', async () => {
    const { storage, calls } = harness();
    const key = 'tenant-a/tenant-b/record/file';
    await expect(storage.put('tenant-a', 'tenant-b/record/file', bytes('hello').buffer, options)).resolves.toBe(key);
    await expect(storage.get('tenant-a', 'tenant-b/record/file')).resolves.toBeNull();
    await storage.delete('tenant-a', 'tenant-b/record/file');
    await storage.deleteMany('tenant-a', ['tenant-b/record/file', key]);
    for (const command of dataCalls(calls)) {
      if (command instanceof DeleteObjectsCommand) expect(command.input.Delete).toEqual({ Objects: [{ Key: key }], Quiet: false });
      else expect(command.input).toMatchObject({ Key: key });
    }
  });

  it.each(['../record/file', 'record/../file', 'record//file', '/record/file', 'record\\file', 'record/\0file', '~epoch/1/record/file', '~epoch/00009999999999999999/record/file', '~other/record/file', 'érecord/file', 'orphan'])('rejects noncanonical key %j without making provider calls', async (reference) => {
    const { storage, calls } = harness();
    await expect(storage.put('tenant-a', reference, bytes('x').buffer, options)).rejects.toMatchObject({ code: 'invalid_storage_key' });
    await expect(storage.get('tenant-a', reference)).rejects.toMatchObject({ code: 'invalid_storage_key' });
    await expect(storage.deleteMany('tenant-a', ['record/safe', reference])).rejects.toMatchObject({ code: 'invalid_storage_key' });
    expect(calls).toEqual([]);
  });

  it('enforces the full UTF-8 key limit while supporting Unicode filenames and fixed-width safe epochs', async () => {
    const { storage, calls } = harness();
    // Each path segment and the character count satisfy the shared contract;
    // multi-byte names still must fit S3's separate 1,024-byte total limit.
    const oversized = `record/${'界'.repeat(200)}/${'界'.repeat(200)}`;
    await expect(storage.get('tenant-a', oversized)).rejects.toMatchObject({ code: 'invalid_storage_key' });
    expect(calls).toEqual([]);
    const maximum = `record/${'界'.repeat(200)}/${'界'.repeat(135)}ab`;
    expect(bytes(`tenant-a/${maximum}`).length).toBe(1024);
    await expect(storage.get('tenant-a', `${maximum}c`)).rejects.toMatchObject({ code: 'invalid_storage_key' });
    await expect(storage.get('tenant-a', maximum)).resolves.toBeNull();
    const key = tenantEpochObjectKey('tenant-a', Number.MAX_SAFE_INTEGER, 'record/会議.txt');
    await expect(storage.put('tenant-a', key, bytes('x').buffer, options)).resolves.toBe(key);
    await expect(storage.get('../tenant', 'record/file')).rejects.toMatchObject({ code: 'invalid_storage_key' });
  });

  it('writes a conditional, privately scoped SHA-256 object without ACL or provider URL exposure', async () => {
    const { storage, calls } = harness();
    await storage.put('tenant-a', 'record/file', stream('hello'), { ...options, metadata: { RecordId: 'record' } });
    const command = calls.find((item) => item instanceof PutObjectCommand) as PutObjectCommand;
    expect(command.input).toMatchObject({ Key: 'tenant-a/record/file', Body: bytes('hello'), ContentLength: 5, IfNoneMatch: '*', Metadata: { recordid: 'record', workspaceid: 'tenant-a', 'freecrm-sha256': digest('hello') } });
    expect(command.input.ACL).toBeUndefined();
  });

  it.each(invalidMetadata)('rejects unsafe or ambiguous client metadata %j before provider calls', async (metadata) => {
    const { storage, calls } = harness();
    await expect(storage.put('tenant-a', 'record/file', bytes('x').buffer, { ...options, metadata })).rejects.toMatchObject({ code: 'invalid_storage_metadata' });
    expect(calls).toEqual([]);
  });

  it('bounds total custom metadata and encodes non-ASCII attachment filenames', async () => {
    const { storage, calls } = harness();
    await expect(storage.put('tenant-a', 'record/file', bytes('x').buffer, { ...options, metadata: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`field${i}`, 'x'.repeat(200)])) })).rejects.toMatchObject({ code: 'invalid_storage_metadata' });
    expect(calls).toEqual([]);
    await storage.put('tenant-a', 'record/file', bytes('x').buffer, { ...options, contentDisposition: 'attachment; filename="会議.txt"' });
    const command = calls.find((item) => item instanceof PutObjectCommand) as PutObjectCommand;
    expect(command.input.ContentDisposition).toBe(`attachment; filename="document"; filename*=UTF-8''${encodeURIComponent('会議.txt')}`);
  });

  it.each(['contentType', 'contentDisposition'] as const)('rejects HTTP response-splitting in %s before upload', async (header) => {
    const { storage, calls } = harness();
    await expect(storage.put('tenant-a', 'record/file', bytes('x').buffer, { ...options, [header]: 'valid\r\nx-injected: true' })).rejects.toMatchObject({ code: header === 'contentDisposition' ? 'invalid_storage_metadata' : 'storage_integrity_failed' });
    expect(calls).toEqual([]);
  });

  it.each(['界'.repeat(180), '😀'.repeat(180)])('reads back accepted long Unicode attachment headers without a smaller GET limit (%#)', async (filename) => {
    for (const uncertain of [false, true]) {
      let storedHeader: string | undefined;
      const { storage, calls } = harness({
        PutObjectCommand: (command) => {
          if (!(command instanceof PutObjectCommand)) throw new Error('Wrong command');
          storedHeader = command.input.ContentDisposition;
          if (uncertain) throw failure('TimeoutError');
          return {};
        },
        GetObjectCommand: () => object('hello', { ContentDisposition: storedHeader }),
      });
      await storage.put('tenant-a', 'record/file', bytes('hello').buffer, { ...options, contentDisposition: `attachment; filename="${filename}"` });
      const result = await storage.get('tenant-a', 'record/file');
      const headers = new Headers(); result?.applyHttpMetadata(headers);
      expect(headers.get('content-disposition')).toBe(storedHeader);
      expect(decodeURIComponent(storedHeader!.split("filename*=UTF-8''")[1])).toBe(filename);
      expect(await new Response(result?.body).text()).toBe('hello');
      expect(calls.filter((command) => command instanceof GetObjectCommand)).toHaveLength(uncertain ? 2 : 1);
    }
  });
});

describe('S3 bounded and authenticated object reads', () => {
  it('returns only digest-verified bytes and a SHA ETag, not the provider ETag', async () => {
    const { storage } = harness({ GetObjectCommand: () => object('hello') });
    const result = await storage.get('tenant-a', 'record/file');
    expect(result?.etag).toBe(`"${digest('hello')}"`);
    expect(await new Response(result?.body).text()).toBe('hello');
    const headers = new Headers(); result?.applyHttpMetadata(headers);
    expect(Object.fromEntries(headers)).toEqual({ 'content-type': 'text/plain', 'content-disposition': options.contentDisposition, 'content-length': '5' });
  });

  it.each([
    { Metadata: { workspaceid: 'tenant-b', 'freecrm-sha256': digest('hello') } },
    { Metadata: { workspaceid: 'tenant-a' } },
    { Metadata: { workspaceid: 'tenant-a', 'freecrm-sha256': digest('hello').toUpperCase() } },
    { Metadata: { workspaceid: 'tenant-a', 'freecrm-sha256': digest('different') }, ETag: digest('hello') },
    { ContentLength: undefined }, { ContentLength: -1 }, { ContentLength: 4 }, { ContentLength: 6 }, { ContentLength: 1.5 }, { ContentLength: 1025 },
    { VersionId: 'retained-version' }, { ContentType: 'text/plain\r\nx: y' }, { ContentDisposition: undefined }, { Body: undefined },
  ])('rejects unauthenticated, malformed or retained-version object %j', async (overrides) => {
    await expect(harness({ GetObjectCommand: () => object('hello', overrides) }).storage.get('tenant-a', 'record/file')).rejects.toMatchObject({ code: 'storage_integrity_failed' });
  });

  it('cancels oversized declared bodies without consuming their bytes', async () => {
    const cancel = vi.fn(); const pull = vi.fn();
    const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    const { storage } = harness({ GetObjectCommand: () => object('hello', { ContentLength: 1025, Body: { transformToWebStream: () => body } }) });
    await expect(storage.get('tenant-a', 'record/file')).rejects.toMatchObject({ code: 'storage_integrity_failed' });
    expect(cancel).toHaveBeenCalledOnce(); expect(pull).not.toHaveBeenCalled();
  });

  it('rejects a stream exceeding its runtime bound even when the declared length is small', async () => {
    const cancel = vi.fn(); let index = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(bytes(index++ ? 'overflow' : 'hello')); }, cancel });
    const { storage } = harness({ GetObjectCommand: () => object('hello', { Body: { transformToWebStream: () => body } }) }, { ...configuration, maxBytes: 5 });
    await expect(storage.get('tenant-a', 'record/file')).rejects.toMatchObject({ status: 413, code: 'storage_size_limit' });
    expect(cancel).toHaveBeenCalledOnce(); expect(body.locked).toBe(false);
  });

  it('recognizes real missing objects but not a provider failure merely named NoSuchKey', async () => {
    await expect(harness().storage.get('tenant-a', 'record/file')).resolves.toBeNull();
    for (const error of [failure('NoSuchKey', 500), Object.assign(new Error(), { name: 'NoSuchKey' }), failure('AccessDenied', 403), failure('NotFound', 404)]) {
      await expect(harness({ GetObjectCommand: () => { throw error; } }).storage.get('tenant-a', 'record/file')).rejects.toMatchObject({ code: 'object_storage_unavailable' });
    }
  });

  it('bounds array buffers and streamed uploads before making any provider calls', async () => {
    for (const body of [bytes('oversized').buffer, stream('oversized')]) {
      const { storage, calls } = harness({}, { ...configuration, maxBytes: 5 });
      await expect(storage.put('tenant-a', 'record/file', body, options)).rejects.toMatchObject({ status: 413, code: 'storage_size_limit' });
      expect(calls).toEqual([]);
    }
    await expect(boundedStorageBytes(stream('hello'), 5)).resolves.toEqual(bytes('hello'));
    await expect(boundedStorageBytes(new ArrayBuffer(0), 0)).resolves.toEqual(new Uint8Array(0));
  });

  it('cancels invalid streamed chunks and releases the reader lock', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue('not bytes'); }, cancel });
    await expect(boundedStorageBytes(body, 10)).rejects.toMatchObject({ code: 'storage_integrity_failed' });
    expect(cancel).toHaveBeenCalledOnce(); expect(body.locked).toBe(false);
  });

  it('bounds stalled stream reads even if the underlying cancellation never resolves', async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn(() => new Promise<void>(() => {}));
      const body = new ReadableStream<Uint8Array>({ cancel });
      const outcome = boundedStorageBytes(body, 10, 25).then(() => ({ code: 'unexpected_success' }), (error: unknown) => error);
      await vi.advanceTimersByTimeAsync(25);
      expect(await outcome).toMatchObject({ code: 'object_storage_unavailable' });
      expect(cancel).toHaveBeenCalledOnce(); expect(body.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('applies a total read deadline rather than resetting the budget for trickled chunks', async () => {
    vi.useFakeTimers();
    let interval: ReturnType<typeof setInterval> | undefined;
    try {
      const body = new ReadableStream<Uint8Array>({
        start(controller) { interval = setInterval(() => controller.enqueue(bytes('x')), 4); },
        cancel() { clearInterval(interval); },
      });
      const outcome = boundedStorageBytes(body, 100, 10).then(() => ({ code: 'unexpected_success' }), (error: unknown) => error);
      await vi.advanceTimersByTimeAsync(10);
      expect(await outcome).toMatchObject({ code: 'object_storage_unavailable' });
      expect(body.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
      await expect(boundedStorageBytes(stream('ok'), 2, 10)).resolves.toEqual(bytes('ok'));
      expect(vi.getTimerCount()).toBe(0);
    } finally { clearInterval(interval); vi.useRealTimers(); }
  });

  it('rejects invalid response headers promptly without awaiting an uncooperative body cancellation', async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn(() => new Promise<void>(() => {}));
      const body = new ReadableStream<Uint8Array>({ cancel });
      let outcome: unknown = 'pending';
      const { storage } = harness({ GetObjectCommand: () => object('hello', { ContentLength: 1025, Body: { transformToWebStream: () => body } }) });
      void storage.get('tenant-a', 'record/file').then(() => { outcome = 'unexpected_success'; }, (error: unknown) => { outcome = error; });
      await vi.advanceTimersByTimeAsync(1);
      expect(cancel).toHaveBeenCalledOnce();
      expect(outcome).toMatchObject({ code: 'storage_integrity_failed' });
    } finally { vi.useRealTimers(); }
  });
});

describe('S3 conditional uncertain-write recovery', () => {
  it.each(['TimeoutError', 'PreconditionFailed', 'InternalError'])('recovers %s only by reading and hashing the exact existing content', async (name) => {
    const { storage, calls } = harness({ PutObjectCommand: () => { throw failure(name); }, GetObjectCommand: () => object('hello') });
    await expect(storage.put('tenant-a', 'record/file', bytes('hello').buffer, options)).resolves.toBe('tenant-a/record/file');
    expect(calls.filter((command) => command instanceof PutObjectCommand)).toHaveLength(1);
    expect(calls.filter((command) => command instanceof GetObjectCommand)).toHaveLength(1);
    expect(calls.filter((command) => command instanceof GetPublicAccessBlockCommand)).toHaveLength(2);
    expect(calls.some((command) => command instanceof DeleteObjectCommand)).toBe(false);
  });

  it.each([
    ['missing content', () => { throw failure('NoSuchKey', 404); }],
    ['different bytes', () => object('other')],
    ['different content type', () => object('hello', { ContentType: 'application/pdf' })],
    ['different disposition', () => object('hello', { ContentDisposition: 'attachment' })],
  ])('does not confirm an uncertain write with %s or attempt an overwrite', async (_label, response) => {
    const { storage, calls } = harness({ PutObjectCommand: () => { throw failure('TimeoutError'); }, GetObjectCommand: response });
    await expect(storage.put('tenant-a', 'record/file', bytes('hello').buffer, options)).rejects.toMatchObject({ code: 'storage_put_unconfirmed' });
    const puts = calls.filter((command) => command instanceof PutObjectCommand);
    expect(puts).toHaveLength(1); expect(puts[0].input.IfNoneMatch).toBe('*');
    expect(calls.some((command) => command instanceof DeleteObjectCommand)).toBe(false);
  });

  it('does not trust matching caller metadata or provider ETag when recovery bytes were altered', async () => {
    const { storage } = harness({ PutObjectCommand: () => { throw failure('TimeoutError'); }, GetObjectCommand: () => object('other', { Metadata: { workspaceid: 'tenant-a', 'freecrm-sha256': digest('hello') }, ETag: digest('hello') }) });
    await expect(storage.put('tenant-a', 'record/file', bytes('hello').buffer, options)).rejects.toMatchObject({ code: 'storage_integrity_failed' });
  });
});

describe('S3 verified bounded deletion and reset epochs', () => {
  it('treats an empty batch as a no-op and rejects over-budget or invalid batches atomically', async () => {
    const { storage, calls } = harness();
    await storage.deleteMany('tenant-a', []);
    await expect(storage.deleteMany('tenant-a', Array.from({ length: 1001 }, (_, i) => `record/${i}`))).rejects.toMatchObject({ code: 'storage_batch_too_large' });
    for (const epoch of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) await expect(storage.deleteWorkspacePage('tenant-a', epoch)).rejects.toMatchObject({ code: 'invalid_storage_epoch' });
    expect(calls).toEqual([]);
  });

  it.each([
    { Deleted: [{ Key: 'tenant-a/record/a' }], Errors: [{ Key: 'tenant-a/record/b', Code: 'AccessDenied' }] },
    { Deleted: [{ Key: 'tenant-a/record/a' }] },
    { Deleted: [{ Key: 'tenant-a/record/a' }, { Key: 'tenant-a/record/a' }] },
    { Deleted: [{ Key: 'tenant-b/record/a' }, { Key: 'tenant-a/record/b' }] },
    { Deleted: [{ Key: 'tenant-a/record/a', DeleteMarker: true }, { Key: 'tenant-a/record/b' }] },
    { Deleted: [{ Key: 'tenant-a/record/a', VersionId: 'retained' }, { Key: 'tenant-a/record/b' }] },
    {},
  ])('keeps deletion unconfirmed on partial, foreign, duplicate or versioned results %j', async (response) => {
    await expect(harness({ DeleteObjectsCommand: () => response }).storage.deleteMany('tenant-a', ['record/a', 'record/b'])).rejects.toMatchObject({ code: 'storage_delete_incomplete' });
  });

  it.each([{ DeleteMarker: true }, { VersionId: 'retained-version' }])('rejects unsafe single-delete semantics %j', async (response) => {
    await expect(harness({ DeleteObjectCommand: () => response }).storage.delete('tenant-a', 'record/file')).rejects.toMatchObject({ code: 'object_storage_unavailable' });
  });

  it('retries the same partially deleted batch without assuming a timeout meant success', async () => {
    let attempt = 0;
    const { storage, calls } = harness({ DeleteObjectsCommand: (command) => {
      if (++attempt === 1) throw failure('TimeoutError');
      if (!(command instanceof DeleteObjectsCommand)) throw new Error('Wrong command');
      return { Deleted: command.input.Delete?.Objects };
    } });
    await expect(storage.deleteMany('tenant-a', ['record/a', 'record/b'])).rejects.toMatchObject({ code: 'storage_delete_incomplete' });
    await expect(storage.deleteMany('tenant-a', ['record/a', 'record/b'])).resolves.toBeUndefined();
    const attempts = calls.filter((command) => command instanceof DeleteObjectsCommand);
    expect(attempts[0].input).toEqual(attempts[1].input);
  });

  it('deletes legacy and older epochs while preserving current and newer uploads, even on a truncated page', async () => {
    const old = tenantEpochObjectKey('tenant-a', 1, 'record/old'); const current = tenantEpochObjectKey('tenant-a', 2, 'record/current'); const newer = tenantEpochObjectKey('tenant-a', 3, 'record/newer');
    const keys = ['tenant-a/legacy/file', old, current, newer];
    const { storage, calls } = harness({ ListObjectsV2Command: () => ({ Prefix: 'tenant-a/', IsTruncated: true, KeyCount: 4, Contents: keys.map((Key) => ({ Key })) }) });
    await expect(storage.deleteWorkspacePage('tenant-a', 2)).resolves.toEqual({ deleted: 2, complete: true });
    const listing = calls.find((command) => command instanceof ListObjectsV2Command) as ListObjectsV2Command;
    expect(listing.input).toEqual({ Bucket: configuration.bucket, Prefix: 'tenant-a/', MaxKeys: 1000 });
    const deletion = calls.find((command) => command instanceof DeleteObjectsCommand) as DeleteObjectsCommand;
    expect(deletion.input.Delete?.Objects).toEqual([{ Key: keys[0] }, { Key: old }]);
  });

  it('performs at most one 1,000-key listing and deletion per cleanup page', async () => {
    const keys = Array.from({ length: 1000 }, (_, i) => `tenant-a/record/${String(i).padStart(4, '0')}`);
    const { storage, calls } = harness({ ListObjectsV2Command: () => ({ IsTruncated: true, Contents: keys.map((Key) => ({ Key })) }) });
    await expect(storage.deleteWorkspacePage('tenant-a', 1)).resolves.toEqual({ deleted: 1000, complete: false });
    expect(calls.filter((command) => command instanceof ListObjectsV2Command)).toHaveLength(1);
    expect(calls.filter((command) => command instanceof DeleteObjectsCommand)).toHaveLength(1);
  });

  it.each([
    { IsTruncated: false, Contents: [{ Key: 'tenant-b/record/file' }] },
    { IsTruncated: false, Contents: [{ Key: 'tenant-a2/record/file' }] },
    { IsTruncated: false, Contents: [{ Key: 'tenant-a/record/b' }, { Key: 'tenant-a/record/a' }] },
    { IsTruncated: false, Contents: [{ Key: 'tenant-a/record/a' }, { Key: 'tenant-a/record/a' }] },
    { IsTruncated: false, Contents: [{ Key: 'tenant-a/~epoch/1/record/file' }] },
    { IsTruncated: false, Contents: [{ Key: 'tenant-a/界/file' }] },
    { IsTruncated: false, Contents: [{ Key: 'tenant-a/record/../file' }] },
    { IsTruncated: false, Contents: [{ Size: 1 }] },
    { IsTruncated: true, Contents: [] }, { Contents: [] },
    { IsTruncated: false, Prefix: 'tenant-b/', Contents: [] },
    { IsTruncated: false, KeyCount: 2, Contents: [{ Key: 'tenant-a/record/file' }] },
    { IsTruncated: false, Contents: Array.from({ length: 1001 }, (_, i) => ({ Key: `tenant-a/record/${i}` })) },
  ])('rejects unverified listings without deleting any keys (%#)', async (response) => {
    const { storage, calls } = harness({ ListObjectsV2Command: () => response });
    await expect(storage.deleteWorkspacePage('tenant-a', 2)).rejects.toMatchObject({ code: 'storage_listing_unverified' });
    expect(calls.some((command) => command instanceof DeleteObjectsCommand)).toBe(false);
  });

  it('validates the S3 UTF-8 byte order, not JavaScript UTF-16 or locale ordering', async () => {
    const keys = ['tenant-a/record/\uE000', 'tenant-a/record/😀'];
    const { storage } = harness({ ListObjectsV2Command: () => ({ IsTruncated: false, Contents: keys.map((Key) => ({ Key })) }) });
    await expect(storage.deleteWorkspacePage('tenant-a', 0)).resolves.toEqual({ deleted: 2, complete: true });
    await expect(harness({ ListObjectsV2Command: () => ({ IsTruncated: false, Contents: [...keys].reverse().map((Key) => ({ Key })) }) }).storage.deleteWorkspacePage('tenant-a', 0)).rejects.toMatchObject({ code: 'storage_listing_unverified' });
  });

  it('preserves an incomplete cleanup receipt and retries when one key was not deleted', async () => {
    let fail = true;
    const { storage } = harness({
      ListObjectsV2Command: () => ({ IsTruncated: false, Contents: [{ Key: 'tenant-a/record/file' }] }),
      DeleteObjectsCommand: () => fail ? { Errors: [{ Key: 'tenant-a/record/file', Code: 'InternalError' }] } : { Deleted: [{ Key: 'tenant-a/record/file' }] },
    });
    await expect(storage.deleteWorkspacePage('tenant-a', 1)).rejects.toMatchObject({ code: 'storage_delete_incomplete' });
    fail = false;
    await expect(storage.deleteWorkspacePage('tenant-a', 1)).resolves.toEqual({ deleted: 1, complete: true });
    await expect(harness().storage.deleteWorkspacePage('tenant-a', 0)).resolves.toEqual({ deleted: 0, complete: true });
  });
});
