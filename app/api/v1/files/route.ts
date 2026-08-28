import { getD1, getFiles } from '@/db';
import { ensureWorkspace } from '@/server/control-plane';
import { getRecord } from '@/server/data-plane';
import { ApiError, apiResponse, errorResponse, getRequestIdentity } from '@/server/request-context';

export const dynamic = 'force-dynamic';

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

export async function POST(request: Request) {
  let objectKey: string | null = null;
  try {
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const files = getFiles();
    const context = await ensureWorkspace(db, identity);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError(400, 'file_required', 'Choose a file to upload.');
    if (file.size === 0 || file.size > 10 * 1024 * 1024) throw new ApiError(413, 'file_size_invalid', 'Files must be between 1 byte and 10 MB.');
    if (!allowedTypes.has(file.type)) throw new ApiError(415, 'file_type_invalid', 'That file type is not supported.');
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const name = safeName(file.name);
    objectKey = `${context.workspaceId}/${id}/${name}`;
    await files.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type, contentDisposition: `attachment; filename="${name}"` }, customMetadata: { workspaceId: context.workspaceId, recordId: id } });
    const fields = { objectKey, contentType: file.type, size: file.size, uploadedAt: now };
    await db.batch([
      db.prepare(`
        INSERT INTO records (
          id, workspace_id, object_type, name, status, lifecycle, owner_user_id,
          amount_cents, currency, probability, fields_json, tags_json, version, created_at, updated_at
        ) VALUES (?, ?, 'document', ?, 'active', 'active', ?, 0, ?, 0, ?, '[]', 1, ?, ?)
      `).bind(id, context.workspaceId, name, identity.userId, context.workspace.currency, JSON.stringify(fields), now, now),
      db.prepare(`
        INSERT INTO audit_events (id, workspace_id, actor_user_id, action, entity_type, entity_id, after_json, metadata_json, request_id, created_at)
        VALUES (?, ?, ?, 'document.upload', 'document', ?, ?, '{}', ?, ?)
      `).bind(crypto.randomUUID(), context.workspaceId, identity.userId, id, JSON.stringify({ name, contentType: file.type, size: file.size }), identity.requestId, now),
      db.prepare(`
        INSERT INTO outbox_events (id, workspace_id, topic, payload_json, status, attempts, available_at, created_at)
        VALUES (?, ?, 'crm.document.uploaded', ?, 'pending', 0, ?, ?)
      `).bind(crypto.randomUUID(), context.workspaceId, JSON.stringify({ id, name }), now, now),
    ]);
    return apiResponse({ ok: true, result: { id, name, fields } }, { status: 201 });
  } catch (error) {
    if (objectKey) await getFiles().delete(objectKey).catch(() => undefined);
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const context = await ensureWorkspace(db, identity);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new ApiError(400, 'id_required', 'Document id is required.');
    const record = await getRecord(db, context.workspaceId, id);
    if (record.objectType !== 'document') throw new ApiError(404, 'document_not_found', 'Document not found.');
    const key = typeof record.fields.objectKey === 'string' ? record.fields.objectKey : null;
    if (!key) throw new ApiError(404, 'document_unavailable', 'This demo document has metadata only. Upload a real file to download it.');
    const object = await getFiles().get(key);
    if (!object) throw new ApiError(404, 'document_unavailable', 'Document bytes are unavailable.');
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'private, no-store');
    headers.set('x-content-type-options', 'nosniff');
    return new Response(object.body, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const files = getFiles();
    const context = await ensureWorkspace(db, identity);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new ApiError(400, 'id_required', 'Document id is required.');
    const record = await getRecord(db, context.workspaceId, id);
    if (record.objectType !== 'document') throw new ApiError(404, 'document_not_found', 'Document not found.');
    const key = typeof record.fields.objectKey === 'string' ? record.fields.objectKey : null;
    if (key) await files.delete(key);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare('DELETE FROM records WHERE workspace_id = ? AND id = ?').bind(context.workspaceId, id),
      db.prepare(`
        INSERT INTO audit_events (id, workspace_id, actor_user_id, action, entity_type, entity_id, before_json, metadata_json, request_id, created_at)
        VALUES (?, ?, ?, 'document.delete', 'document', ?, ?, '{}', ?, ?)
      `).bind(crypto.randomUUID(), context.workspaceId, identity.userId, id, JSON.stringify({ id, name: record.name }), identity.requestId, now),
      db.prepare(`
        INSERT INTO outbox_events (id, workspace_id, topic, payload_json, status, attempts, available_at, created_at)
        VALUES (?, ?, 'crm.document.deleted', ?, 'pending', 0, ?, ?)
      `).bind(crypto.randomUUID(), context.workspaceId, JSON.stringify({ id }), now, now),
    ]);
    return apiResponse({ ok: true, result: { id, deleted: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
