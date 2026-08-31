import { ApiError } from './request-context';

export async function captureWorkspaceMutationEpoch(db: D1Database, workspaceId: string) {
  const row = await db.prepare('SELECT mutation_epoch FROM workspaces WHERE id=?').bind(workspaceId).first<{ mutation_epoch: number }>();
  if (!row || !Number.isInteger(row.mutation_epoch)) throw new ApiError(500, 'workspace_epoch_missing', 'Workspace mutation state is unavailable.');
  return row.mutation_epoch;
}

/**
 * Append this statement to every atomic tenant mutation batch. Its INSERT/UPSERT
 * trigger aborts (and rolls back the whole batch) if reset advanced the epoch or
 * if reset maintenance is still running/failed.
 */
export function workspaceMutationFence(
  db: D1Database,
  workspaceId: string,
  mutationEpoch: number,
  operationId: string,
  now = new Date().toISOString(),
) {
  return db.prepare(`
    INSERT INTO workspace_mutation_fences (workspace_id,mutation_epoch,operation_id,updated_at)
    VALUES (?,?,?,?)
    ON CONFLICT(workspace_id) DO UPDATE SET
      mutation_epoch=excluded.mutation_epoch,
      operation_id=excluded.operation_id,
      updated_at=excluded.updated_at
  `).bind(workspaceId, mutationEpoch, operationId.slice(0, 160), now);
}

export function normalizeMutationFenceError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  if (String(error).includes('workspace_mutation_epoch_stale')) {
    return new ApiError(409, 'workspace_mutation_stale', 'The workspace changed while this request was in progress. Refresh and retry.');
  }
  return error;
}
