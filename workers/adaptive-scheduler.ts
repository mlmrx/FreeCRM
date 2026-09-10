import { mutateAdaptive, normalizeAdaptiveError } from '../server/adaptive';
import { adaptiveTimestamp } from '../lib/adaptive-engine';
import { isWorkspaceProfile } from '../lib/multi-edition';
import type { WorkspaceContext } from '../server/control-plane';
import { ApiError, type RequestIdentity } from '../server/request-context';

export type AdaptiveSchedulerEnv = { DB: D1Database; FREE_CRM_ADAPTIVE_SCHEDULER_ENABLED?: string; FREE_CRM_ADAPTIVE_WORKSPACE_ID?: string };
export type AdaptiveScheduleResult = { status: 'off' | 'paused' | 'waiting' | 'refreshed' | 'partial' | 'unconfigured' | 'workspace_missing' | 'error'; code?: string };
type WorkspaceRow = { id: string; name: string; owner_email: string; owner_name: string | null; profile: string; timezone: string; currency: string; locale: string; settings_json: string; created_at: string; updated_at: string };
type WatchRow = { watch_enabled: number; paused: number; watch_projects_json: string; last_scan_at: string | null; last_scan_error: string | null };
const SERVICE_ID = 'service:adaptive-scheduler';
export const adaptiveScheduleTimeoutMs = 25_000;

async function operationId(workspaceId: string, scheduledTime: number): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`FREECRM-adaptive-schedule-v1\n${workspaceId}\n${scheduledTime}`));
  const bytes = new Uint8Array(hash).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Internal cron entry point, fixed to one existing workspace and one permitted action. */
export async function runAdaptiveSchedule(env: AdaptiveSchedulerEnv, options: { scheduledTime?: number; signal?: AbortSignal } = {}): Promise<AdaptiveScheduleResult> {
  if (env.FREE_CRM_ADAPTIVE_SCHEDULER_ENABLED !== 'true') return { status: 'off' };
  const workspaceId = env.FREE_CRM_ADAPTIVE_WORKSPACE_ID;
  if (!workspaceId || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(workspaceId) || workspaceId.startsWith('REPLACE_') || !env.DB || typeof env.DB.prepare !== 'function' || typeof env.DB.batch !== 'function') return { status: 'unconfigured' };
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  let timedOut = false;
  let onAbort: () => void = () => undefined;
  const stopped = new Promise<never>((_, reject) => {
    onAbort = () => reject(new ApiError(408, timedOut ? 'scheduler_timeout' : 'scheduler_cancelled', 'Scheduled refresh stopped.'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
  });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, adaptiveScheduleTimeoutMs);
  const task = async (): Promise<AdaptiveScheduleResult> => {
    controller.signal.throwIfAborted();
    // Existing-only lookup: never call ensureWorkspace or create membership/identity rows.
    const row = await env.DB.prepare('SELECT id,name,owner_email,owner_name,profile,timezone,currency,locale,settings_json,created_at,updated_at FROM workspaces WHERE id=? LIMIT 1').bind(workspaceId).first<WorkspaceRow>();
    controller.signal.throwIfAborted();
    if (!row || row.id !== workspaceId) return { status: 'workspace_missing' };
    if (!isWorkspaceProfile(row.profile)) return { status: 'unconfigured' };
    const watch = await env.DB.prepare('SELECT watch_enabled,paused,watch_projects_json,last_scan_at,last_scan_error FROM adaptive_settings WHERE workspace_id=? LIMIT 1').bind(workspaceId).first<WatchRow>();
    controller.signal.throwIfAborted();
    if (!watch || watch.watch_enabled !== 1) return { status: 'off' };
    if (watch.paused !== 0) return { status: 'paused' };
    const projects: unknown = JSON.parse(watch.watch_projects_json);
    if (!Array.isArray(projects) || !projects.length) return { status: 'off' };
    if (watch.last_scan_at !== null) {
      const last = adaptiveTimestamp(watch.last_scan_at);
      if (last === null) return { status: 'error', code: 'invalid_scan_date' };
      if (last + (watch.last_scan_error ? 15 * 60_000 : 6 * 60 * 60_000) > Date.now()) return { status: 'waiting' };
    }
    const settings: unknown = JSON.parse(row.settings_json);
    if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) return { status: 'unconfigured' };
    const context: WorkspaceContext = { workspaceId, workspace: { id: row.id, name: row.name, ownerEmail: row.owner_email, ownerName: row.owner_name ?? row.name, profile: row.profile, timezone: row.timezone, currency: row.currency, locale: row.locale, settings: settings as Record<string, unknown>, createdAt: row.created_at, updatedAt: row.updated_at,
      // member is the least-privileged existing role with records:write, required by
      // refresh. This context stays inside the fixed refresh call; no HTTP caller can use it.
      role: 'member' } };
    const scheduledTime = options.scheduledTime ?? Date.now();
    if (!Number.isSafeInteger(scheduledTime) || scheduledTime < 0) return { status: 'unconfigured' };
    const id = await operationId(workspaceId, scheduledTime);
    const identity: RequestIdentity = { userId: SERVICE_ID, displayName: 'Adaptive release scheduler', email: 'adaptive-scheduler@service.invalid', requestId: `adaptive-cron:${id}`, runtimeMode: 'scheduled-service' };
    // Reuses consent rechecks, optimistic writes, reset fences, receipts and the
    // append-only audit trail. actor_user_id identifies the service, never the human owner.
    controller.signal.throwIfAborted();
    const result = await mutateAdaptive(env.DB, context, identity, { action: 'refresh', operationId: id }, controller.signal);
    if (!result || typeof result !== 'object' || !('refreshed' in result)) return { status: 'error', code: 'invalid_refresh_result' };
    if (result.refreshed === true) return { status: 'errors' in result && Number(result.errors) > 0 ? 'partial' : 'refreshed' };
    return { status: 'reason' in result && result.reason === 'paused' ? 'paused' : 'reason' in result && result.reason === 'off' ? 'off' : 'waiting' };
  };
  try { return await Promise.race([stopped, task()]); }
  catch (error) {
    const normalized = normalizeAdaptiveError(error);
    return { status: 'error', code: normalized instanceof ApiError && /^[a-z_]{1,80}$/.test(normalized.code) ? normalized.code : controller.signal.aborted ? 'scheduler_cancelled' : 'scheduler_failed' };
  } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', cancel); controller.signal.removeEventListener('abort', onAbort); }
}

const adaptiveScheduler = {
  // Even if accidentally given a route, the companion has no public mutation endpoint.
  fetch(): Response { return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } }); },
  async scheduled(event: ScheduledController, env: AdaptiveSchedulerEnv): Promise<void> {
    const result = await runAdaptiveSchedule(env, { scheduledTime: event.scheduledTime });
    if (result.status === 'error' || result.status === 'unconfigured' || result.status === 'workspace_missing') {
      // Only fixed status/error codes enter operator logs; workspace data is never logged.
      console.error(`Adaptive scheduler: ${result.status}${result.code ? ` (${result.code})` : ''}.`);
      throw new Error('Adaptive scheduled refresh could not complete.');
    }
  },
};

export default adaptiveScheduler;
