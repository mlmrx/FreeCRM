import { getD1 } from '@/db';
import { ApiError, apiResponse, requestErrorResponse, requireActivatedRuntime } from '@/server/request-context';
import { resolveCapabilities, type CapabilityOverride } from '@/lib/multi-edition';
import { platformLimits } from '@/lib/platform-limits';
import { normalizeMutationFenceError, workspaceMutationFence } from '@/server/mutation-fence';

export const dynamic = 'force-dynamic';

async function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    requireActivatedRuntime();
    const suppliedKey = request.headers.get('x-free-crm-webhook-key') ?? '';
    if (suppliedKey.length < 32 || suppliedKey.length > 512 || /[\u0000-\u001f\u007f]/.test(suppliedKey)) throw new ApiError(401, 'invalid_webhook_key', 'Webhook authentication failed.');
    const { workspaceId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId)) throw new ApiError(404, 'workspace_not_found', 'Workspace not found.');
    const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) throw new ApiError(415, 'content_type_required', 'Webhook Content-Type must be application/json.');
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > 256_000) throw new ApiError(413, 'request_too_large', 'Webhook body exceeds 256 KB.');
    // Capture the authenticated connection generation and workspace epoch
    // before buffering the body so a slow delivery cannot cross a reset.
    const db = getD1();
    const workspace = await db.prepare(`SELECT w.id,w.owner_user_id,w.currency,w.profile,w.mutation_epoch,c.id AS connection_id,c.credential_ref,c.credential_generation,c.webhook_receipt_count FROM workspaces w JOIN connector_connections c ON c.workspace_id=w.id AND c.connector_key='webhook-simulator' AND c.status='connected' WHERE w.id=? LIMIT 1`).bind(workspaceId).first<{ id: string; owner_user_id: string; currency: string; profile: 'personal' | 'business' | 'enterprise'; mutation_epoch: number; connection_id: string; credential_ref: string | null; credential_generation: number; webhook_receipt_count: number }>();
    const storedHash = workspace?.credential_ref?.startsWith('sha256:') ? workspace.credential_ref.slice(7) : '';
    if (!workspace || storedHash.length !== 64 || !await constantTimeEqual(await sha256(suppliedKey), storedHash)) throw new ApiError(401, 'invalid_webhook_key', 'Webhook authentication failed.');
    const connection = { id: workspace.connection_id };
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > 256_000) throw new ApiError(413, 'request_too_large', 'Webhook body exceeds 256 KB.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      throw new ApiError(400, 'invalid_json', 'Webhook body must be JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ApiError(400, 'invalid_payload', 'Webhook body must be a JSON object.');
    const body = parsed as Record<string, unknown>;
    const rawEventId = body.eventId ?? request.headers.get('x-event-id');
    if (typeof rawEventId !== 'string' || !rawEventId.trim() || rawEventId.length > 128 || /[\u0000-\u001f\u007f]/.test(rawEventId)) throw new ApiError(400, 'event_id_required', 'eventId must be a non-empty string of at most 128 characters.');
    const eventId = rawEventId.trim();
    const payloadHash = await sha256(bodyText);
    const overrides = await db.prepare('SELECT capability_key,enabled FROM capability_overrides WHERE workspace_id=?').bind(workspaceId).all<{ capability_key: string; enabled: number }>();
    const resolvedCapabilities = resolveCapabilities(workspace.profile, Object.fromEntries(overrides.results.map((row) => [row.capability_key, Boolean(row.enabled)])) as CapabilityOverride);
    const capability = resolvedCapabilities.integrations;
    if (!capability.enabled) throw new ApiError(403, 'capability_disabled', 'Integrations is disabled for this workspace.');
    if (!resolvedCapabilities.relationships.enabled) throw new ApiError(403, 'capability_disabled', 'Relationships is disabled for this workspace.');
    const duplicate = await db.prepare(`SELECT id,payload_hash FROM webhook_deliveries WHERE workspace_id=? AND connection_id=? AND provider_delivery_id=? LIMIT 1`).bind(workspaceId, connection.id, eventId).first<{ id: string; payload_hash: string }>();
    if (duplicate) {
      if (duplicate.payload_hash !== payloadHash) throw new ApiError(409, 'delivery_conflict', 'That eventId was already used with a different payload.');
      return apiResponse({ ok: true, duplicate: true, eventId });
    }
    const now = new Date().toISOString();
    const dayCutoff = new Date(Date.now() - 86_400_000).toISOString();
    const retentionCutoff = new Date(Date.now() - platformLimits.webhookReceiptRetentionDays * 86_400_000).toISOString();
    // Expired receipts are pruned in a separate bounded transaction. Keeping
    // cleanup outside the ingest batch lets an upgraded over-cap connection
    // make durable progress even while the capacity trigger rejects new rows.
    await db.prepare(`DELETE FROM webhook_deliveries WHERE rowid IN (
      SELECT rowid FROM webhook_deliveries
      WHERE workspace_id=? AND connection_id=? AND received_at < ?
      ORDER BY received_at ASC LIMIT ?
    )`).bind(workspaceId, connection.id, retentionCutoff, platformLimits.webhookReceiptPruneBatch).run();
    const recent = await db.prepare('SELECT COUNT(*) AS count FROM webhook_deliveries WHERE workspace_id=? AND connection_id=? AND received_at >= ?').bind(workspaceId, connection.id, dayCutoff).first<{ count: number }>();
    if ((recent?.count ?? 0) >= platformLimits.webhookDeliveriesPerDay) throw new ApiError(429, 'webhook_rate_limited', 'Webhook delivery limit reached for this connection.');
    const receiptState = await db.prepare('SELECT webhook_receipt_count FROM connector_connections WHERE workspace_id=? AND id=?').bind(workspaceId, connection.id).first<{ webhook_receipt_count: number }>();
    if (!receiptState || receiptState.webhook_receipt_count >= platformLimits.webhookReceiptsPerConnection) throw new ApiError(429, 'webhook_receipt_capacity', 'Webhook receipt capacity reached for this connection. Expired receipts are being pruned in bounded batches; retry shortly.');
    const recordLimit = resolvedCapabilities.relationships.limit;
    if (recordLimit !== null) {
      const usage = await db.prepare("SELECT COUNT(*) AS count FROM records WHERE workspace_id=? AND object_type IN ('lead','contact','company','activity','task','document') AND archived_at IS NULL").bind(workspaceId).first<{ count: number }>();
      if ((usage?.count ?? 0) >= recordLimit) throw new ApiError(409, 'capability_limit', 'Relationships has reached its workspace limit.');
    }
    const recordId = crypto.randomUUID();
    const deliveryId = crypto.randomUUID();
    const outboxId = crypto.randomUUID();
    const name = String(body.name ?? body.subject ?? 'Webhook activity').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 240) || 'Webhook activity';
    const payloadSummary = Object.fromEntries(['type', 'provider', 'externalId', 'status', 'channel']
      .filter((key) => ['string', 'number', 'boolean'].includes(typeof body[key]))
      .map((key) => [key, typeof body[key] === 'string' ? String(body[key]).slice(0, 500) : body[key]]));
    try {
      await db.batch([
      db.prepare(`
        INSERT INTO records (
          id, workspace_id, object_type, name, status, lifecycle, owner_user_id,
          amount_cents, currency, probability, source, fields_json, tags_json, version, created_at, updated_at
        ) VALUES (?, ?, 'activity', ?, 'completed', 'active', ?, 0, ?, 0, 'Webhook', ?, '["Webhook"]', 1, ?, ?)
      `).bind(recordId, workspaceId, name, workspace.owner_user_id, workspace.currency, JSON.stringify({ eventId, payload: payloadSummary, occurredAt: now }), now, now),
      db.prepare(`INSERT INTO webhook_deliveries (id,workspace_id,connection_id,provider_delivery_id,status,attempts,payload_hash,received_at,processed_at,credential_generation) VALUES (?,?,?,?,'processed',1,?,?,?,?)`).bind(deliveryId, workspaceId, connection.id, eventId, payloadHash, now, now, workspace.credential_generation),
      db.prepare(`INSERT INTO outbox_events (id,workspace_id,topic,payload_json,status,attempts,available_at,created_at) VALUES (?,?, 'connector.webhook.received',?,'pending',0,?,?)`).bind(outboxId, workspaceId, JSON.stringify({ connectionId: connection.id, deliveryId, eventId, recordId }), now, now),
      db.prepare(`UPDATE connector_connections SET health='healthy',last_error_code=NULL,updated_at=? WHERE workspace_id=? AND id=?`).bind(now, workspaceId, connection.id),
      db.prepare(`
        INSERT INTO audit_events (id, workspace_id, actor_user_id, action, entity_type, entity_id, after_json, metadata_json, request_id, created_at)
        VALUES (?, ?, 'webhook', 'webhook.received', 'activity', ?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID(), workspaceId, recordId, JSON.stringify({ name }), JSON.stringify({ eventId, deliveryId, payloadHash }), eventId, now),
      workspaceMutationFence(db, workspaceId, workspace.mutation_epoch, `webhook:${connection.id}:${eventId}`, now),
      ]);
    } catch (error) {
      // The unique delivery fence handles concurrent retries that both pass the
      // preflight. D1 batches are atomic, so no duplicate activity can commit.
      const committed = await db.prepare(`SELECT id,payload_hash FROM webhook_deliveries WHERE workspace_id=? AND connection_id=? AND provider_delivery_id=? LIMIT 1`).bind(workspaceId, connection.id, eventId).first<{ id: string; payload_hash: string }>();
      if (committed?.payload_hash === payloadHash) return apiResponse({ ok: true, duplicate: true, eventId });
      if (committed) throw new ApiError(409, 'delivery_conflict', 'That eventId was already used with a different payload.');
      if (String(error).includes('webhook credential changed')) throw new ApiError(409, 'webhook_credential_changed', 'The webhook key changed while this delivery was being processed. Retry with the active key.');
      if (String(error).includes('webhook receipt capacity exceeded')) throw new ApiError(429, 'webhook_receipt_capacity', 'Webhook receipt capacity reached for this connection. Retry after the retention window advances.');
      throw normalizeMutationFenceError(error);
    }
    return apiResponse({ ok: true, duplicate: false, eventId, deliveryId, recordId }, { status: 202 });
  } catch (error) {
    return requestErrorResponse(request, error);
  }
}
