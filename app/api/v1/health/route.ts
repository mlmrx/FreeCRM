import { getD1, getFiles } from '@/db';
import { ensureWorkspace } from '@/server/control-plane';
import { apiResponse, errorResponse, getRequestIdentity } from '@/server/request-context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const started = Date.now();
    const identity = getRequestIdentity(request);
    const db = getD1();
    getFiles();
    const context = await ensureWorkspace(db, identity);
    const counts = await db.prepare(`
      SELECT object_type, COUNT(*) AS count
      FROM records
      WHERE workspace_id = ? AND archived_at IS NULL
      GROUP BY object_type
    `).bind(context.workspaceId).all<{ object_type: string; count: number }>();
    return apiResponse({
      status: 'ready',
      database: 'connected',
      objectStorage: 'connected',
      workspaceId: context.workspaceId,
      modules: Object.fromEntries(counts.results.map((row) => [row.object_type, row.count])),
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
