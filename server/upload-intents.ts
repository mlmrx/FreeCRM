import type { TenantObjectStorage } from './object-storage';
import { ApiError } from './request-context';
import { assertD1BatchSize } from './d1-limits';
import { pendingUploadReceiptStatement, readFileMutationReceipt, type FileMutationResponse } from './file-mutations';

const uploadIntentLeaseMs = 15 * 60 * 1000;
const cleanedIntentRetention = 1_000;
const cleanedIntentPruneBatch = 100;

type UploadIntentRow = {
  id: string;
  object_key: string;
  mutation_epoch: number;
  status: 'pending' | 'cleanup_pending';
};

type ClaimedUploadIntentRow = {
  object_key: string;
  mutation_epoch: number;
  status: 'pending' | 'committed' | 'cleanup_pending' | 'cleaned';
};

function changed(result: D1Result<unknown>) {
  return Number(result.meta?.changes ?? 0);
}

function cleanupStateFailure(original: unknown, stateError: unknown) {
  const originalCode = original instanceof ApiError ? original.code : 'upload_failed';
  return new ApiError(503, 'upload_cleanup_state_failed', 'The upload failed and its cleanup receipt could not be persisted. Retry after storage recovers.', {
    originalCode,
    stateError: stateError instanceof ApiError ? stateError.code : 'database_unavailable',
  });
}

export function normalizeUploadIntentError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  const message = String(error);
  if (message.includes('workspace_reset_in_progress') || message.includes('audit_events_reset_fence')) {
    return new ApiError(423, 'workspace_reset_in_progress', 'A workspace reset is in progress. Retry the upload after it finishes.');
  }
  if (message.includes('workspace_mutation_epoch_stale') || message.includes('upload_intent_epoch_stale') || message.includes('upload_intent_not_committed')) {
    return new ApiError(409, 'workspace_mutation_stale', 'The workspace changed while the upload was in progress. Uploaded bytes were scheduled for cleanup; retry after refreshing.');
  }
  if (message.includes('upload_intent_capacity')) {
    return new ApiError(409, 'upload_intent_capacity', 'Too many uploads are already active for this workspace. Wait for them to finish and retry.');
  }
  return error;
}

export async function registerUploadIntent(
  db: D1Database,
  input: { workspaceId: string; id: string; objectKey: string; mutationEpoch: number; now: string },
): Promise<number> {
  const leaseExpiresAt = new Date(Date.parse(input.now) + uploadIntentLeaseMs).toISOString();
  try {
    const results = await db.batch([
      db.prepare(`
        DELETE FROM upload_intents
        WHERE rowid IN (
          SELECT rowid FROM upload_intents
          WHERE workspace_id=? AND status='cleaned'
            AND datetime(updated_at) <= datetime(?, '-7 days')
          ORDER BY updated_at ASC
          LIMIT ?
        )
        AND (SELECT COUNT(*) FROM upload_intents WHERE workspace_id=? AND status='cleaned') > ?
      `).bind(input.workspaceId, input.now, cleanedIntentPruneBatch, input.workspaceId, cleanedIntentRetention),
      db.prepare(`
        INSERT INTO upload_intents (
          workspace_id,id,object_key,mutation_epoch,status,lease_expires_at,last_error_code,
          cleanup_attempts,created_at,updated_at
        )
        SELECT ?,?,?,?,'pending',?,NULL,0,?,?
        FROM workspaces
        WHERE id=? AND mutation_epoch=?
      `).bind(input.workspaceId, input.id, input.objectKey, input.mutationEpoch, leaseExpiresAt, input.now, input.now, input.workspaceId, input.mutationEpoch),
    ]);
    if (changed(results[1]) !== 1) {
      const workspace = await db.prepare('SELECT mutation_epoch FROM workspaces WHERE id=?').bind(input.workspaceId).first<{ mutation_epoch: number }>();
      if (workspace) throw new ApiError(409, 'workspace_mutation_stale', 'The workspace changed before the upload receipt could be registered. Refresh and retry.');
      throw new ApiError(404, 'workspace_not_found', 'Workspace not found.');
    }
  } catch (error) {
    throw normalizeUploadIntentError(error);
  }
  const intent = await db.prepare('SELECT mutation_epoch FROM upload_intents WHERE workspace_id=? AND id=?').bind(input.workspaceId, input.id).first<{ mutation_epoch: number }>();
  if (!intent || intent.mutation_epoch !== input.mutationEpoch) throw new ApiError(500, 'upload_intent_missing', 'The durable upload receipt could not be read.');
  return intent.mutation_epoch;
}

/**
 * Acquire or resume a document upload with its tenant-scoped HTTP receipt in
 * the same D1 transaction. A retry can renew a pending lease, and a fully
 * compensated attempt can reuse the same stable operation without allocating a
 * second record or object key.
 */
export async function claimDocumentUpload(
  db: D1Database,
  input: {
    workspaceId: string;
    id: string;
    objectKey: string;
    mutationEpoch: number;
    operationKey: string;
    requestHash: string;
    pendingResponse: FileMutationResponse;
    now: string;
  },
): Promise<ClaimedUploadIntentRow> {
  const leaseExpiresAt = new Date(Date.parse(input.now) + uploadIntentLeaseMs).toISOString();
  const statements = [
    db.prepare(`
      DELETE FROM upload_intents
      WHERE rowid IN (
        SELECT rowid FROM upload_intents
        WHERE workspace_id=? AND status='cleaned'
          AND datetime(updated_at) <= datetime(?, '-7 days')
        ORDER BY updated_at ASC
        LIMIT ?
      )
      AND (SELECT COUNT(*) FROM upload_intents WHERE workspace_id=? AND status='cleaned') > ?
    `).bind(input.workspaceId, input.now, cleanedIntentPruneBatch, input.workspaceId, cleanedIntentRetention),
    db.prepare(`
      DELETE FROM upload_intents
      WHERE workspace_id=? AND id=? AND status='cleaned'
        AND NOT EXISTS (
          SELECT 1 FROM records
          WHERE workspace_id=? AND id=? AND object_type='document'
        )
    `).bind(input.workspaceId, input.id, input.workspaceId, input.id),
    db.prepare(`
      INSERT INTO upload_intents (
        workspace_id,id,object_key,mutation_epoch,status,lease_expires_at,last_error_code,
        cleanup_attempts,created_at,updated_at
      )
      SELECT ?,?,?,?,'pending',?,NULL,0,?,?
      FROM workspaces
      WHERE id=? AND mutation_epoch=?
      ON CONFLICT(workspace_id,id) DO UPDATE SET
        lease_expires_at=excluded.lease_expires_at,
        updated_at=excluded.updated_at
      WHERE upload_intents.status='pending'
        AND upload_intents.object_key=excluded.object_key
        AND upload_intents.mutation_epoch=excluded.mutation_epoch
    `).bind(
      input.workspaceId,
      input.id,
      input.objectKey,
      input.mutationEpoch,
      leaseExpiresAt,
      input.now,
      input.now,
      input.workspaceId,
      input.mutationEpoch,
    ),
    pendingUploadReceiptStatement(db, {
      workspaceId: input.workspaceId,
      operationKey: input.operationKey,
      requestHash: input.requestHash,
      response: input.pendingResponse,
      now: input.now,
    }),
  ];
  try {
    await db.batch(assertD1BatchSize(statements, 'Document upload claim'));
  } catch (error) {
    throw normalizeUploadIntentError(error);
  }
  const [intent, receipt] = await Promise.all([
    db.prepare(`
      SELECT object_key,mutation_epoch,status
      FROM upload_intents
      WHERE workspace_id=? AND id=?
      LIMIT 1
    `).bind(input.workspaceId, input.id).first<ClaimedUploadIntentRow>(),
    readFileMutationReceipt(db, input.workspaceId, 'document.upload', input.operationKey, input.requestHash),
  ]);
  if (!receipt) throw new ApiError(503, 'upload_receipt_missing', 'The durable upload receipt could not be read.');
  if (!intent) {
    const workspace = await db.prepare('SELECT mutation_epoch FROM workspaces WHERE id=?').bind(input.workspaceId).first<{ mutation_epoch: number }>();
    if (workspace) throw new ApiError(409, 'workspace_mutation_stale', 'The workspace changed before the upload receipt could be registered. Refresh and retry.');
    throw new ApiError(404, 'workspace_not_found', 'Workspace not found.');
  }
  if (intent.object_key !== input.objectKey || intent.mutation_epoch !== input.mutationEpoch) {
    throw new ApiError(409, 'upload_intent_conflict', 'That upload operation belongs to a different workspace state. Refresh and retry.');
  }
  if (intent.status === 'cleanup_pending') {
    throw new ApiError(503, 'upload_cleanup_pending', 'The previous upload attempt is still being cleaned up. Retry after storage recovers.');
  }
  if (intent.status === 'cleaned') {
    throw new ApiError(503, 'upload_cleanup_pending', 'The previous upload cleanup has not released its durable receipt yet. Retry the upload.');
  }
  return intent;
}

export async function markUploadIntentCleaned(
  db: D1Database,
  input: { workspaceId: string; id: string; mutationEpoch: number; now: string },
) {
  const result = await db.prepare(`
    UPDATE upload_intents
    SET status='cleaned',lease_expires_at=NULL,last_error_code=NULL,
        cleanup_attempts=cleanup_attempts+1,updated_at=?
    WHERE workspace_id=? AND id=? AND mutation_epoch=?
      AND status IN ('pending','cleanup_pending','cleaned')
  `).bind(input.now, input.workspaceId, input.id, input.mutationEpoch).run();
  if (changed(result) !== 1) throw new ApiError(409, 'upload_intent_state_conflict', 'The upload cleanup receipt changed concurrently.');
}

export async function markUploadIntentCleanupPending(
  db: D1Database,
  input: { workspaceId: string; id: string; mutationEpoch: number; errorCode: string; now: string },
) {
  const result = await db.prepare(`
    UPDATE upload_intents
    SET status='cleanup_pending',lease_expires_at=NULL,last_error_code=?,
        cleanup_attempts=cleanup_attempts+1,updated_at=?
    WHERE workspace_id=? AND id=? AND mutation_epoch=?
      AND status IN ('pending','cleanup_pending','cleaned')
  `).bind(input.errorCode.slice(0, 64), input.now, input.workspaceId, input.id, input.mutationEpoch).run();
  if (changed(result) !== 1) throw new ApiError(409, 'upload_intent_state_conflict', 'The upload cleanup receipt changed concurrently.');
}

export async function retryUploadIntentCleanup(
  db: D1Database,
  storage: TenantObjectStorage,
  workspaceId: string,
  limit = 10,
) {
  const boundedLimit = Math.max(1, Math.min(25, Math.trunc(limit)));
  const rows = await db.prepare(`
    SELECT id,object_key,mutation_epoch,status
    FROM upload_intents
    WHERE workspace_id=? AND (
      status='cleanup_pending'
      OR (status='pending' AND lease_expires_at<=?)
    )
    ORDER BY updated_at ASC
    LIMIT ?
  `).bind(workspaceId, new Date().toISOString(), boundedLimit).all<UploadIntentRow>();
  let cleaned = 0;
  for (const row of rows.results) {
    if (row.status === 'pending') {
      try {
        await markUploadIntentCleanupPending(db, {
          workspaceId,
          id: row.id,
          mutationEpoch: row.mutation_epoch,
          errorCode: 'upload_intent_expired',
          now: new Date().toISOString(),
        });
      } catch {
        // A concurrent finalizer won the D1 state transition; never delete its bytes.
        continue;
      }
    }
    try {
      await storage.delete(workspaceId, row.object_key);
      await markUploadIntentCleaned(db, {
        workspaceId,
        id: row.id,
        mutationEpoch: row.mutation_epoch,
        now: new Date().toISOString(),
      });
      cleaned += 1;
    } catch {
      await markUploadIntentCleanupPending(db, {
        workspaceId,
        id: row.id,
        mutationEpoch: row.mutation_epoch,
        errorCode: 'upload_cleanup_failed',
        now: new Date().toISOString(),
      }).catch(() => undefined);
      // The durable row remains eligible for the next bounded retry.
    }
  }
  return cleaned;
}

export async function executeDurableUploadIntent<T>(steps: {
  register: () => Promise<void>;
  put: () => Promise<void>;
  finalize: () => Promise<T>;
  recoverCommitted: () => Promise<{ committed: true; value: T } | { committed: false }>;
  deleteObject: () => Promise<void>;
  markCleaned: () => Promise<void>;
  markCleanupPending: (errorCode: 'upload_cleanup_failed' | 'upload_cleanup_receipt_failed') => Promise<void>;
}): Promise<T> {
  await steps.register();
  let finalizeStarted = false;
  try {
    await steps.put();
    finalizeStarted = true;
    return await steps.finalize();
  } catch (original) {
    if (finalizeStarted) {
      try {
        const recovered = await steps.recoverCommitted();
        if (recovered.committed) return recovered.value;
      } catch {
        throw new ApiError(503, 'upload_finalize_unknown', 'The upload commit could not be confirmed. Its durable receipt was preserved; retry after the database recovers.');
      }
    }
    try {
      await steps.deleteObject();
    } catch {
      try {
        await steps.markCleanupPending('upload_cleanup_failed');
      } catch (stateError) {
        throw cleanupStateFailure(original, stateError);
      }
      throw normalizeUploadIntentError(original);
    }
    try {
      await steps.markCleaned();
    } catch {
      try {
        await steps.markCleanupPending('upload_cleanup_receipt_failed');
      } catch (stateError) {
        throw cleanupStateFailure(original, stateError);
      }
    }
    throw normalizeUploadIntentError(original);
  }
}
