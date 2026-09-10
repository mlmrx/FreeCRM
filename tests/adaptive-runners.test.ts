import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adaptiveWatchLimits, parseAdaptiveWatchArgs, runAdaptiveWatchOnce, runAdaptiveWatcher, validateAdaptiveWatchBase } from '../scripts/adaptive-watch.mjs';
import scheduler, { adaptiveScheduleTimeoutMs, runAdaptiveSchedule, type AdaptiveSchedulerEnv } from '../workers/adaptive-scheduler';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('../server/adaptive', () => ({ mutateAdaptive: mutate, normalizeAdaptiveError: (error: unknown) => error }));
const now = '2026-09-09T12:00:00.000Z';
const healthy = { status: 'ready', database: 'connected', schema: 'current', objectStorage: 'connected' };
const status = (changes: Record<string, unknown> = {}) => ({ data: { device: true, canWrite: true, settings: { watchEnabled: true, paused: false, watchProjects: ['twenty'] }, refresh: { scanStatus: 'ready', nextScanAt: null }, ...changes } });
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
// Synthetic user-info exercises rejection without checking a credential literal into Git.
const credentialUrl = new URL('http://127.0.0.1:3477');
credentialUrl.username = 'test'; credentialUrl.password = 'example';

beforeEach(() => { vi.clearAllMocks(); mutate.mockResolvedValue({ refreshed: true, errors: 0 }); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('explicit local adaptive watcher', () => {
  it.each(['https://example.com', 'http://127.0.0.1.attacker.example', 'http://127.0.0.1:3477/private', credentialUrl.href, 'http://127.0.0.1:3477?token=private', 'http://2130706433:3477', 'http://0x7f000001:3477', 'http://0.0.0.0:3477', 'http://127.0.0.1:65536'])('rejects unsafe base URL before network access: %s', async (baseUrl) => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(runAdaptiveWatchOnce({ baseUrl })).rejects.toThrow('loopback_url_required');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('accepts literal loopback and pins localhost to an IP without DNS resolution', () => {
    expect(validateAdaptiveWatchBase()).toBe('http://127.0.0.1:3477');
    expect(validateAdaptiveWatchBase('http://localhost:3477/')).toBe('http://127.0.0.1:3477');
    expect(validateAdaptiveWatchBase('http://[::1]:3477')).toBe('http://[::1]:3477');
    expect(parseAdaptiveWatchArgs(['--once', '--base-url', 'http://localhost:3477'])).toEqual({ once: true, baseUrl: 'http://127.0.0.1:3477' });
    expect(() => parseAdaptiveWatchArgs(['--token', 'private'])).toThrow('usage:');
    vi.stubEnv('FREE_CRM_BASE_URL', 'http://127.0.0.1:3482');
    expect(parseAdaptiveWatchArgs([]).baseUrl).toBe('http://127.0.0.1:3482');
    expect(parseAdaptiveWatchArgs(['--base-url', 'http://127.0.0.1:3483']).baseUrl).toBe('http://127.0.0.1:3483');
  });

  it('requires ready health and authenticated device status, then sends only one UUID refresh', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(healthy)).mockResolvedValueOnce(json(status())).mockResolvedValueOnce(json({ data: { refreshed: true, errors: 0 } }));
    vi.stubGlobal('fetch', fetcher);
    expect(await runAdaptiveWatchOnce()).toEqual({ status: 'refreshed' });
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual(['http://127.0.0.1:3477/api/v1/health', 'http://127.0.0.1:3477/api/v1/adaptive', 'http://127.0.0.1:3477/api/v1/adaptive']);
    const options = fetcher.mock.calls[2][1];
    expect(options).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'manual', referrerPolicy: 'no-referrer', headers: { Origin: 'http://127.0.0.1:3477', 'Content-Type': 'application/json' } });
    expect(JSON.parse(options.body)).toEqual({ action: 'refresh', operationId: expect.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/) });
    expect(Object.keys(options.headers).sort()).toEqual(['Accept', 'Content-Type', 'Origin']);
  });

  it('never mutates when health is not ready', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ ...healthy, schema: 'outdated' })); vi.stubGlobal('fetch', fetcher);
    expect(await runAdaptiveWatchOnce()).toEqual({ status: 'error', code: 'device_not_ready' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([{ device: false }, { canWrite: false }, { device: undefined }])('rejects non-device or non-writing identities: %j', async (changes) => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(healthy)).mockResolvedValueOnce(json(status(changes))); vi.stubGlobal('fetch', fetcher);
    expect(await runAdaptiveWatchOnce()).toEqual({ status: 'error', code: 'device_mode_required' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    { settings: { watchEnabled: false, paused: false, watchProjects: ['twenty'] }, expected: 'off' },
    { settings: { watchEnabled: true, paused: true, watchProjects: ['twenty'] }, expected: 'paused' },
    { settings: { watchEnabled: true, paused: false, watchProjects: [] }, expected: 'off' },
    { refresh: { scanStatus: 'waiting', nextScanAt: null }, expected: 'waiting' },
    { refresh: { scanStatus: 'ready', nextScanAt: '2099-01-01T00:00:00Z' }, expected: 'waiting' },
    { refresh: { scanStatus: 'ready', nextScanAt: 'invalid date' }, expected: 'error' },
  ])('respects consent, pause and due state: %j', async ({ expected, ...changes }) => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(healthy)).mockResolvedValueOnce(json(status(changes))); vi.stubGlobal('fetch', fetcher);
    expect((await runAdaptiveWatchOnce()).status).toBe(expected);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects redirects and bounds responses before accessing private status', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 302, headers: { Location: 'https://example.com' } })); vi.stubGlobal('fetch', fetcher);
    expect((await runAdaptiveWatchOnce()).code).toBe('redirect_rejected');
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValue(new Response('[]', { headers: { 'Content-Type': 'application/json', 'Content-Length': String(adaptiveWatchLimits.responseBytes + 1) } }));
    expect((await runAdaptiveWatchOnce()).code).toBe('response_too_large');
  });

  it('bounds streamed status responses without trusting Content-Length', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(adaptiveWatchLimits.responseBytes + 1)); controller.close(); } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { headers: { 'Content-Type': 'application/json' } })));
    expect((await runAdaptiveWatchOnce()).code).toBe('response_too_large');
  });

  it('times out stalled requests and never sends a mutation after cancellation', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => undefined)); vi.stubGlobal('fetch', fetcher);
    const pending = runAdaptiveWatchOnce();
    await vi.advanceTimersByTimeAsync(adaptiveWatchLimits.timeoutMs);
    expect(await pending).toEqual({ status: 'error', code: 'timeout' });
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    const controller = new AbortController(); controller.abort();
    expect((await runAdaptiveWatchOnce({ signal: controller.signal })).code).toBe('cancelled');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('supports a fifteen-minute persistent loop and aborts cleanly while sleeping', async () => {
    const fetcher = vi.fn().mockImplementation((url: string) => Promise.resolve(json(url.endsWith('/health') ? healthy : status({ settings: { watchEnabled: false, paused: false, watchProjects: [] }, goals: 'private-synthetic-goal' })))); vi.stubGlobal('fetch', fetcher);
    const report = vi.fn(); const controller = new AbortController();
    const waitForNext = vi.fn().mockResolvedValueOnce(undefined).mockImplementationOnce(async () => { controller.abort(); throw new Error('aborted'); });
    expect(await runAdaptiveWatcher({ once: false }, controller.signal, report, waitForNext)).toEqual({ status: 'stopped' });
    expect(waitForNext).toHaveBeenCalledTimes(2);
    expect(waitForNext).toHaveBeenCalledWith(15 * 60_000, undefined, { signal: controller.signal });
    expect(report.mock.calls.flat().join(' ')).toBe('Adaptive watcher: off. Adaptive watcher: off.');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('runs --once without sleeping and hides raw errors and private response text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private token and workspace notes')));
    const report = vi.fn();
    expect(await runAdaptiveWatcher({ once: true }, undefined, report)).toEqual({ status: 'error', code: 'unavailable' });
    expect(report).toHaveBeenCalledWith('Adaptive watcher: error (unavailable).');
  });
});

function schedulerFixture(changes: { workspace?: Record<string, unknown> | null; watch?: Record<string, unknown> | null } = {}) {
  const workspace = Object.hasOwn(changes, 'workspace') ? changes.workspace : { id: 'existing-workspace', name: 'Synthetic private workspace', owner_email: 'owner@example.test', owner_name: 'Owner', profile: 'personal', timezone: 'UTC', currency: 'USD', locale: 'en-US', settings_json: '{}', created_at: now, updated_at: now };
  const watch = Object.hasOwn(changes, 'watch') ? changes.watch : { watch_enabled: 1, paused: 0, watch_projects_json: '["twenty"]', last_scan_at: null, last_scan_error: null };
  const binds: unknown[][] = [];
  const prepare = vi.fn((sql: string) => ({ bind: (...values: unknown[]) => { binds.push(values); return { first: vi.fn().mockResolvedValue(sql.includes('FROM workspaces') ? workspace : watch) }; } }));
  const db = { prepare, batch: vi.fn() } as unknown as D1Database;
  const env: AdaptiveSchedulerEnv = { DB: db, FREE_CRM_ADAPTIVE_SCHEDULER_ENABLED: 'true', FREE_CRM_ADAPTIVE_WORKSPACE_ID: 'existing-workspace' };
  return { env, prepare, binds };
}

describe('operator-deployed adaptive cron companion', () => {
  it('defaults off and refuses missing or placeholder workspace configuration', async () => {
    const f = schedulerFixture();
    expect(await runAdaptiveSchedule({ ...f.env, FREE_CRM_ADAPTIVE_SCHEDULER_ENABLED: undefined })).toEqual({ status: 'off' });
    expect(await runAdaptiveSchedule({ ...f.env, FREE_CRM_ADAPTIVE_WORKSPACE_ID: 'REPLACE_WITH_EXISTING_WORKSPACE_ID' })).toEqual({ status: 'unconfigured' });
    expect(await runAdaptiveSchedule({ ...f.env, FREE_CRM_ADAPTIVE_WORKSPACE_ID: '../other' })).toEqual({ status: 'unconfigured' });
    expect(f.prepare).not.toHaveBeenCalled(); expect(mutate).not.toHaveBeenCalled();
  });

  it('uses only the configured existing workspace and never bootstraps a missing one', async () => {
    const f = schedulerFixture({ workspace: null });
    expect(await runAdaptiveSchedule(f.env)).toEqual({ status: 'workspace_missing' });
    expect(f.binds).toEqual([['existing-workspace']]);
    expect(f.prepare.mock.calls.every(([sql]) => sql.startsWith('SELECT '))).toBe(true);
    expect(f.env.DB.batch).not.toHaveBeenCalled(); expect(mutate).not.toHaveBeenCalled();
  });

  it.each([
    { watch: null, expected: 'off' },
    { watch: { watch_enabled: 0, paused: 0, watch_projects_json: '["twenty"]', last_scan_at: null, last_scan_error: null }, expected: 'off' },
    { watch: { watch_enabled: 1, paused: 1, watch_projects_json: '["twenty"]', last_scan_at: null, last_scan_error: null }, expected: 'paused' },
    { watch: { watch_enabled: 1, paused: 0, watch_projects_json: '[]', last_scan_at: null, last_scan_error: null }, expected: 'off' },
    { watch: { watch_enabled: 1, paused: 0, watch_projects_json: '["twenty"]', last_scan_at: '2099-01-01T00:00:00Z', last_scan_error: null }, expected: 'waiting' },
  ])('does not elevate consent or refresh when saved state is %s', async ({ watch, expected }) => {
    const f = schedulerFixture({ watch });
    expect((await runAdaptiveSchedule(f.env)).status).toBe(expected);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('passes a service actor with the minimal existing role to a hardcoded refresh action', async () => {
    const f = schedulerFixture();
    expect(await runAdaptiveSchedule(f.env, { scheduledTime: Date.parse(now) })).toEqual({ status: 'refreshed' });
    const [db, context, identity, body, signal] = mutate.mock.calls[0];
    expect(db).toBe(f.env.DB);
    expect(context).toMatchObject({ workspaceId: 'existing-workspace', workspace: { id: 'existing-workspace', role: 'member' } });
    expect(identity).toMatchObject({ userId: 'service:adaptive-scheduler', runtimeMode: 'scheduled-service' });
    expect(identity.userId).not.toContain('owner');
    expect(body).toEqual({ action: 'refresh', operationId: expect.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/) });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(f.binds.every((values) => values[0] === 'existing-workspace')).toBe(true);
    expect(f.prepare.mock.calls.every(([sql]) => sql.startsWith('SELECT '))).toBe(true);
  });

  it('uses deterministic per-event operation ids so the service can replay duplicate cron delivery', async () => {
    const f = schedulerFixture();
    await runAdaptiveSchedule(f.env, { scheduledTime: Date.parse(now) });
    await runAdaptiveSchedule(f.env, { scheduledTime: Date.parse(now) });
    await runAdaptiveSchedule(f.env, { scheduledTime: Date.parse(now) + 6 * 60 * 60_000 });
    expect(mutate.mock.calls[0][3].operationId).toBe(mutate.mock.calls[1][3].operationId);
    expect(mutate.mock.calls[2][3].operationId).not.toBe(mutate.mock.calls[0][3].operationId);
  });

  it('reports when the service recheck observes consent changing during a scan', async () => {
    mutate.mockResolvedValue({ refreshed: false, reason: 'paused' });
    expect(await runAdaptiveSchedule(schedulerFixture().env)).toEqual({ status: 'paused' });
    mutate.mockResolvedValue({ refreshed: false, reason: 'off' });
    expect(await runAdaptiveSchedule(schedulerFixture().env)).toEqual({ status: 'off' });
    mutate.mockResolvedValue({ refreshed: true, errors: 1 });
    expect(await runAdaptiveSchedule(schedulerFixture().env)).toEqual({ status: 'partial' });
  });

  it('has no public mutation endpoint even if accidentally bound to a route', async () => {
    const response = scheduler.fetch();
    expect(response.status).toBe(404); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('sanitizes database errors instead of logging workspace data', async () => {
    mutate.mockRejectedValue(new Error('private workspace details'));
    expect(await runAdaptiveSchedule(schedulerFixture().env)).toEqual({ status: 'error', code: 'scheduler_failed' });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(scheduler.scheduled({ scheduledTime: Date.parse(now) } as ScheduledController, schedulerFixture().env)).rejects.toThrow('could not complete');
    expect(log).toHaveBeenCalledWith('Adaptive scheduler: error (scheduler_failed).');
  });

  it('aborts a stalled database read and never advances to a mutation after the deadline', async () => {
    vi.useFakeTimers();
    const f = schedulerFixture();
    f.prepare.mockImplementation(() => ({ bind: () => ({ first: vi.fn().mockImplementation(() => new Promise(() => undefined)) }) }));
    const pending = runAdaptiveSchedule(f.env);
    await vi.advanceTimersByTimeAsync(adaptiveScheduleTimeoutMs);
    expect(await pending).toEqual({ status: 'error', code: 'scheduler_timeout' });
    expect(mutate).not.toHaveBeenCalled();
  });
});
