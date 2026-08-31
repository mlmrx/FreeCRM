/** Delete a bounded page of this tenant's expired receipts on write traffic. */
export async function pruneExpiredIdempotencyRecords(db: D1Database, workspaceId: string, now = new Date().toISOString()) {
  await db.prepare(`
    DELETE FROM idempotency_records
    WHERE rowid IN (
      SELECT rowid FROM idempotency_records
      WHERE workspace_id=? AND expires_at<=?
      LIMIT 100
    )
  `).bind(workspaceId, now).run();
}
