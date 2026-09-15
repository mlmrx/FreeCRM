import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { environment, getFiles, ready } = vi.hoisted(() => ({ environment: {} as Record<string, string>, getFiles: vi.fn(), ready: vi.fn() }));
vi.mock('cloudflare:workers', () => ({ env: environment }));
vi.mock('@/db', () => ({ getFiles }));
vi.mock('@/server/s3-storage', () => ({ S3TenantObjectStorage: class { assertReady = ready; } }));
import { assertObjectStorageReady, getObjectStorage, objectStorageLabel } from '@/server/storage-provider';
import { R2TenantObjectStorage } from '@/server/object-storage';
const s3 = () => Object.assign(environment, { FREE_CRM_OBJECT_STORAGE: 's3', FREE_CRM_S3_ENDPOINT: 'https://storage.example.test', FREE_CRM_S3_REGION: 'us-east-1', FREE_CRM_S3_BUCKET: 'example-private-bucket', FREE_CRM_S3_ACCESS_KEY_ID: 's3-test-only-access', FREE_CRM_S3_SECRET_ACCESS_KEY: 's3-test-only-secret' });
describe('explicit server-side storage provider selection', () => {
  beforeEach(() => { for (const key of Object.keys(environment)) delete environment[key]; vi.clearAllMocks(); ready.mockResolvedValue(undefined); });
  afterEach(() => vi.unstubAllEnvs());
  it('preserves native R2/local and private Blob defaults including readiness', async () => {
    const head = vi.fn().mockResolvedValue(null); getFiles.mockReturnValue({ head });
    expect(getObjectStorage()).toBeInstanceOf(R2TenantObjectStorage);
    expect(objectStorageLabel('device')).toBe('R2'); expect(objectStorageLabel('authjs')).toBe('private Vercel Blob');
    await assertObjectStorageReady(); expect(head).toHaveBeenCalledWith('__free_crm_readiness_probe__'); expect(ready).not.toHaveBeenCalled();
  });
  it('never touches missing R2 or Blob credentials when S3 is explicitly selected', async () => {
    s3(); getFiles.mockImplementation(() => { throw new Error('Default binding must remain lazy'); });
    expect(getObjectStorage()).not.toBeInstanceOf(R2TenantObjectStorage);
    expect(objectStorageLabel('authjs')).toBe('private S3-compatible storage');
    await assertObjectStorageReady(); expect(ready).toHaveBeenCalledOnce(); expect(getFiles).not.toHaveBeenCalled();
  });
  it('fails closed on unknown/incomplete selected configurations without falling back', () => {
    environment.FREE_CRM_OBJECT_STORAGE = 'unknown';
    expect(() => getObjectStorage()).toThrow(/configuration/);
    environment.FREE_CRM_OBJECT_STORAGE = 's3';
    expect(() => getObjectStorage()).toThrow(/configuration/); expect(getFiles).not.toHaveBeenCalled();
  });
  it('does not interpret unused S3 credentials as opting in', () => {
    environment.FREE_CRM_S3_ENDPOINT = 'malformed-unused-value'; getFiles.mockReturnValue({});
    expect(getObjectStorage()).toBeInstanceOf(R2TenantObjectStorage); expect(ready).not.toHaveBeenCalled();
  });
});
