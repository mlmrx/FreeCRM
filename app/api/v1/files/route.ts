import { getD1, getFiles } from '@/db';
import { ensureWorkspace } from '@/server/control-plane';
import { getRecord } from '@/server/data-plane';
import { ApiError, apiResponse, errorResponse, getRequestIdentity, requestErrorResponse, requireSafeMutation } from '@/server/request-context';
import { R2TenantObjectStorage, tenantEpochObjectKey } from '@/server/object-storage';
import { requirePermission } from '@/server/authorization';
import { requireCapability } from '@/server/capabilities';
import { captureWorkspaceMutationEpoch, normalizeMutationFenceError, workspaceMutationFence } from '@/server/mutation-fence';
import { assertD1BatchSize } from '@/server/d1-limits';
import {
  completeUploadReceiptStatement,
  completedReceiptResponse,
  deleteResponseAfterReset,
  documentDeleteIdentity,
  documentDeleteOperation,
  documentUploadIdentity,
  documentUploadOperation,
  loadDocumentDeleteOutbox,
  prepareDocumentDelete,
  readFileMutationReceipt,
  requireFileOperationKey,
  resumeDocumentDelete,
  sha256Hex,
  uploadDiscardedByReset,
  type FileMutationResponse,
} from '@/server/file-mutations';
import {
  claimDocumentUpload,
  executeDurableUploadIntent,
  markUploadIntentCleaned,
  markUploadIntentCleanupPending,
  retryUploadIntentCleanup,
} from '@/server/upload-intents';

export const dynamic = 'force-dynamic';

const maxFileBytes = process.env.VERCEL ? 4 * 1024 * 1024 : 10 * 1024 * 1024;
const maxRequestBytes = maxFileBytes + 256 * 1024;
const maxFileLabel = process.env.VERCEL ? '4 MB' : '10 MB';

const allowedTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 180) || 'document';
}

async function validateFileSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  const valid = file.type === 'application/pdf' ? starts(0x25, 0x50, 0x44, 0x46)
    : file.type === 'image/png' ? starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
      : file.type === 'image/jpeg' ? starts(0xff, 0xd8, 0xff)
        : file.type.includes('openxmlformats-officedocument') ? starts(0x50, 0x4b)
          : true;
  if (!valid) throw new ApiError(415, 'file_signature_invalid', 'The file contents do not match the declared file type.');
  if (file.type === 'application/json') {
    try { JSON.parse(await file.text()); } catch { throw new ApiError(415, 'file_signature_invalid', 'The uploaded JSON file is not valid JSON.'); }
  }
}

export async function POST(request: Request) {
  try {
    await requireSafeMutation(request, 'multipart/form-data');
    const operationKey = requireFileOperationKey(request);
    const declaredHeader = request.headers.get('content-length');
    if (!declaredHeader) throw new ApiError(411, 'content_length_required', `Upload Content-Length is required so the ${maxFileLabel} limit can be enforced before buffering.`);
    const declared = Number(declaredHeader);
    if (!Number.isFinite(declared) || declared < 0 || declared > maxRequestBytes) throw new ApiError(413, 'file_size_invalid', `Upload request exceeds the ${maxFileLabel} file limit.`);
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const files = new R2TenantObjectStorage(getFiles());
    const context = await ensureWorkspace(db, identity);
    requirePermission(context.workspace.role, 'records:write');
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError(400, 'file_required', 'Choose a file to upload.');
    if (file.size === 0 || file.size > maxFileBytes) throw new ApiError(413, 'file_size_invalid', `Files must be between 1 byte and ${maxFileLabel}.`);
    if (!allowedTypes.has(file.type)) throw new ApiError(415, 'file_type_invalid', 'That file type is not supported.');
    await validateFileSignature(file);
    const now = new Date().toISOString();
    const name = safeName(file.name);
    const uploadIdentity = await documentUploadIdentity(context.workspaceId, operationKey, file, name);
    const id = uploadIdentity.id;
    const existingReceipt = await readFileMutationReceipt(
      db,
      context.workspaceId,
      documentUploadOperation,
      operationKey,
      uploadIdentity.requestHash,
    );
    uploadDiscardedByReset(existingReceipt);
    const replay = completedReceiptResponse(existingReceipt, 201);
    if (replay) return apiResponse(replay, { status: 201 });

    const capability = await requireCapability(db, context, 'relationships');
    if (capability.limit !== null) {
      const usage = await db.prepare("SELECT COUNT(*) AS count FROM records WHERE workspace_id=? AND object_type IN ('lead','contact','company','activity','task','document') AND archived_at IS NULL").bind(context.workspaceId).first<{ count: number }>();
      if ((usage?.count ?? 0) >= capability.limit) throw new ApiError(409, 'capability_limit', `${capability.label} has reached its workspace limit.`);
    }
    const mutationEpoch = await captureWorkspaceMutationEpoch(db, context.workspaceId);
    // Keep the durable cross-store key opaque: the display filename belongs in
    // resettable record metadata, not in the retained upload receipt. Binding
    // the key to this epoch prevents stale reset cleaners from selecting bytes
    // written after their own reset boundary.
    const objectKey = tenantEpochObjectKey(context.workspaceId, mutationEpoch, `${id}/blob`);
    const fields = { objectKey, contentType: file.type, size: file.size, uploadedAt: now };
    const response: FileMutationResponse = { ok: true, result: { id, name, fields } };
    const pendingResponse: FileMutationResponse = { ok: true, result: { id, name, fields, uploading: true } };
    await retryUploadIntentCleanup(db, files, context.workspaceId);
    const claim = await claimDocumentUpload(db, {
      workspaceId: context.workspaceId,
      id,
      objectKey,
      mutationEpoch,
      operationKey,
      requestHash: uploadIdentity.requestHash,
      pendingResponse,
      now,
    });
    if (claim.status === 'committed') {
      const committed = await readFileMutationReceipt(
        db,
        context.workspaceId,
        documentUploadOperation,
        operationKey,
        uploadIdentity.requestHash,
      );
      const committedResponse = completedReceiptResponse(committed, 201);
      if (committedResponse) return apiResponse(committedResponse, { status: 201 });
      throw new ApiError(503, 'upload_finalize_unknown', 'The upload is committed but its response receipt is unavailable. Retry after the database recovers.');
    }
    const result = await executeDurableUploadIntent({
      // The intent and its pending HTTP receipt were acquired atomically above.
      register: async () => {
        return undefined;
      },
      put: async () => {
        try {
          const storedKey = await files.put(context.workspaceId, objectKey, file.stream(), {
            contentType: file.type,
            contentDisposition: `attachment; filename="${name}"`,
            metadata: { recordId: id },
          });
          if (storedKey !== objectKey) throw new ApiError(500, 'storage_key_mismatch', 'Object storage returned an unexpected tenant key.');
        } catch (putError) {
          // Vercel Blob rejects an overwrite. A prior PUT can nevertheless have
          // committed before its response was lost, so accept the deterministic
          // object only after hashing the stored bytes against this exact request.
          try {
            const stored = await files.get(context.workspaceId, objectKey);
            if (stored) {
              const storedDigest = await sha256Hex(await new Response(stored.body).arrayBuffer());
              if (storedDigest === uploadIdentity.contentDigest) return;
            }
          } catch {
            // Preserve the original PUT failure; compensation below remains safe.
          }
          throw putError;
        }
      },
      finalize: async () => {
        const results = await db.batch(assertD1BatchSize([
          db.prepare(`
            INSERT INTO records (
              id, workspace_id, object_type, name, status, lifecycle, owner_user_id,
              amount_cents, currency, probability, fields_json, tags_json, version, created_at, updated_at
            ) VALUES (?, ?, 'document', ?, 'active', 'active', ?, 0, ?, 0, ?, '[]', 1, ?, ?)
          `).bind(id, context.workspaceId, name, identity.userId, context.workspace.currency, JSON.stringify(fields), now, now),
          db.prepare(`
            UPDATE upload_intents
            SET status='committed',lease_expires_at=NULL,last_error_code=NULL,updated_at=?
            WHERE workspace_id=? AND id=? AND mutation_epoch=?
          `).bind(now, context.workspaceId, id, mutationEpoch),
          db.prepare(`
            INSERT INTO audit_events (id, workspace_id, actor_user_id, action, entity_type, entity_id, after_json, metadata_json, request_id, created_at)
            VALUES (?, ?, ?, 'document.upload', 'document', ?, ?, ?, ?, ?)
          `).bind(crypto.randomUUID(), context.workspaceId, identity.userId, id, JSON.stringify({ name, contentType: file.type, size: file.size }), JSON.stringify({ source: 'file-api', mutationEpoch }), identity.requestId, now),
          db.prepare(`
            INSERT INTO outbox_events (id, workspace_id, topic, payload_json, status, attempts, available_at, created_at)
            VALUES (?, ?, 'crm.document.uploaded', ?, 'pending', 0, ?, ?)
          `).bind(crypto.randomUUID(), context.workspaceId, JSON.stringify({ id, name }), now, now),
          completeUploadReceiptStatement(db, {
            workspaceId: context.workspaceId,
            operationKey,
            requestHash: uploadIdentity.requestHash,
            response,
            now,
          }),
          workspaceMutationFence(db, context.workspaceId, mutationEpoch, `document.upload:${id}`, now),
        ], 'Document upload completion'));
        if (Number(results[4].meta?.changes ?? 0) !== 1) {
          throw new ApiError(503, 'upload_finalize_unknown', 'The upload response receipt could not be finalized. Retry to recover its durable result.');
        }
        return response;
      },
      recoverCommitted: async () => {
        const receipt = await readFileMutationReceipt(
          db,
          context.workspaceId,
          documentUploadOperation,
          operationKey,
          uploadIdentity.requestHash,
        );
        const committed = completedReceiptResponse(receipt, 201);
        return committed ? { committed: true as const, value: committed } : { committed: false as const };
      },
      deleteObject: () => files.delete(context.workspaceId, objectKey),
      markCleaned: () => markUploadIntentCleaned(db, {
        workspaceId: context.workspaceId,
        id,
        mutationEpoch,
        now: new Date().toISOString(),
      }),
      markCleanupPending: (errorCode) => markUploadIntentCleanupPending(db, {
        workspaceId: context.workspaceId,
        id,
        mutationEpoch,
        errorCode,
        now: new Date().toISOString(),
      }),
    });
    return apiResponse(result, { status: 201 });
  } catch (error) {
    return requestErrorResponse(request, normalizeMutationFenceError(error));
  }
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const context = await ensureWorkspace(db, identity);
    requirePermission(context.workspace.role, 'records:read');
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new ApiError(400, 'id_required', 'Document id is required.');
    const record = await getRecord(db, context.workspaceId, id);
    if (record.objectType !== 'document') throw new ApiError(404, 'document_not_found', 'Document not found.');
    const key = typeof record.fields.objectKey === 'string' ? record.fields.objectKey : null;
    if (record.status === 'deleting') throw new ApiError(404, 'document_not_found', 'Document not found.');
    if (!key) throw new ApiError(404, 'document_unavailable', 'This demo document has metadata only. Upload a real file to download it.');
    const object = await new R2TenantObjectStorage(getFiles()).get(context.workspaceId, key);
    if (!object) throw new ApiError(404, 'document_unavailable', 'Document bytes are unavailable.');
    const headers = new Headers();
    object.applyHttpMetadata(headers);
    headers.set('content-disposition', `attachment; filename="${safeName(record.name)}"`);
    headers.set('etag', object.etag);
    headers.set('cache-control', 'private, no-store');
    headers.set('x-content-type-options', 'nosniff');
    await db.prepare(`INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at) VALUES (?,?,?,'document.download','document',?,'{}',?,?)`).bind(crypto.randomUUID(), context.workspaceId, identity.userId, id, identity.requestId, new Date().toISOString()).run();
    return new Response(object.body, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireSafeMutation(request);
    const operationKey = requireFileOperationKey(request);
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const files = new R2TenantObjectStorage(getFiles());
    const context = await ensureWorkspace(db, identity);
    requirePermission(context.workspace.role, 'records:write');
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new ApiError(400, 'id_required', 'Document id is required.');
    const operation = await documentDeleteIdentity(context.workspaceId, operationKey, id);
    let receipt = await readFileMutationReceipt(
      db,
      context.workspaceId,
      documentDeleteOperation,
      operationKey,
      operation.requestHash,
    );
    const completed = completedReceiptResponse(receipt, 200) ?? deleteResponseAfterReset(receipt, id);
    if (completed) return apiResponse(completed);

    let outbox = await loadDocumentDeleteOutbox(db, context.workspaceId, operation.outboxId);
    if (!receipt) {
      const mutationEpoch = await captureWorkspaceMutationEpoch(db, context.workspaceId);
      const record = await getRecord(db, context.workspaceId, id);
      if (record.objectType !== 'document') throw new ApiError(404, 'document_not_found', 'Document not found.');
      if (record.status === 'deleting') throw new ApiError(409, 'document_delete_in_progress', 'This document already has a delete in progress. Resume it with the original Idempotency-Key.');
      const objectKey = typeof record.fields.objectKey === 'string' ? record.fields.objectKey : null;
      const now = new Date().toISOString();
      try {
        await prepareDocumentDelete(db, {
          workspaceId: context.workspaceId,
          identity,
          id,
          objectKey,
          recordName: record.name,
          recordVersion: record.version,
          mutationEpoch,
          operationKey,
          requestHash: operation.requestHash,
          outboxId: operation.outboxId,
          requestedAuditId: operation.requestedAuditId,
          now,
        });
      } catch (prepareError) {
        receipt = await readFileMutationReceipt(
          db,
          context.workspaceId,
          documentDeleteOperation,
          operationKey,
          operation.requestHash,
        );
        if (!receipt) throw prepareError;
      }
      outbox = await loadDocumentDeleteOutbox(db, context.workspaceId, operation.outboxId);
    }
    if (!outbox) {
      const resetCompletion = deleteResponseAfterReset(receipt, id);
      if (resetCompletion) return apiResponse(resetCompletion);
      throw new ApiError(503, 'document_delete_receipt_missing', 'The document delete is pending but its durable outbox item is unavailable. No storage action was attempted.');
    }
    const result = await resumeDocumentDelete(db, files, context.workspaceId, outbox);
    return apiResponse(result);
  } catch (error) {
    return requestErrorResponse(request, normalizeMutationFenceError(error));
  }
}
