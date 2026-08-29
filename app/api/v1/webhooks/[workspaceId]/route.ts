import { env } from 'cloudflare:workers';
import { getD1 } from '@/db';
import { ApiError, apiResponse, errorResponse } from '@/server/request-context';

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
    const configuredKey = env.FREE_CRM_WEBHOOK_KEY;
    if (!configuredKey) throw new ApiError(503, 'webhook_not_configured', 'The webhook connector is not configured.');
    const suppliedKey = request.headers.get('x-free-crm-webhook-key') ?? '';
    if (!suppliedKey || !await constantTimeEqual(suppliedKey, configuredKey)) throw new ApiError(401, 'invalid_webhook_key', 'Webhook authentication failed.');
    const { workspaceId } = await context.params;
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > 256_000) throw new ApiError(413, 'request_too_large', 'Webhook body exceeds 256 KB.');
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
    const eventId = String(body.eventId ?? request.headers.get('x-event-id') ?? '').slice(0, 128);
    if (!eventId) throw new ApiError(400, 'event_id_required', 'eventId is required for replay protection.');
    const db = getD1();
    const workspace = await db.prepare('SELECT id, owner_user_id, currency FROM workspaces WHERE id = ? LIMIT 1').bind(workspaceId).first<{ id: string; owner_user_id: string; currency: string }>();
    if (!workspace) throw new ApiError(404, 'workspace_not_found', 'Workspace not found.');
    const connection = await db.prepare(`SELECT id FROM connector_connections WHERE workspace_id=? AND connector_key='webhook-simulator' AND status='connected' LIMIT 1`).bind(workspaceId).first<{ id: string }>();
    if (!connection) throw new ApiError(409, 'connector_unavailable', 'The workspace webhook simulator is not connected.');
    const duplicate = await db.prepare(`SELECT id FROM webhook_deliveries WHERE workspace_id=? AND connection_id=? AND provider_delivery_id=? LIMIT 1`).bind(workspaceId, connection.id, eventId).first<{ id: string }>();
    if (duplicate) return apiResponse({ ok: true, duplicate: true, eventId });
    const now = new Date().toISOString();
    const recordId = crypto.randomUUID();
    const deliveryId = crypto.randomUUID();
    const outboxId = crypto.randomUUID();
    const payloadHash = await sha256(bodyText);
    const name = String(body.name ?? body.subject ?? 'Webhook activity').trim().slice(0, 240) || 'Webhook activity';
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
      db.prepare(`INSERT INTO webhook_deliveries (id,workspace_id,connection_id,provider_delivery_id,status,attempts,payload_hash,received_at,processed_at) VALUES (?,?,?,?,'processed',1,?,?,?)`).bind(deliveryId, workspaceId, connection.id, eventId, payloadHash, now, now),
      db.prepare(`INSERT INTO outbox_events (id,workspace_id,topic,payload_json,status,attempts,available_at,created_at) VALUES (?,?, 'connector.webhook.received',?,'pending',0,?,?)`).bind(outboxId, workspaceId, JSON.stringify({ connectionId: connection.id, deliveryId, eventId, recordId }), now, now),
      db.prepare(`UPDATE connector_connections SET health='healthy',last_error_code=NULL,updated_at=? WHERE workspace_id=? AND id=?`).bind(now, workspaceId, connection.id),
      db.prepare(`
        INSERT INTO audit_events (id, workspace_id, actor_user_id, action, entity_type, entity_id, after_json, metadata_json, request_id, created_at)
        VALUES (?, ?, 'webhook', 'webhook.received', 'activity', ?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID(), workspaceId, recordId, JSON.stringify({ name }), JSON.stringify({ eventId, deliveryId, payloadHash }), eventId, now),
      ]);
    } catch (error) {
      // The unique delivery fence handles concurrent retries that both pass the
      // preflight. D1 batches are atomic, so no duplicate activity can commit.
      const committed = await db.prepare(`SELECT id FROM webhook_deliveries WHERE workspace_id=? AND connection_id=? AND provider_delivery_id=? LIMIT 1`).bind(workspaceId, connection.id, eventId).first<{ id: string }>();
      if (committed) return apiResponse({ ok: true, duplicate: true, eventId });
      throw error;
    }
    return apiResponse({ ok: true, duplicate: false, eventId, deliveryId, recordId }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
