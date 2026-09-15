import { describe, expect, it, vi } from 'vitest';
import { attachmentContentDisposition, MAX_CONTENT_DISPOSITION_LENGTH, normalizeContentDisposition } from '@/server/file-headers';

const routeFixture = vi.hoisted(() => ({ name: '会議.txt', run: vi.fn(async () => ({ success: true })), get: vi.fn() }));
vi.mock('@/db', () => ({ getD1: () => ({ prepare: () => ({ bind: () => ({ run: routeFixture.run }) }) }) }));
vi.mock('@/server/control-plane', () => ({ ensureWorkspace: async () => ({ workspaceId: 'tenant-a', workspace: { role: 'owner' } }) }));
vi.mock('@/server/data-plane', () => ({ getRecord: async () => ({ objectType: 'document', status: 'active', name: routeFixture.name, fields: { objectKey: 'tenant-a/record/file' } }) }));
vi.mock('@/server/storage-provider', () => ({ getObjectStorage: () => ({ get: routeFixture.get }) }));
vi.mock('@/server/request-context', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/server/request-context')>(),
  getRequestIdentity: async () => ({ userId: 'synthetic-owner', requestId: 'synthetic-request' }),
}));

describe('bounded international attachment headers', () => {
  it.each(['report.pdf', "O'Reilly (draft).txt", 'space name.csv', '100%.txt'])('preserves legacy ASCII filename %s', (filename) => {
    expect(attachmentContentDisposition(filename)).toBe(`attachment; filename="${filename}"`);
    expect(normalizeContentDisposition(`attachment; filename="${filename}"`)).toBe(`attachment; filename="${filename}"`);
  });

  it.each(['会議.txt', 'Résumé.pdf', 'مرحبا.csv', 'नमस्ते.txt', '😀.png', '界'.repeat(180), '😀'.repeat(180)])('round-trips Unicode filenames safely through real Headers (%#)', (filename) => {
    const header = attachmentContentDisposition(filename);
    const headers = new Headers({ 'content-disposition': header });
    expect(headers.get('content-disposition')).toBe(header);
    expect(header).toMatch(/^attachment; filename="document"; filename\*=UTF-8''/);
    expect(decodeURIComponent(header.split("filename*=UTF-8''")[1])).toBe(filename);
    expect(header.length).toBeLessThanOrEqual(MAX_CONTENT_DISPOSITION_LENGTH);
    expect(normalizeContentDisposition(`attachment; filename="${filename}"`)).toBe(header);
    expect(normalizeContentDisposition(header)).toBe(header);
  });

  it('encodes RFC 5987 excluded punctuation in extended parameters', () => {
    expect(attachmentContentDisposition("会議's (draft)*.txt")).toContain('%27s%20%28draft%29%2A.txt');
  });

  it.each(['bad\r\nheader.txt', 'bad\0file', 'bad\tfile', 'bad\u007ffile', 'bad\u0085file', 'bad"file', 'bad\\file', ''])('rejects unsafe filename %j', (filename) => {
    expect(() => attachmentContentDisposition(filename)).toThrow(expect.objectContaining({ code: 'invalid_storage_metadata' }));
  });

  it('rejects invalid UTF-16 instead of throwing a raw URIError', () => {
    expect(() => attachmentContentDisposition('broken\ud800')).toThrow(expect.objectContaining({ code: 'invalid_storage_metadata' }));
  });

  it('enforces the expanded bound before storage while permitting a complete 180-character filename', () => {
    const maximum = attachmentContentDisposition('界'.repeat(180));
    expect(maximum.length).toBeGreaterThan(1024);
    expect(maximum.length).toBeLessThanOrEqual(MAX_CONTENT_DISPOSITION_LENGTH);
    expect(() => attachmentContentDisposition('界'.repeat(500))).toThrow(expect.objectContaining({ code: 'invalid_storage_metadata' }));
    expect(() => normalizeContentDisposition(`attachment; filename="${'界'.repeat(500)}"`)).toThrow(expect.objectContaining({ code: 'invalid_storage_metadata' }));
    expect(() => normalizeContentDisposition('x'.repeat(MAX_CONTENT_DISPOSITION_LENGTH + 1))).toThrow();
  });

  it.each([undefined, null, '', 'attachment\r\nx: y', 'inline; filename="会議.txt"', 'attachment; filename=会議.txt'])('rejects malformed or ambiguous header %j', (header) => {
    expect(() => normalizeContentDisposition(header)).toThrow(expect.objectContaining({ code: 'invalid_storage_metadata' }));
  });

  it('preserves safe provider-neutral ASCII dispositions', () => {
    expect(normalizeContentDisposition('attachment')).toBe('attachment');
    expect(normalizeContentDisposition('inline')).toBe('inline');
  });
});

describe('download route international filename integration', () => {
  it.each(['会議.txt', '界'.repeat(180), `${'a'.repeat(179)}😀`])('returns an authenticated download instead of a raw Unicode Headers error (%#)', async (name) => {
    routeFixture.name = name;
    routeFixture.get.mockImplementation(async () => ({
      body: new Response('synthetic file bytes').body,
      etag: '"synthetic-digest"',
      applyHttpMetadata(headers: Headers) {
        headers.set('content-type', 'text/plain');
        headers.set('content-disposition', 'attachment; filename="old-display-name.txt"');
      },
    }));
    const { GET } = await import('@/app/api/v1/files/route');
    const response = await GET(new Request('http://127.0.0.1/api/v1/files?id=record'));
    expect(response.status).toBe(200);
    const safeDisplayName = name.slice(0, 180).replace(/[\ud800-\udbff]$/, '');
    expect(response.headers.get('content-disposition')).toBe(attachmentContentDisposition(safeDisplayName));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toBe('synthetic file bytes');
    expect(routeFixture.get).toHaveBeenLastCalledWith('tenant-a', 'tenant-a/record/file');
    expect(routeFixture.run).toHaveBeenCalled();
  });
});
