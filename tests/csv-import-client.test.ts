import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  commitCsvImport,
  csvHeaderColumns,
  csvImportPayload,
  previewCsvImport,
} from '@/lib/csv-import-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('CSV import browser client', () => {
  it('reads quoted header choices locally and omits empty mapping overrides', () => {
    expect(csvHeaderColumns('\uFEFF"Full, name",Email,Company\r\nAda,ada@example.com,Example')).toEqual(['Full, name', 'Email', 'Company']);
    expect(csvHeaderColumns('"unfinished')).toEqual([]);
    expect(csvImportPayload('preview', 'Name\nAda', 'contact', { name: ' Name ', email: '' })).toEqual({
      mode: 'preview',
      csv: 'Name\nAda',
      objectType: 'contact',
      mapping: { name: 'Name' },
    });
  });

  it('previews without an idempotency header and surfaces row details from an API rejection', async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => {
      calls.push(init ?? {});
      return calls.length === 1
        ? response(200, { data: { mode: 'preview', objectType: 'lead', columns: ['Name'], mapping: { name: 'Name' }, totalRows: 1, validRows: 1, invalidRows: 0, preview: [{ row: 2, name: 'Ada', email: null, phone: null, companyName: null, status: null }], errors: [], limits: { maxRows: 40, maxBytes: 256000 } } })
        : response(422, { error: { message: 'Fix the CSV.', details: { errors: [{ row: 3, code: 'validation_error', message: 'Email is invalid.', field: 'email' }] } } });
    }));

    await expect(previewCsvImport('Name\nAda', 'lead', {})).resolves.toMatchObject({ validRows: 1, objectType: 'lead' });
    expect(new Headers(calls[0].headers).get('idempotency-key')).toBeNull();
    expect(JSON.parse(String(calls[0].body))).toEqual({ mode: 'preview', csv: 'Name\nAda', objectType: 'lead' });

    const rejected = previewCsvImport('Name,Email\nAda,bad', 'contact', {});
    await expect(rejected).rejects.toMatchObject({ message: 'Fix the CSV.', rowErrors: [{ row: 3, field: 'email' }] });
  });

  it('keeps the exact commit key and body across an ambiguous failure and user retry', async () => {
    const calls: Array<{ key: string; body: string }> = [];
    const responses = [
      response(503, { error: { message: 'Outcome unknown.' } }),
      response(200, { data: { mode: 'commit', objectType: 'company', totalRows: 1, imported: 1, recordIds: ['company-a'] }, replayed: true }),
    ];
    vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => {
      calls.push({ key: new Headers(init?.headers).get('idempotency-key') ?? '', body: String(init?.body) });
      return responses.shift()!;
    }));

    const csv = 'Company Name\nFree CRM Test Company';
    await expect(commitCsvImport(csv, 'company', { name: 'Company Name' })).rejects.toThrow('Outcome unknown.');
    await expect(commitCsvImport(csv, 'company', { name: 'Company Name' })).resolves.toMatchObject({ imported: 1, recordIds: ['company-a'] });

    expect(calls).toHaveLength(2);
    expect(calls[0].key).toMatch(/^[0-9a-f-]{36}$/i);
    expect(calls[1].key).toBe(calls[0].key);
    expect(calls[1].body).toBe(calls[0].body);
    expect(JSON.parse(calls[0].body)).toEqual({ mode: 'commit', csv, objectType: 'company', mapping: { name: 'Company Name' } });
  });

  it('retains the commit key until a complete receipt can be recovered', async () => {
    const keys: string[] = [];
    const responses = [
      response(200, { data: { mode: 'commit' } }),
      response(200, { data: { mode: 'commit', objectType: 'contact', totalRows: 1, imported: 1, recordIds: ['contact-a'] }, replayed: true }),
    ];
    vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => {
      keys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
      return responses.shift()!;
    }));

    const csv = 'Name\nGrace Hopper';
    await expect(commitCsvImport(csv, 'contact', { name: 'Name' })).rejects.toThrow('Outcome unknown');
    await expect(commitCsvImport(csv, 'contact', { name: 'Name' })).resolves.toMatchObject({ imported: 1, recordIds: ['contact-a'] });
    expect(keys[1]).toBe(keys[0]);
  });
});
