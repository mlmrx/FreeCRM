import { describe, expect, it } from 'vitest';

import { CSV_IMPORT_MAX_ROWS, prepareCsvImport } from '@/server/csv-import';

function expectCode(action: () => unknown, code: string) {
  try {
    action();
    throw new Error('Expected action to throw.');
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

describe('CSV import preparation', () => {
  it('parses Excel-compatible quoting, infers headers, and preserves useful unmapped fields', () => {
    const prepared = prepareCsvImport({
      objectType: 'contact',
      csv: '\uFEFFFull Name,Email Address,Phone,Company,Tags,Favorite color\r\n"Ada, Jr.",ADA@Example.COM,+1 415 555 1000,Analytical Engines,"vip; founder",blue\r\nGrace Hopper,grace@example.com,,,navy,',
    });

    expect(prepared).toMatchObject({
      objectType: 'contact',
      totalRows: 2,
      errors: [],
      mapping: {
        name: 'Full Name',
        email: 'Email Address',
        phone: 'Phone',
        companyName: 'Company',
        tags: 'Tags',
      },
    });
    expect(prepared.records[0]).toMatchObject({
      objectType: 'contact',
      name: 'Ada, Jr.',
      email: 'ada@example.com',
      phone: '+1 415 555 1000',
      companyName: 'Analytical Engines',
      source: 'CSV import',
      tags: ['vip', 'founder'],
      fields: { 'Favorite color': 'blue' },
    });
    expect(prepared.preview).toHaveLength(2);
  });

  it('supports explicit header mapping and composes a name from first and last names', () => {
    const prepared = prepareCsvImport({
      objectType: 'lead',
      mapping: { firstName: 'Given', lastName: 'Family', email: 'Work mail', status: 'Pipeline' },
      csv: 'Given,Family,Work mail,Pipeline\nKatherine,Johnson,katherine@example.com,new',
    });

    expect(prepared.errors).toEqual([]);
    expect(prepared.records[0]).toMatchObject({
      objectType: 'lead',
      name: 'Katherine Johnson',
      email: 'katherine@example.com',
      status: 'new',
    });
  });

  it('collects row-level validation failures without returning an importable record', () => {
    const prepared = prepareCsvImport({
      objectType: 'contact',
      csv: 'name,email,status\nValid Person,valid@example.com,active\nBad Email,not-an-email,active\nBad Status,status@example.com,won',
    });

    expect(prepared.totalRows).toBe(3);
    expect(prepared.records).toHaveLength(1);
    expect(prepared.errors).toEqual([
      expect.objectContaining({ row: 3, code: 'validation_error', field: 'email' }),
      expect.objectContaining({ row: 4, code: 'validation_error', field: 'status' }),
    ]);
  });

  it('uses commit-safe transition rules during preview and preserves source row numbers across blanks', () => {
    const prepared = prepareCsvImport({
      objectType: 'lead',
      csv: 'name,email,status\n\nManaged Lead,managed@example.com,converted\nBad Email,bad-email,new',
    });

    expect(prepared.records).toEqual([]);
    expect(prepared.errors).toEqual([
      expect.objectContaining({ row: 3, code: 'managed_transition_required' }),
      expect.objectContaining({ row: 4, code: 'validation_error', field: 'email' }),
    ]);
  });

  it('reports physical source lines after multiline quoted cells', () => {
    const prepared = prepareCsvImport({
      objectType: 'contact',
      csv: 'name,email,Notes\r\nValid Person,valid@example.com,"Line one\r\nLine two"\r\n\r\nBad Email,bad-email,plain',
    });

    expect(prepared.records).toHaveLength(1);
    expect(prepared.errors).toEqual([
      expect.objectContaining({ row: 5, code: 'validation_error', field: 'email' }),
    ]);
  });

  it('fails closed on ambiguous headers, malformed quoting, and absent name mappings', () => {
    expectCode(() => prepareCsvImport({ objectType: 'contact', csv: 'Name,name\nAda,Ada' }), 'csv_header_duplicate');
    expectCode(() => prepareCsvImport({ objectType: 'contact', csv: 'name,email\n"Ada,ada@example.com' }), 'csv_invalid');
    expectCode(() => prepareCsvImport({ objectType: 'contact', csv: 'email,phone\nada@example.com,123' }), 'csv_mapping_name_required');
    expectCode(() => prepareCsvImport({ objectType: 'contact', mapping: { name: 'Missing' }, csv: 'name,email\nAda,ada@example.com' }), 'csv_mapping_missing_header');
  });

  it('keeps each commit inside the portable D1 batch ceiling', () => {
    const rows = Array.from({ length: CSV_IMPORT_MAX_ROWS }, (_, index) => `Person ${index},person${index}@example.com`).join('\n');
    expect(prepareCsvImport({ objectType: 'contact', csv: `name,email\n${rows}` }).records).toHaveLength(CSV_IMPORT_MAX_ROWS);
    expectCode(
      () => prepareCsvImport({ objectType: 'contact', csv: `name,email\n${rows}\nOverflow,overflow@example.com` }),
      'csv_too_many_rows',
    );
  });
});
