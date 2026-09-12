import { describe, expect, it } from 'vitest';
import { storageConfiguration, type StorageEnvironment } from '@/server/storage-config';

const environment: StorageEnvironment = {
  FREE_CRM_OBJECT_STORAGE: 's3', FREE_CRM_S3_ENDPOINT: 'https://synthetic-storage.example/', FREE_CRM_S3_REGION: 'test-1', FREE_CRM_S3_BUCKET: 'synthetic-private', FREE_CRM_S3_ACCESS_KEY_ID: 's3-test-only-access', FREE_CRM_S3_SECRET_ACCESS_KEY: 's3-test-only-secret',
};
const credentialedEndpoint = new URL('https://storage.example');
credentialedEndpoint.username = 'test-only-user';
credentialedEndpoint.password = 'test-only-password';

describe('explicit server-only S3 configuration', () => {
  it.each([undefined, '', 'default'])('preserves the default adapter for selector %j without touching S3 credentials', (provider) => {
    expect(storageConfiguration({ FREE_CRM_OBJECT_STORAGE: provider, FREE_CRM_S3_ENDPOINT: 'malformed' })).toEqual({ provider: 'default' });
  });

  it('uses only explicit credentials and normalizes the endpoint origin with runtime upload bounds', () => {
    expect(storageConfiguration(environment)).toEqual({ provider: 's3', endpoint: 'https://synthetic-storage.example', region: 'test-1', bucket: 'synthetic-private', credentials: { accessKeyId: 's3-test-only-access', secretAccessKey: 's3-test-only-secret' }, maxBytes: 10 * 1024 * 1024 });
    expect(storageConfiguration({ ...environment, FREE_CRM_S3_SESSION_TOKEN: 's3-test-only-session' }, true)).toMatchObject({ maxBytes: 4 * 1024 * 1024, credentials: { sessionToken: 's3-test-only-session' } });
  });

  it.each(['S3', 'r2', 'blob', 'auto', ' s3'])('rejects unknown selector %j instead of silently falling back', (provider) => {
    expect(() => storageConfiguration({ ...environment, FREE_CRM_OBJECT_STORAGE: provider })).toThrow(expect.objectContaining({ status: 503, code: 'storage_configuration_invalid' }));
  });

  it.each(['FREE_CRM_S3_ENDPOINT', 'FREE_CRM_S3_REGION', 'FREE_CRM_S3_BUCKET', 'FREE_CRM_S3_ACCESS_KEY_ID', 'FREE_CRM_S3_SECRET_ACCESS_KEY'] as const)('requires bounded explicit %s with no whitespace/control ambiguity', (key) => {
    for (const value of [undefined, '', ' leading', 'trailing ', 'line\nbreak', 'x'.repeat(4097)]) {
      expect(() => storageConfiguration({ ...environment, [key]: value })).toThrow(expect.objectContaining({ code: 'storage_configuration_invalid' }));
    }
  });

  it.each(['http://storage.example', credentialedEndpoint.toString(), 'https://storage.example/path', 'https://storage.example/?query=value', 'https://storage.example/#hash', 'https://bucket.s3express-test.example', 'https://localhost:9000', 'file:///storage'])('rejects unsupported endpoint %s', (endpoint) => {
    expect(() => storageConfiguration({ ...environment, FREE_CRM_S3_ENDPOINT: endpoint })).toThrow(expect.objectContaining({ code: 'storage_configuration_invalid' }));
  });

  it.each(['ab', 'UPPERCASE', 'bad..name', '127.0.0.1', 'private--x-s3', 'private-s3alias', 'private--ol-s3', 'private.mrap', 'private--table-s3'])('rejects invalid or unsupported bucket %s', (bucket) => {
    expect(() => storageConfiguration({ ...environment, FREE_CRM_S3_BUCKET: bucket })).toThrow(expect.objectContaining({ code: 'storage_configuration_invalid' }));
  });

  it('requires the full explicit local-only opt-in and a port for literal loopback endpoints', () => {
    for (const endpoint of ['http://127.0.0.1:9000', 'http://[::1]:9000']) {
      const local = { ...environment, FREE_CRM_S3_ENDPOINT: endpoint, FREE_CRM_S3_ALLOW_LOOPBACK: 'true', FREE_CRM_LOCAL_MODE: 'true' };
      expect(storageConfiguration(local)).toMatchObject({ endpoint });
      expect(() => storageConfiguration(local, true)).toThrow(expect.objectContaining({ code: 'storage_configuration_invalid' }));
      expect(() => storageConfiguration({ ...local, FREE_CRM_LOCAL_MODE: undefined })).toThrow();
      expect(() => storageConfiguration({ ...local, FREE_CRM_S3_ALLOW_LOOPBACK: 'false' })).toThrow();
    }
    expect(() => storageConfiguration({ ...environment, FREE_CRM_S3_ENDPOINT: 'http://127.0.0.1', FREE_CRM_S3_ALLOW_LOOPBACK: 'true', FREE_CRM_LOCAL_MODE: 'true' })).toThrow();
  });

  it('rejects empty session tokens and malformed loopback flags without exposing credentials in errors', () => {
    expect(() => storageConfiguration({ ...environment, FREE_CRM_S3_SESSION_TOKEN: '' })).toThrow();
    expect(() => storageConfiguration({ ...environment, FREE_CRM_S3_ALLOW_LOOPBACK: 'yes' })).toThrow();
    let error: unknown;
    try { storageConfiguration({ ...environment, FREE_CRM_S3_ENDPOINT: 'invalid-synthetic-endpoint' }); }
    catch (caught) { error = caught; }
    expect(error).toMatchObject({ code: 'storage_configuration_invalid' });
    expect(String(error)).not.toContain(environment.FREE_CRM_S3_SECRET_ACCESS_KEY);
    expect(String(error)).not.toContain(environment.FREE_CRM_S3_ACCESS_KEY_ID);
    expect(String(error)).not.toContain('invalid-synthetic-endpoint');
  });
});
