import { parseJson } from '@/lib/crm-platform';
import { assertD1BatchSize } from './d1-limits';
import { tenantObjectKey, type TenantObjectStorage } from './object-storage';
import { ApiError, type RequestIdentity } from './request-context';
import { workspaceMutationFence } from './mutation-fence';

export const documentUploadOperation = 'document.upload';
export const documentDeleteOperation = 'document.delete';

const operationKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pendingReceiptLifetimeMs = 365 * 24 * 60 * 60 * 1_000;
const completedReceiptLifetimeMs = 7 * 24 * 60 * 60 * 1_000;

type IdempotencyRow = {
  request_hash: string;
  status_code: number;
  response_json: string;
};

export type FileMutationResponse = {
  ok: true;
  result: Record<string, unknown>;
  replayed?: boolean;
};

export type FileMutationReceipt = {
  requestHash: string;
  statusCode: number;
  response: FileMutationResponse;
  discardedByReset: boolean;
};

export type PendingDocumentDelete = {
  version: 1;
  id: string;
  objectKey: string | null;
  mutationEpoch: number;
  operationKey: string;
  requestHash: string;
  actorUserId: string;
  requestId: string;
};

type DeleteOutboxRow = {
  id: string;
  payload_json: string;
  attempts: number;
};

function changed(result: D1Result<unknown>): number {
  return Number(result.meta?.changes ?? 0);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

export function requireFileOperationKey(request: Request): string {
  const key = request.headers.get('idempotency-key')?.trim() ?? '';
  if (!operationKeyPattern.test(key)) {
    throw new ApiError(400, 'idempotency_key_required', 'Idempotency-Key must be a UUID and must be reused when resuming this file operation.');
  }
  return key.toLowerCase();
}

export async function documentUploadIdentity(
  workspaceId: string,
  operationKey: string,
  file: File,
  displayName: string,
): Promise<{ id: string; contentDigest: string; requestHash: string }> {
  const contentDigest = await sha256Hex(await file.arrayBuffer());
  const requestHash = await sha256Hex([
    'FREE-CRM:document-upload:v1',
    displayName,
    file.type,
    String(file.size),
    contentDigest,
  ].join('\n'));
  const idDigest = await sha256Hex(`FREE-CRM:document-upload-id:v1\n${workspaceId}\n${operationKey}`);
  return { id: `document-${idDigest.slice(0, 48)}`, contentDigest, requestHash };
}

export async function documentDeleteIdentity(
  workspaceId: string,
  operationKey: string,
  id: string,
): Promise<{ outboxId: string; requestHash: string; requestedAuditId: string; completedAuditId: string }> {
  const operationDigest = await sha256Hex(`FREE-CRM:document-delete-id:v1\n${workspaceId}\n${operationKey}`);
  const requestHash = await sha256Hex(`FREE-CRM:document-delete-request:v1\n${id}`);
  return {
    outboxId: `document-delete:${operationDigest}`,
    requestHash,
    requestedAuditId: `document-delete-requested:${operationDigest}`,
    completedAuditId: `document-delete-completed:${operationDigest}`,
  };
}

function validResponse(value: unknown): value is FileMutationResponse {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as { ok?: unknown }).ok === true
    && Boolean((value as { result?: unknown }).result)
    && typeof (value as { result?: unknown }).result === 'object'
    && !Array.isArray((value as { result?: unknown }).result);
}

export async function readFileMutationReceipt(
  db: D1Database,
  workspaceId: string,
  operation: typeof documentUploadOperation | typeof documentDeleteOperation,
  operationKey: string,
  requestHash?: string,
): Promise<FileMutationReceipt | null> {
  const row = await db.prepare(`
    SELECT request_hash,status_code,response_json
    FROM idempotency_records
    WHERE workspace_id=? AND operation=? AND key=?
    LIMIT 1
  `).bind(workspaceId, operation, operationKey).first<IdempotencyRow>();
  if (!row) return null;
  if (requestHash && row.request_hash !== requestHash) {
    throw new ApiError(409, 'idempotency_conflict', 'That Idempotency-Key was already used with a different file operation.');
  }
  const parsed = parseJson<unknown>(row.response_json, null);
  if (!validResponse(parsed)) throw new ApiError(503, 'file_receipt_invalid', 'The durable file-operation receipt could not be read.');
  const discardedByReset = parsed.result.discardedByReset === true;
  return { requestHash: row.request_hash, statusCode: row.status_code, response: parsed, discardedByReset };
}

export function completedReceiptResponse(receipt: FileMutationReceipt | null, expectedStatus: number): FileMutationResponse | null {
  if (!receipt || receipt.discardedByReset || receipt.statusCode !== expectedStatus) return null;
  return { ...receipt.response, replayed: true };
}

export function uploadDiscardedByReset(receipt: FileMutationReceipt | null): never | void {
  if (receipt?.discardedByReset) {
    throw new ApiError(409, 'workspace_mutation_stale', 'The workspace was reset before this upload completed. Select the file again to start a new upload.');
  }
}

export function deleteResponseAfterReset(receipt: FileMutationReceipt | null, id: string): FileMutationResponse | null {
  return receipt?.discardedByReset
    ? { ok: true, result: { id, deleted: true, discardedByReset: true }, replayed: true }
    : null;
}

function pendingExpiry(now: string): string {
  return new Date(Date.parse(now) + pendingReceiptLifetimeMs).toISOString();
}

function completedExpiry(now: string): string {
  return new Date(Date.parse(now) + completedReceiptLifetimeMs).toISOString();
}

export function pendingUploadReceiptStatement(
  db: D1Database,
  input: { workspaceId: string; operationKey: string; requestHash: string; response: FileMutationResponse; now: string },
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO idempotency_records (
      workspace_id,operation,key,request_hash,status_code,response_json,created_at,expires_at
    ) VALUES (?, ?, ?, ?, 202, ?, ?, ?)
    ON CONFLICT(workspace_id,operation,key) DO NOTHING
  `).bind(
    input.workspaceId,
    documentUploadOperation,
    input.operationKey,
    input.requestHash,
    JSON.stringify(input.response),
    input.now,
    pendingExpiry(input.now),
  );
}

export function completeUploadReceiptStatement(
  db: D1Database,
  input: { workspaceId: string; operationKey: string; requestHash: string; response: FileMutationResponse; now: string },
): D1PreparedStatement {
  return db.prepare(`
    UPDATE idempotency_records
    SET status_code=201,response_json=?,expires_at=?
    WHERE workspace_id=? AND operation=? AND key=? AND request_hash=? AND status_code=202
  `).bind(
    JSON.stringify(input.response),
    completedExpiry(input.now),
    input.workspaceId,
    documentUploadOperation,
    input.operationKey,
    input.requestHash,
  );
}

export async function prepareDocumentDelete(
  db: D1Database,
  input: {
    workspaceId: string;
    identity: RequestIdentity;
    id: string;
    objectKey: string | null;
    recordName: string;
    recordVersion: number;
    mutationEpoch: number;
    operationKey: string;
    requestHash: string;
    outboxId: string;
    requestedAuditId: string;
    now: string;
  },
): Promise<PendingDocumentDelete> {
  const payload: PendingDocumentDelete = {
    version: 1,
    id: input.id,
    objectKey: input.objectKey,
    mutationEpoch: input.mutationEpoch,
    operationKey: input.operationKey,
    requestHash: input.requestHash,
    actorUserId: input.identity.userId,
    requestId: input.identity.requestId,
  };
  const pendingResponse: FileMutationResponse = { ok: true, result: { id: input.id, deleting: true } };
  const statements = [
    db.prepare(`
      INSERT INTO idempotency_records (
        workspace_id,operation,key,request_hash,status_code,response_json,created_at,expires_at
      ) VALUES (?, ?, ?, ?, 202, ?, ?, ?)
    `).bind(
      input.workspaceId,
      documentDeleteOperation,
      input.operationKey,
      input.requestHash,
      JSON.stringify(pendingResponse),
      input.now,
      pendingExpiry(input.now),
    ),
    db.prepare(`
      INSERT INTO record_mutation_claims (workspace_id,record_id,expected_version,operation_id,claimed_at)
      VALUES (?,?,?,?,?)
    `).bind(input.workspaceId, input.id, input.recordVersion, input.outboxId, input.now),
    db.prepare(`
      UPDATE records
      SET status='deleting',archived_at=COALESCE(archived_at,?),version=version+1,updated_at=?
      WHERE workspace_id=? AND id=? AND version=?
    `).bind(input.now, input.now, input.workspaceId, input.id, input.recordVersion),
    db.prepare(`
      INSERT INTO audit_events (
        id,workspace_id,actor_user_id,action,entity_type,entity_id,before_json,
        metadata_json,request_id,created_at
      ) VALUES (?, ?, ?, 'document.delete.requested', 'document', ?, ?, ?, ?, ?)
    `).bind(
      input.requestedAuditId,
      input.workspaceId,
      input.identity.userId,
      input.id,
      JSON.stringify({ id: input.id, name: input.recordName }),
      JSON.stringify({ source: 'file-api', mutationEpoch: input.mutationEpoch }),
      input.identity.requestId,
      input.now,
    ),
    db.prepare(`
      INSERT INTO outbox_events (id,workspace_id,topic,payload_json,status,attempts,available_at,created_at)
      VALUES (?, ?, 'crm.document.delete_requested', ?, 'pending', 0, ?, ?)
    `).bind(input.outboxId, input.workspaceId, JSON.stringify(payload), input.now, input.now),
    workspaceMutationFence(db, input.workspaceId, input.mutationEpoch, `${input.outboxId}:requested`, input.now),
  ];
  await db.batch(assertD1BatchSize(statements, 'Document delete request'));
  return payload;
}

function validDeletePayload(value: unknown, workspaceId: string): value is PendingDocumentDelete {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Partial<PendingDocumentDelete>;
  if (payload.version !== 1
    || typeof payload.id !== 'string' || !payload.id || payload.id.length > 200
    || (payload.objectKey !== null && typeof payload.objectKey !== 'string')
    || !Number.isSafeInteger(payload.mutationEpoch) || (payload.mutationEpoch ?? -1) < 0
    || typeof payload.operationKey !== 'string' || !operationKeyPattern.test(payload.operationKey)
    || typeof payload.requestHash !== 'string' || !/^[0-9a-f]{64}$/.test(payload.requestHash)
    || typeof payload.actorUserId !== 'string' || !payload.actorUserId || payload.actorUserId.length > 512
    || typeof payload.requestId !== 'string' || !payload.requestId || payload.requestId.length > 128) return false;
  if (payload.objectKey !== null) {
    try {
      if (tenantObjectKey(workspaceId, payload.objectKey) !== payload.objectKey) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function markDeleteRetry(
  db: D1Database,
  workspaceId: string,
  outboxId: string,
  attempts: number,
): Promise<void> {
  const delaySeconds = Math.min(3_600, 2 ** Math.min(10, Math.max(0, attempts)));
  const availableAt = new Date(Date.now() + delaySeconds * 1_000).toISOString();
  await db.prepare(`
    UPDATE outbox_events
    SET attempts=attempts+1,available_at=?
    WHERE workspace_id=? AND id=? AND topic='crm.document.delete_requested' AND status='pending'
  `).bind(availableAt, workspaceId, outboxId).run();
}

async function markDeleteOutboxFailed(db: D1Database, workspaceId: string, outboxId: string): Promise<void> {
  await db.prepare(`
    UPDATE outbox_events
    SET status='failed',attempts=attempts+1,available_at=?
    WHERE workspace_id=? AND id=? AND topic='crm.document.delete_requested' AND status='pending'
  `).bind(new Date().toISOString(), workspaceId, outboxId).run();
}

export async function finalizeDocumentDelete(
  db: D1Database,
  input: {
    workspaceId: string;
    outboxId: string;
    completedAuditId: string;
    payload: PendingDocumentDelete;
    now: string;
  },
): Promise<FileMutationResponse> {
  const response: FileMutationResponse = { ok: true, result: { id: input.payload.id, deleted: true } };
  const receiptExists = `EXISTS (
    SELECT 1 FROM idempotency_records
    WHERE workspace_id=? AND operation=? AND key=? AND request_hash=? AND status_code=202
  )`;
  const receiptBindings = [input.workspaceId, documentDeleteOperation, input.payload.operationKey, input.payload.requestHash] as const;
  const statements = [
    db.prepare(`
      UPDATE upload_intents
      SET status='cleaned',lease_expires_at=NULL,last_error_code=NULL,
          cleanup_attempts=cleanup_attempts+1,updated_at=?
      WHERE workspace_id=? AND id=? AND status='committed' AND ${receiptExists}
    `).bind(input.now, input.workspaceId, input.payload.id, ...receiptBindings),
    db.prepare(`
      DELETE FROM records
      WHERE workspace_id=? AND id=? AND status='deleting' AND ${receiptExists}
    `).bind(input.workspaceId, input.payload.id, ...receiptBindings),
    db.prepare(`
      UPDATE outbox_events
      SET status='processed',attempts=attempts+1,available_at=?
      WHERE workspace_id=? AND id=? AND topic='crm.document.delete_requested' AND status='pending'
        AND ${receiptExists}
    `).bind(input.now, input.workspaceId, input.outboxId, ...receiptBindings),
    db.prepare(`
      INSERT INTO audit_events (
        id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at
      )
      SELECT ?, ?, ?, 'document.delete.completed', 'document', ?, ?, ?, ?
      WHERE ${receiptExists}
    `).bind(
      input.completedAuditId,
      input.workspaceId,
      input.payload.actorUserId,
      input.payload.id,
      JSON.stringify({ source: 'file-api', mutationEpoch: input.payload.mutationEpoch }),
      input.payload.requestId,
      input.now,
      ...receiptBindings,
    ),
    db.prepare(`
      UPDATE idempotency_records
      SET status_code=200,response_json=?,expires_at=?
      WHERE workspace_id=? AND operation=? AND key=? AND request_hash=? AND status_code=202
    `).bind(
      JSON.stringify(response),
      completedExpiry(input.now),
      input.workspaceId,
      documentDeleteOperation,
      input.payload.operationKey,
      input.payload.requestHash,
    ),
    workspaceMutationFence(db, input.workspaceId, input.payload.mutationEpoch, `${input.outboxId}:completed`, input.now),
  ];
  const results = await db.batch(assertD1BatchSize(statements, 'Document delete completion'));
  if (changed(results[4]) !== 1) throw new ApiError(503, 'document_delete_finalize_unknown', 'The document delete receipt could not be finalized. It remains queued for recovery.');
  return response;
}

export async function executeDurableDocumentDelete(steps: {
  deleteObject: () => Promise<void>;
  finalize: () => Promise<FileMutationResponse>;
  recoverCommitted: () => Promise<FileMutationResponse | null>;
  markRetry: () => Promise<void>;
}): Promise<FileMutationResponse> {
  try {
    await steps.deleteObject();
  } catch {
    await steps.markRetry().catch(() => undefined);
    throw new ApiError(503, 'document_delete_storage_pending', 'The stored file could not be removed yet. Deletion is queued and can be resumed safely.');
  }
  try {
    return await steps.finalize();
  } catch (error) {
    try {
      const recovered = await steps.recoverCommitted();
      if (recovered) return recovered;
    } catch {
      throw new ApiError(503, 'document_delete_finalize_unknown', 'The delete commit could not be confirmed. Its durable receipt remains queued for recovery.');
    }
    await steps.markRetry().catch(() => undefined);
    const causeCode = error instanceof ApiError ? error.code : 'database_unavailable';
    throw new ApiError(503, 'document_delete_completion_pending', 'The stored bytes were removed, but database completion is still queued. Retry with the same Idempotency-Key.', { causeCode });
  }
}

export async function resumeDocumentDelete(
  db: D1Database,
  storage: TenantObjectStorage,
  workspaceId: string,
  outbox: DeleteOutboxRow,
): Promise<FileMutationResponse> {
  const parsed = parseJson<unknown>(outbox.payload_json, null);
  if (!validDeletePayload(parsed, workspaceId)) {
    await markDeleteOutboxFailed(db, workspaceId, outbox.id);
    throw new ApiError(503, 'document_delete_receipt_invalid', 'A queued document delete has an invalid durable payload and was stopped before touching storage.');
  }
  const identity = await documentDeleteIdentity(workspaceId, parsed.operationKey, parsed.id);
  if (identity.outboxId !== outbox.id) {
    await markDeleteOutboxFailed(db, workspaceId, outbox.id);
    throw new ApiError(503, 'document_delete_receipt_invalid', 'A queued document delete failed its operation identity check and was stopped before touching storage.');
  }
  const receipt = await readFileMutationReceipt(
    db,
    workspaceId,
    documentDeleteOperation,
    parsed.operationKey,
    parsed.requestHash,
  );
  const completed = completedReceiptResponse(receipt, 200);
  if (completed) return completed;
  const resetCompletion = deleteResponseAfterReset(receipt, parsed.id);
  if (resetCompletion) return resetCompletion;
  if (!receipt || receipt.statusCode !== 202) {
    await markDeleteOutboxFailed(db, workspaceId, outbox.id);
    throw new ApiError(503, 'document_delete_receipt_missing', 'A queued document delete lost its tenant receipt and was stopped before touching storage.');
  }
  return executeDurableDocumentDelete({
    deleteObject: async () => {
      if (parsed.objectKey) await storage.delete(workspaceId, parsed.objectKey);
    },
    finalize: () => finalizeDocumentDelete(db, {
      workspaceId,
      outboxId: outbox.id,
      completedAuditId: identity.completedAuditId,
      payload: parsed,
      now: new Date().toISOString(),
    }),
    recoverCommitted: async () => {
      const recovered = await readFileMutationReceipt(
        db,
        workspaceId,
        documentDeleteOperation,
        parsed.operationKey,
        parsed.requestHash,
      );
      return completedReceiptResponse(recovered, 200) ?? deleteResponseAfterReset(recovered, parsed.id);
    },
    markRetry: () => markDeleteRetry(db, workspaceId, outbox.id, outbox.attempts),
  });
}

export async function retryDocumentDeleteOutbox(
  db: D1Database,
  storage: TenantObjectStorage,
  workspaceId: string,
  limit = 2,
): Promise<number> {
  const boundedLimit = Math.max(1, Math.min(3, Math.trunc(limit)));
  const rows = await db.prepare(`
    SELECT id,payload_json,attempts
    FROM outbox_events
    WHERE workspace_id=? AND topic='crm.document.delete_requested'
      AND status='pending' AND available_at<=?
    ORDER BY available_at ASC,created_at ASC
    LIMIT ?
  `).bind(workspaceId, new Date().toISOString(), boundedLimit).all<DeleteOutboxRow>();
  let completed = 0;
  for (const row of rows.results) {
    try {
      await resumeDocumentDelete(db, storage, workspaceId, row);
      completed += 1;
    } catch {
      // Each row remains pending with bounded backoff, or is failed closed when
      // its durable tenant identity is invalid. A later request resumes it.
    }
  }
  return completed;
}

export async function loadDocumentDeleteOutbox(
  db: D1Database,
  workspaceId: string,
  outboxId: string,
): Promise<DeleteOutboxRow | null> {
  return db.prepare(`
    SELECT id,payload_json,attempts
    FROM outbox_events
    WHERE workspace_id=? AND id=? AND topic='crm.document.delete_requested'
    LIMIT 1
  `).bind(workspaceId, outboxId).first<DeleteOutboxRow>();
}
