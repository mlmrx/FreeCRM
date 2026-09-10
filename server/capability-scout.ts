import { adaptiveProjects, classifyAdaptiveRelease, isAdaptiveReleaseUrl } from '@/lib/adaptive-catalog';
import { adaptiveTimestamp } from '@/lib/adaptive-engine';
import type { AdaptiveProject, AdaptiveRelease } from '@/lib/adaptive-types';

export const capabilityScoutLimits = { projects: 4, releasesPerProject: 5, responseBytes: 512 * 1024, bodyCharacters: 12_000, timeoutMs: 8_000 } as const;
export type CapabilityScoutResult = { releases: AdaptiveRelease[]; errors: { projectId: string; code: string }[] };

class ScoutError extends Error {
  constructor(readonly code: string) { super(code); }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown[]> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > capabilityScoutLimits.responseBytes)) {
    void response.body?.cancel().catch(() => undefined);
    throw new ScoutError('response_too_large');
  }
  if (!response.body || !/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    void response.body?.cancel().catch(() => undefined);
    throw new ScoutError('invalid_response');
  }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > capabilityScoutLimits.responseBytes) throw new ScoutError('response_too_large');
      text += decoder.decode(chunk.value, { stream: true });
    }
    signal.throwIfAborted();
    text += decoder.decode();
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new ScoutError('invalid_response');
    return parsed.slice(0, capabilityScoutLimits.releasesPerProject);
  } catch (error) {
    cancel();
    if (error instanceof ScoutError) throw error;
    throw new ScoutError(signal.aborted ? 'cancelled' : 'invalid_response');
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

async function readProject(project: AdaptiveProject, now: string, external?: AbortSignal): Promise<CapabilityScoutResult> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  external?.addEventListener('abort', cancel, { once: true });
  if (external?.aborted) cancel();
  let onAbort: () => void = () => undefined;
  const stopped = new Promise<never>((_, reject) => {
    onAbort = () => reject(new ScoutError(timedOut ? 'timeout' : 'cancelled'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
  });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, capabilityScoutLimits.timeoutMs);
  const task = async (): Promise<CapabilityScoutResult> => {
    controller.signal.throwIfAborted();
    // Repository names come only from the server-bundled catalog. No workspace data,
    // goals, prompts, API keys or connector credentials are accepted by this interface.
    const url = `https://api.github.com/repos/${project.repository}/releases?per_page=5&page=1`;
    const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FREECRM-Capability-Scout' }, redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal });
    if (response.redirected || (response.status >= 300 && response.status < 400) || (response.url && response.url !== url)) {
      void response.body?.cancel().catch(() => undefined);
      throw new ScoutError('redirect_rejected');
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new ScoutError(response.status === 403 || response.status === 429 ? 'rate_limited' : 'http_error');
    }
    const values = await boundedJson(response, controller.signal);
    const releases: AdaptiveRelease[] = [];
    const seen = new Set<number>();
    let malformed = false;
    for (const value of values) {
      if (!object(value)) { malformed = true; continue; }
      if (value.draft === true || value.prerelease === true) continue;
      const published = adaptiveTimestamp(value.published_at);
      if (value.draft !== false || value.prerelease !== false || !Number.isSafeInteger(value.id) || (value.id as number) < 1 || typeof value.tag_name !== 'string' || !value.tag_name.trim() || value.tag_name.length > 100
        || typeof value.html_url !== 'string' || !isAdaptiveReleaseUrl(value.html_url, project.id) || published === null || published > Date.parse(now)
        || (value.body !== null && typeof value.body !== 'string') || (value.name !== null && typeof value.name !== 'string')) { malformed = true; continue; }
      if (seen.has(value.id as number)) continue;
      seen.add(value.id as number);
      const title = (typeof value.name === 'string' && value.name.trim() ? value.name : value.tag_name).slice(0, 180);
      const body = typeof value.body === 'string' ? value.body.slice(0, capabilityScoutLimits.bodyCharacters) : '';
      const classification = classifyAdaptiveRelease(`${title}\n${body}`);
      releases.push({ id: `${project.id}-${value.id}`, projectId: project.id, title, version: value.tag_name, body, url: value.html_url, publishedAt: new Date(published).toISOString(), fetchedAt: now, ...classification });
    }
    return { releases, errors: malformed ? [{ projectId: project.id, code: 'invalid_release' }] : [] };
  };
  try { return await Promise.race([stopped, task()]); }
  catch (error) { return { releases: [], errors: [{ projectId: project.id, code: error instanceof ScoutError ? error.code : controller.signal.aborted ? (timedOut ? 'timeout' : 'cancelled') : 'unavailable' }] }; }
  finally {
    clearTimeout(timeout);
    external?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

/** Fetch public stable releases only. The caller owns workspace consent and scan scheduling. */
export async function fetchCapabilityReleases(projectIds: string[], signal?: AbortSignal): Promise<CapabilityScoutResult> {
  const now = new Date().toISOString();
  const selected = [...new Set(projectIds.slice(0, capabilityScoutLimits.projects))];
  const results = await Promise.all(selected.map((id) => {
    const project = adaptiveProjects.find((candidate) => candidate.id === id);
    return project ? readProject(project, now, signal) : Promise.resolve({ releases: [], errors: [{ projectId: typeof id === 'string' && /^[a-z0-9-]{1,60}$/.test(id) ? id : 'invalid-project', code: 'project_not_allowed' }] });
  }));
  return { releases: results.flatMap((result) => result.releases).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id)), errors: results.flatMap((result) => result.errors) };
}
