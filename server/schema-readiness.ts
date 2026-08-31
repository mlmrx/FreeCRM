import migrationJournal from '@/drizzle/meta/_journal.json';
import { ApiError } from '@/server/request-context';

type MigrationLedgerRow = {
  id: number;
  name: string;
};

type MigrationJournalEntry = {
  idx: number;
  tag: string;
};

const journalEntries = migrationJournal.entries as MigrationJournalEntry[];

export const EXPECTED_D1_MIGRATIONS = Object.freeze(
  journalEntries.map((entry) => Object.freeze({
    id: entry.idx + 1,
    name: `${entry.tag}.sql`,
  })),
);

export type SchemaReadiness = {
  migrationCount: number;
  latestMigration: string;
};

function schemaNotReady(): ApiError {
  return new ApiError(
    503,
    'database_schema_not_ready',
    'The database schema is not ready. Apply the checked-in D1 migrations before serving traffic.',
  );
}

function hasCanonicalMigrationLedger(rows: MigrationLedgerRow[]): boolean {
  if (rows.length !== EXPECTED_D1_MIGRATIONS.length) return false;
  return rows.every((row, index) => {
    const expected = EXPECTED_D1_MIGRATIONS[index];
    return Number.isInteger(row.id)
      && row.id === expected.id
      && row.name === expected.name;
  });
}

/**
 * Read-only release sentinel. Migrations remain an explicit operator action;
 * request handling only verifies Wrangler's canonical ledger.
 */
export async function assertDatabaseSchemaReady(db: D1Database): Promise<SchemaReadiness> {
  try {
    const result = await db
      .prepare('SELECT id,name FROM d1_migrations ORDER BY id')
      .all<MigrationLedgerRow>();
    const rows = Array.isArray(result.results) ? result.results : [];
    if (!result.success || !hasCanonicalMigrationLedger(rows)) throw schemaNotReady();
  } catch {
    throw schemaNotReady();
  }

  const latest = EXPECTED_D1_MIGRATIONS.at(-1);
  if (!latest) throw schemaNotReady();
  return {
    migrationCount: EXPECTED_D1_MIGRATIONS.length,
    latestMigration: latest.name,
  };
}
