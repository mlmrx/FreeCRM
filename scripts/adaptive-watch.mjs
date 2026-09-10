import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';

export const adaptiveWatchLimits = { intervalMs: 15 * 60_000, timeoutMs: 20_000, responseBytes: 1024 * 1024 };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
class WatchError extends Error { constructor(code) { super(code); this.code = code; } }

export function validateAdaptiveWatchBase(value = 'http://127.0.0.1:3477') {
  // Check the literal spelling before URL normalization can turn integer/hex IPs into loopback.
  if (typeof value !== 'string' || !/^https?:\/\/(?:127\.0\.0\.1|\[::1\]|localhost)(?::[1-9]\d{0,4})?\/?$/.test(value)) throw new WatchError('loopback_url_required');
  let parsed;
  try { parsed = new URL(value); } catch { throw new WatchError('loopback_url_required'); }
  // Resolve the friendly alias to a literal loopback IP; never trust DNS or a hosts-file override.
  if (parsed.hostname === 'localhost') parsed.hostname = '127.0.0.1';
  return parsed.origin;
}

export function parseAdaptiveWatchArgs(args) {
  let once = false;
  let baseUrl = process.env.FREE_CRM_BASE_URL || 'http://127.0.0.1:3477';
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--once') once = true;
    else if (args[index] === '--base-url' && args[index + 1]) baseUrl = args[++index];
    else throw new WatchError('usage: node scripts/adaptive-watch.mjs [--once] [--base-url http://127.0.0.1:3477]');
  }
  return { once, baseUrl: validateAdaptiveWatchBase(baseUrl) };
}

async function readJson(response, signal) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > adaptiveWatchLimits.responseBytes)) {
    void response.body?.cancel().catch(() => undefined);
    throw new WatchError('response_too_large');
  }
  if (!response.body || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    void response.body?.cancel().catch(() => undefined);
    throw new WatchError('invalid_response');
  }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  let bytes = 0;
  let text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > adaptiveWatchLimits.responseBytes) throw new WatchError('response_too_large');
      text += decoder.decode(chunk.value, { stream: true });
    }
    signal.throwIfAborted();
    const value = JSON.parse(text + decoder.decode());
    if (!object(value)) throw new WatchError('invalid_response');
    return value;
  } catch (error) {
    cancel();
    throw error instanceof WatchError ? error : new WatchError(signal.aborted ? 'cancelled' : 'invalid_response');
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}

async function request(base, path, signal, body) {
  signal.throwIfAborted();
  const url = `${base}${path}`;
  const response = await fetch(url, { method: body ? 'POST' : 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal,
    headers: { Accept: 'application/json', ...(body ? { Origin: base, 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (response.redirected || (response.status >= 300 && response.status < 400) || (response.url && response.url !== url)) {
    void response.body?.cancel().catch(() => undefined);
    throw new WatchError('redirect_rejected');
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new WatchError(`http_${response.status}`);
  }
  return readJson(response, signal);
}

/**
 * One explicitly started, local-only check. Never enables consent or records interaction data.
 * @param {{baseUrl?: string, signal?: AbortSignal}} [options]
 * @returns {Promise<{status: string, code?: string}>}
 */
export async function runAdaptiveWatchOnce({ baseUrl = 'http://127.0.0.1:3477', signal: external } = {}) {
  const base = validateAdaptiveWatchBase(baseUrl);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  external?.addEventListener('abort', cancel, { once: true });
  if (external?.aborted) cancel();
  let timedOut = false;
  let onAbort = () => undefined;
  /** @type {Promise<never>} */
  const stopped = new Promise((_, reject) => {
    onAbort = () => reject(new WatchError(timedOut ? 'timeout' : 'cancelled'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
  });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, adaptiveWatchLimits.timeoutMs);
  const task = async () => {
    const health = await request(base, '/api/v1/health', controller.signal);
    if (health.status !== 'ready' || health.database !== 'connected' || health.schema !== 'current' || health.objectStorage !== 'connected') throw new WatchError('device_not_ready');
    const envelope = await request(base, '/api/v1/adaptive', controller.signal);
    const data = envelope.data;
    // Health exposes readiness, not runtime mode. The authenticated adaptive snapshot
    // supplies the device marker, which is required before any POST.
    if (!object(data) || data.device !== true || data.canWrite !== true) throw new WatchError('device_mode_required');
    if (!object(data.settings) || !object(data.refresh) || typeof data.settings.watchEnabled !== 'boolean' || typeof data.settings.paused !== 'boolean' || !Array.isArray(data.settings.watchProjects)) throw new WatchError('invalid_status');
    if (data.settings.paused) return { status: 'paused' };
    if (!data.settings.watchEnabled || !data.settings.watchProjects.length) return { status: 'off' };
    if (data.refresh.scanStatus !== 'ready') return { status: 'waiting' };
    if (data.refresh.nextScanAt !== null) {
      const due = typeof data.refresh.nextScanAt === 'string' ? Date.parse(data.refresh.nextScanAt) : NaN;
      if (!Number.isFinite(due)) throw new WatchError('invalid_status');
      if (due > Date.now()) return { status: 'waiting' };
    }
    const result = await request(base, '/api/v1/adaptive', controller.signal, { action: 'refresh', operationId: randomUUID() });
    if (!object(result.data) || typeof result.data.refreshed !== 'boolean') throw new WatchError('invalid_response');
    return { status: result.data.refreshed ? (Number(result.data.errors) > 0 ? 'partial' : 'refreshed') : 'waiting' };
  };
  try { return await Promise.race([stopped, task()]); }
  catch (error) { return { status: 'error', code: error instanceof WatchError ? error.code : controller.signal.aborted ? 'cancelled' : 'unavailable' }; }
  finally { clearTimeout(timeout); external?.removeEventListener('abort', cancel); controller.signal.removeEventListener('abort', onAbort); }
}

/**
 * @param {{once?: boolean, baseUrl?: string}} options
 * @param {AbortSignal} [signal]
 * @param {(message: string) => void} [report]
 * @param {(delay: number, value: undefined, options: {signal?: AbortSignal}) => Promise<unknown>} [waitForNext]
 */
export async function runAdaptiveWatcher(options, signal, report = (message) => console.log(message), waitForNext = wait) {
  do {
    if (signal?.aborted) break;
    const result = await runAdaptiveWatchOnce({ baseUrl: options.baseUrl, signal });
    if (signal?.aborted) break;
    // Status codes only: never log the snapshot, source excerpts, goals, errors or credentials.
    report(`Adaptive watcher: ${result.status}${result.code ? ` (${result.code})` : ''}.`);
    if (options.once) return result;
    try { await waitForNext(adaptiveWatchLimits.intervalMs, undefined, { signal }); }
    catch (error) { if (!signal?.aborted) throw error; }
  } while (!signal?.aborted);
  return { status: 'stopped' };
}

async function main() {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const result = await runAdaptiveWatcher(parseAdaptiveWatchArgs(process.argv.slice(2)), controller.signal);
    if (result?.status === 'error') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof WatchError ? error.code : 'Adaptive watcher could not start.');
    process.exitCode = 1;
  } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
