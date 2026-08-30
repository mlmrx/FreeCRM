import { describe, expect, it } from 'vitest';
import { modifiedMergedMigrations, parseNameStatus } from '../scripts/check-pr-base.mjs';

describe('PR base guard', () => {
  it('parses added, modified, deleted, and renamed Git paths', () => {
    expect(parseNameStatus('A\tdrizzle/0003_new.sql\nM\tdrizzle/0002_old.sql\nR100\told\tnew')).toEqual([
      { status: 'A', paths: ['drizzle/0003_new.sql'] },
      { status: 'M', paths: ['drizzle/0002_old.sql'] },
      { status: 'R100', paths: ['old', 'new'] },
    ]);
  });

  it('allows new migrations and rejects modification, removal, or rename of merged migrations', () => {
    const entries = parseNameStatus('A\tdrizzle/0003_new.sql\nM\tdrizzle/0002_old.sql\nD\tdrizzle/0001_old.sql\nR100\tdrizzle/0000_old.sql\tdrizzle/0000_renamed.sql\nM\tdb/schema.ts');
    expect(modifiedMergedMigrations(entries).map((entry: { status: string }) => entry.status)).toEqual(['M', 'D', 'R100']);
  });
});
