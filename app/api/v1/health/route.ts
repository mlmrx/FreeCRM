import { getD1, getFiles } from '@/db';
import { apiResponse, errorResponse, requireActivatedRuntime } from '@/server/request-context';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    requireActivatedRuntime();
    const started = Date.now();
    const db = getD1();
    const files = getFiles();
    await Promise.all([
      db.prepare('SELECT 1 AS healthy').first<{ healthy: number }>(),
      files.head('__free_crm_readiness_probe__'),
    ]);
    return apiResponse({
      status: 'ready',
      database: 'connected',
      objectStorage: 'connected',
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
