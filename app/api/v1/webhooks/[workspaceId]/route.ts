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

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const configuredKey = env.FREE_CRM_WEBHOOK_KEY;
    if (!configuredKey) throw new ApiError(503, 'webhook_not_configured', 'The webhook connector is not configured.');
    const suppliedKey = request.headers.get('x-free-crm-webhook-key') ?? '';
    if (!suppliedKey || !await constantTimeEqual(suppliedKey, configuredKey)) throw new ApiError(401, 'invalid_webhook_key', 'Webhook authentication failed.');
    const { workspaceId } = await context.params;
    const bodyText = await request.text();
    if (bodyText.length > 256_000) throw new ApiError(413, 'request_too_large', 'Webhook body exceeds 256 KB.');
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      throw new ApiError(400, 'invalid_json', 'Webhook body must be JSON.');
    }
    const eventId = String(body.eventId ?? request.headers.get('x-event-id') ?? '').slice(0, 128);
    if (!eventId) throw new ApiError(400, 'event_id_required', 'eventId is required for replay protection.');
    const db = getD1();
    const workspace = await db.prepare('SELECT id, owner_user_id, currency FROM workspaces WHERE id = ? LIMIT 1').bind(workspaceId).first<{ id: string; owner_user_id: string; currency: string }>();
    if (!workspace) throw new ApiError(404, 'workspace_not_found', 'Workspace not found.');
    const duplicate = await db.prepare(`SELECT id FROM integration_jobs WHERE workspace_id = ? AND cursor = ? LIMIT 1`).bind(workspaceId, eventId).first<{ id: string }>();
    if (duplicate) return apiResponse({ ok: true, duplicate: true, eventId });
    const now = new Date().toISOString();
    const recordId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const name = String(body.name ?? body.subject ?? 'Webhook activity').trim().slice(0, 240) || 'Webhook activity';
    const payloadSummary = Object.fromEntries(['type', 'provider', 'externalId', 'status', 'channel']
      .filter((key) => ['string', 'number', 'boolean'].includes(typeof body[key]))
      .map((key) => [key, typeof body[key] === 'string' ? String(body[key]).slice(0, 500) : body[key]]));
    await db.batch([
      db.prepare(`
        INSERT INTO records (
          id, workspace_id, object_type, name, status, lifecycle, owner_user_id,
          amount_cents, currency, probability, source, fields_json, tags_json, version, created_at, updated_at
        ) VALUES (?, ?, 'activity', ?, 'completed', 'active', ?, 0, ?, 0, 'Webhook', ?, '["Webhook"]', 1, ?, ?)
      `).bind(recordId, workspaceId, name, workspace.owner_user_id, workspace.currency, JSON.stringify({ eventId, payload: payloadSummary, occurredAt: now }), now, now),
      db.prepare(`
        INSERT INTO integration_jobs (
          id, workspace_id, integration_id, direction, status, cursor, processed, failed, started_at, finished_at
        ) SELECT ?, ?, id, 'inbound', 'succeeded', ?, 1, 0, ?, ?
          FROM integrations WHERE workspace_id = ? AND provider = 'webhook'
      `).bind(jobId, workspaceId, eventId, now, now, workspaceId),
      db.prepare(`
        INSERT INTO audit_events (id, workspace_id, actor_user_id, action, entity_type, entity_id, after_json, metadata_json, request_id, created_at)
        VALUES (?, ?, 'webhook', 'webhook.received', 'activity', ?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID(), workspaceId, recordId, JSON.stringify({ name }), JSON.stringify({ eventId }), eventId, now),
    ]);
    return apiResponse({ ok: true, duplicate: false, eventId, recordId }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
