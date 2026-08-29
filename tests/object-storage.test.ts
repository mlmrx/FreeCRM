import { describe, expect, it } from 'vitest';
import { R2TenantObjectStorage, tenantObjectKey } from '@/server/object-storage';

describe('tenant object storage boundary', () => {
  it('normalizes relative and already-prefixed references', () => {
    expect(tenantObjectKey('tenant-a', 'record-a/file.pdf')).toBe('tenant-a/record-a/file.pdf');
    expect(tenantObjectKey('tenant-a', 'tenant-a/record-a/file.pdf')).toBe('tenant-a/record-a/file.pdf');
  });

  it('rejects traversal, ambiguous segments, control bytes, and invalid tenants', () => {
    for (const key of ['../other/file', 'folder/../file', '/absolute', 'folder//file', 'folder\\file', `folder/\0file`]) {
      expect(() => tenantObjectKey('tenant-a', key)).toThrow(/storage reference/i);
    }
    expect(() => tenantObjectKey('../tenant', 'file')).toThrow(/identifier/i);
  });

  it('cannot use another tenant prefix to escape the authenticated workspace', () => {
    expect(tenantObjectKey('tenant-a', 'tenant-b/record/file.pdf')).toBe('tenant-a/tenant-b/record/file.pdf');
  });

  it('applies the same tenant fence to R2 put, get, and delete', async () => {
    const calls: string[] = [];
    const bucket = {
      put: async (key: string) => { calls.push(`put:${key}`); },
      get: async (key: string) => { calls.push(`get:${key}`); return null; },
      delete: async (key: string) => { calls.push(`delete:${key}`); },
    } as unknown as R2Bucket;
    const storage = new R2TenantObjectStorage(bucket);
    const body = new ArrayBuffer(0);
    await expect(storage.put('tenant-a', 'tenant-b/file', body, { contentType: 'text/plain', contentDisposition: 'attachment' })).resolves.toBe('tenant-a/tenant-b/file');
    await expect(storage.get('tenant-a', 'tenant-b/file')).resolves.toBeNull();
    await storage.delete('tenant-a', 'tenant-b/file');
    expect(calls).toEqual(['put:tenant-a/tenant-b/file', 'get:tenant-a/tenant-b/file', 'delete:tenant-a/tenant-b/file']);
  });
});
