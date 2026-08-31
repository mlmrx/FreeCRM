import { describe, expect, it } from 'vitest';
import { R2TenantObjectStorage, tenantEpochObjectKey, tenantObjectKey, tenantObjectPrefix } from '@/server/object-storage';

describe('tenant object storage boundary', () => {
  it('normalizes relative and already-prefixed references', () => {
    expect(tenantObjectKey('tenant-a', 'record-a/file.pdf')).toBe('tenant-a/record-a/file.pdf');
    expect(tenantObjectKey('tenant-a', 'tenant-a/record-a/file.pdf')).toBe('tenant-a/record-a/file.pdf');
    expect(tenantEpochObjectKey('tenant-a', 12, 'record-a/blob')).toBe('tenant-a/~epoch/00000000000000000012/record-a/blob');
  });

  it('rejects traversal, ambiguous segments, control bytes, and invalid tenants', () => {
    for (const key of ['../other/file', 'folder/../file', '/absolute', 'folder//file', 'folder\\file', `folder/\0file`]) {
      expect(() => tenantObjectKey('tenant-a', key)).toThrow(/storage reference/i);
    }
    expect(() => tenantObjectKey('../tenant', 'file')).toThrow(/identifier/i);
  });

  it('cannot use another tenant prefix to escape the authenticated workspace', () => {
    expect(tenantObjectKey('tenant-a', 'tenant-b/record/file.pdf')).toBe('tenant-a/tenant-b/record/file.pdf');
    expect(tenantObjectPrefix('tenant-a')).toBe('tenant-a/');
  });

  it('deletes a bounded tenant-prefix page, including unreferenced objects', async () => {
    const calls: Array<string | string[]> = [];
    const bucket = {
      list: async (options: R2ListOptions) => {
        calls.push(`list:${options.prefix}:${options.limit}`);
        return { objects: [{ key: 'tenant-a/orphan.bin' }, { key: 'tenant-a/record/file.pdf' }], truncated: true };
      },
      delete: async (keys: string | string[]) => { calls.push(keys); },
    } as unknown as R2Bucket;
    const storage = new R2TenantObjectStorage(bucket);
    await expect(storage.deleteWorkspacePage('tenant-a', 1)).resolves.toEqual({ deleted: 2, complete: false });
    expect(calls).toEqual(['list:tenant-a/:1000', ['tenant-a/orphan.bin', 'tenant-a/record/file.pdf']]);
    await expect(storage.deleteMany('tenant-a', Array.from({ length: 1_001 }, (_, index) => `item-${index}`))).rejects.toMatchObject({ code: 'storage_batch_too_large' });
  });

  it('keeps current-epoch bytes safe from a stale reset cleaner', async () => {
    const oldKey = tenantEpochObjectKey('tenant-a', 0, 'old/blob');
    const currentKey = tenantEpochObjectKey('tenant-a', 2, 'current/blob');
    const deleted: string[][] = [];
    const bucket = {
      // Model a stale cleaner that reaches list only after the newer reset has
      // completed and a current-epoch upload is already visible.
      list: async () => ({
        objects: [{ key: 'tenant-a/legacy/blob' }, { key: oldKey }, { key: currentKey }],
        truncated: false,
      }),
      delete: async (keys: string[]) => { deleted.push(keys); },
    } as unknown as R2Bucket;

    const storage = new R2TenantObjectStorage(bucket);
    await expect(storage.deleteWorkspacePage('tenant-a', 1)).resolves.toEqual({ deleted: 2, complete: true });
    expect(deleted).toEqual([['tenant-a/legacy/blob', oldKey]]);
    expect(deleted.flat()).not.toContain(currentKey);
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
