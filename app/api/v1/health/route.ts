import { getD1, getFiles } from '@/db';
import { apiResponse, errorResponse, getRequestIdentity, requireActivatedRuntime } from '@/server/request-context';
import { assertDatabaseSchemaReady } from '@/server/schema-readiness';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireActivatedRuntime();
    await getRequestIdentity(request);
    const started = Date.now();
    const db = getD1();
    const schema = await assertDatabaseSchemaReady(db);
    const files = getFiles();
    await files.head('__free_crm_readiness_probe__');
    return apiResponse({
      status: 'ready',
      database: 'connected',
      schema: 'current',
      migrationCount: schema.migrationCount,
      latestMigration: schema.latestMigration,
      objectStorage: 'connected',
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
