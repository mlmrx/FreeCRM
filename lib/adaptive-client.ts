import type { AdaptiveEvidence, AdaptiveProposal, AdaptiveRelease, AdaptiveSettings } from './adaptive-types';

export class AdaptiveClientError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}

/** An operation's identity survives an ambiguous response only in this mounted session. */
export function createAdaptiveClient(fetcher: typeof fetch = fetch) {
  const pending = new Map<string, string>();
  async function request<T>(query = '', init?: RequestInit): Promise<T> {
    const response = await fetcher(`/api/v1/adaptive${query}`, { credentials: 'same-origin', cache: 'no-store', ...init });
    const json = await response.json() as { data?: T; error?: { message?: string; code?: string } | string } | null;
    if (!response.ok) {
      const error = typeof json?.error === 'object' ? json.error : undefined;
      throw new AdaptiveClientError(error?.message ?? (typeof json?.error === 'string' ? json.error : 'This request could not be completed.'), response.status, error?.code ?? 'request_failed');
    }
    if (!json || typeof json.data !== 'object' || !json.data) throw new Error('The server returned an incomplete receipt. Outcome unknown; retry this exact action.');
    return json.data;
  }
  return {
    get: <T>(query = '', signal?: AbortSignal) => request<T>(query, { signal }),
    async post<T>(payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
      const key = JSON.stringify(payload);
      let operationId = pending.get(key);
      if (!operationId) {
        if (pending.size >= 64) throw new Error('Too many unresolved requests. Check saved work before reloading.');
        operationId = crypto.randomUUID(); pending.set(key, operationId);
      }
      try {
        const data = await request<T>('', { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, operationId }) });
        pending.delete(key); return data;
      } catch (error) {
        if (error instanceof AdaptiveClientError && error.status >= 400 && error.status < 500) pending.delete(key);
        throw error;
      }
    },
    clear: () => pending.clear(),
  };
}

/** Collapse overlapping page-open reads without persisting any private response. */
export function singleFlight<T, Args extends unknown[] = []>(work: (...args: Args) => Promise<T>) {
  let current: Promise<T> | null = null;
  return (...args: Args) => {
    if (!current) current = work(...args).finally(() => { current = null; });
    return current;
  };
}

export function safeReleaseUrl(value: string): string | undefined {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
export function evidenceHref(evidence: AdaptiveEvidence): string | undefined {
  if (evidence.kind === 'source') return `/brain?source=${encodeURIComponent(evidence.id)}`;
  if (evidence.kind === 'record') return `/workspace?record=${encodeURIComponent(evidence.id)}`;
  return safeReleaseUrl(evidence.url);
}

export type EditableAdaptiveSettings = Pick<AdaptiveSettings, 'learningEnabled' | 'autoAdapt' | 'paused' | 'goals' | 'focus' | 'followUpDays' | 'followUpPinned' | 'digestSize' | 'watchEnabled' | 'watchProjects'>;
export function editableAdaptiveSettings(settings: AdaptiveSettings): EditableAdaptiveSettings {
  const { learningEnabled, autoAdapt, paused, goals, focus, followUpDays, followUpPinned, digestSize, watchEnabled, watchProjects } = settings;
  return { learningEnabled, autoAdapt, paused, goals, focus, followUpDays, followUpPinned, digestSize, watchEnabled, watchProjects: [...watchProjects] };
}

export function localDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function followupPayload(signalId: string, fingerprint: string, title: string, localDueAt: string, followUpDays: number) {
  const due = new Date(localDueAt);
  if (!title.trim() || title.trim().length > 200) throw new Error('Add a task title of 1–200 characters.');
  if (!localDueAt || Number.isNaN(due.getTime())) throw new Error('Choose a valid due date and time.');
  if (!Number.isInteger(followUpDays) || followUpDays < 1 || followUpDays > 30) throw new Error('Choose a follow-up interval of 1–30 days.');
  return { action: 'followup.create', signalId, fingerprint, title: title.trim(), dueAt: due.toISOString(), followUpDays };
}

export function proposalMarkdown(proposal: AdaptiveProposal, release?: AdaptiveRelease): string {
  return `# ${proposal.title}\n\nStatus: ${proposal.status}. Local implementation proposal; no remote issue or pull request has been created.\n\n## Problem\n\n${proposal.problem}\n\n## Announcement source\n\n${release ? `${release.title} (${release.version})\n${safeReleaseUrl(release.url) ?? 'No safe source URL available'}\nPublished: ${release.publishedAt}` : 'The release is no longer in the current inventory. Verify its source before implementation.'}\n\n## Implementation boundary\n\nVendor claims require independent verification. This proposal installs no downloaded code, grants no permissions, and does not deploy software.\n\n## Acceptance criteria\n\n- Verify the announcement against the linked official source and document the supported behavior.\n- Define a bounded vertical slice consistent with workspace profiles and tenant isolation.\n- Review data access, user consent, audit receipts, emergency stop, and a reversible rollout.\n- Add meaningful tests and pass the repository’s required checks before a reviewed pull request.\n- Obtain explicit approval for any production deployment.\n`;
}
