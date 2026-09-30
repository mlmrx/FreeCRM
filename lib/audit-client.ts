import { auditLimits, auditOutcomes, type AuditPage } from './audit-types';

export class AuditClientError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function auditDateQuery(from: string, through: string, fields: { actor: string; family: string; outcome: string; record: string }): string {
  if (![from, through].every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)))) throw new Error('Choose a valid start and end date.');
  const start = new Date(`${from}T00:00:00.000Z`);
  if (start.toISOString().slice(0, 10) !== from || new Date(`${through}T00:00:00.000Z`).toISOString().slice(0, 10) !== through) throw new Error('Choose valid calendar dates.');
  const end = new Date(Date.parse(`${through}T00:00:00.000Z`) + 86_400_000);
  if (start >= end || end.getTime() - start.getTime() > auditLimits.windowDays * 86_400_000) throw new Error(`Choose up to ${auditLimits.windowDays} days, with the start before the end.`);
  return new URLSearchParams({ from: start.toISOString(), to: end.toISOString(), actor: fields.actor, family: fields.family, outcome: fields.outcome, record: fields.record }).toString();
}

export function createAuditClient(fetcher: typeof fetch = fetch) {
  async function response(query: string, signal?: AbortSignal) {
    const result = await fetcher(`/api/v1/audit?${query}`, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal });
    if (!result.ok) {
      const message = result.status === 403 ? 'Your role cannot access this audit view or export. Ask a workspace owner about your permissions.'
        : result.status === 401 ? 'Sign in again to view audit history.'
          : result.status === 400 ? 'This search or cursor is invalid. Check the filters or start a new search.'
            : 'Audit history is temporarily unavailable. Retry this page; your displayed results are unchanged.';
      throw new AuditClientError(message, result.status);
    }
    return result;
  }
  return {
    async get(query: string, signal?: AbortSignal): Promise<AuditPage> {
      const result = await response(query, signal);
      const body = await result.json() as { data?: AuditPage };
      const page = body?.data;
      if (!page || !Array.isArray(page.events) || page.events.length > auditLimits.pageSize || !page.filters
        || typeof page.filters.from !== 'string' || !Number.isFinite(Date.parse(page.filters.from)) || typeof page.filters.to !== 'string' || !Number.isFinite(Date.parse(page.filters.to)) || !Array.isArray(page.warnings)
        || page.warnings.length > 3 || page.warnings.some((warning) => typeof warning !== 'string' || warning.length > 512)
        || typeof page.canExport !== 'boolean' || typeof page.partial !== 'boolean' || !Number.isInteger(page.scanned) || page.scanned < 0 || page.scanned > auditLimits.scanRows
        || !(page.nextCursor === null || typeof page.nextCursor === 'string' && page.nextCursor.length <= auditLimits.cursorCharacters)
        || page.events.some((event) => !event || ![event.id, event.createdAt, event.actor, event.action, event.family, event.outcome, event.entityType, event.requestId].every((field) => typeof field === 'string' && field.length <= 240)
          || !Number.isFinite(Date.parse(event.createdAt)) || !(auditOutcomes as readonly string[]).includes(event.outcome) || !(event.entityId === null || typeof event.entityId === 'string' && event.entityId.length <= 240))) {
        throw new Error('The server returned an incomplete audit page. Retry this page.');
      }
      return page;
    },
    async csv(query: string, signal?: AbortSignal): Promise<{ blob: Blob; partial: boolean }> {
      const params = new URLSearchParams(query); params.set('format', 'csv');
      const result = await response(params.toString(), signal);
      if (!result.headers.get('content-type')?.startsWith('text/csv') || result.headers.get('x-free-crm-audit-scope') !== 'current-page; not-complete-history') throw new Error('The server did not return a bounded audit CSV. Retry the export.');
      return { blob: await result.blob(), partial: result.headers.get('x-free-crm-audit-partial') === 'true' };
    },
  };
}
