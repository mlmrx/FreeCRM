'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { auditDateQuery, createAuditClient } from '@/lib/audit-client';
import { auditLimits, auditOutcomes, type AuditPage } from '@/lib/audit-types';
import { useI18n } from './i18n-provider';
import styles from './audit-viewer.module.css';

type Displayed = { page: AuditPage; query: string; history: string[] };
type RequestState = { query: string; history: string[]; attempt: number };

export function AuditResults({ page, locale = 'en-US' }: { page: AuditPage; locale?: string }) {
  const format = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
  return <>
    <p className={styles.summary}>{page.events.length.toLocaleString(locale)} events shown · {page.scanned.toLocaleString(locale)} candidates checked. {page.nextCursor ? 'More history remains; continue even when a filtered page is empty.' : 'End of this search window.'}</p>
    {page.partial && <div role="alert" className={styles.warning}><strong>Partial results</strong>{page.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
    {page.events.length === 0 ? <p className={styles.empty} role="status">{page.nextCursor ? 'No matches in this part of history. Continue to the next page or narrow the date range.' : 'No matching audit events in this date range.'}</p> : <div className={styles.tableRegion} role="region" aria-label="Audit events. Scroll for all fields and events." tabIndex={0}><table><caption>Applied search: {format(page.filters.from)} to {format(page.filters.to)} (UTC, end excluded)</caption><thead><tr><th scope="col">When (UTC)</th><th scope="col">Actor ID</th><th scope="col">Action</th><th scope="col">Outcome</th><th scope="col">Affected record</th><th scope="col">Request / event ID</th></tr></thead><tbody>{page.events.map((event) => <tr key={event.id}><td><time dateTime={event.createdAt}>{format(event.createdAt)}</time></td><td><code dir="ltr">{event.actor}</code></td><td><code dir="ltr">{event.action}</code></td><td>{event.outcome === 'unknown' ? 'Unknown / not recorded' : event.outcome === 'executed' ? 'Executed (local simulator)' : event.outcome}</td><td>{event.entityType}<br /><code dir="ltr">{event.entityId ?? '—'}</code></td><td><code dir="ltr">{event.requestId}</code><br /><code dir="ltr">{event.id}</code></td></tr>)}</tbody></table></div>}
  </>;
}

/** Mount only inside an authenticated workspace; the API owns authorization. */
export default function AuditViewer() {
  const { locale } = useI18n();
  const heading = useId();
  const [dates] = useState(() => { const now = new Date(); return { from: new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10), through: now.toISOString().slice(0, 10) }; });
  const [draft, setDraft] = useState({ ...dates, actor: '', family: '', outcome: '', record: '' });
  const [request, setRequest] = useState<RequestState>(() => ({ query: auditDateQuery(dates.from, dates.through, { actor: '', family: '', outcome: '', record: '' }), history: [], attempt: 0 }));
  const [displayed, setDisplayed] = useState<Displayed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportController = useRef<AbortController | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const client = useMemo(() => createAuditClient(), []);

  useEffect(() => {
    const controller = new AbortController();
    void client.get(request.query, controller.signal).then((page) => {
      if (controller.signal.aborted) return;
      setDisplayed({ page, query: request.query, history: request.history }); setLoading(false); setError(null);
      if (request.attempt > 0) resultHeading.current?.focus();
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      setLoading(false); setError(failure instanceof Error ? failure.message : 'Audit history could not be loaded. Retry this page.');
    });
    return () => controller.abort();
  }, [client, request]);
  useEffect(() => () => exportController.current?.abort(), []);

  function begin(query: string, history: string[]) {
    setLoading(true); setError(null); setExportNotice(null); setExportError(null);
    setRequest((current) => ({ query, history, attempt: current.attempt + 1 }));
  }
  async function exportPage() {
    if (!displayed || exporting) return;
    const controller = new AbortController(); exportController.current = controller;
    setExporting(true); setExportError(null); setExportNotice(null);
    try {
      const { blob, partial } = await client.csv(displayed.query, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'free-crm-audit-page.csv'; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportNotice(partial ? 'CSV download started with partial results. Some entries were omitted. Apply filters again to review the current warnings; this file refreshes one search page only.' : 'CSV download started. It refreshes one search page, not your entire audit history. Newer events may change the rows.');
    } catch (failure) {
      if (!controller.signal.aborted) setExportError(failure instanceof Error ? failure.message : 'The CSV could not be downloaded. Retry the export.');
    } finally { if (!controller.signal.aborted) setExporting(false); }
  }

  return <section className={`panel ${styles.viewer}`} aria-labelledby={heading}>
    <header className={styles.header}><div><p className="eyebrow">AUDIT TRAIL</p><h2 id={heading}>Who changed what</h2></div><a href="https://github.com/mlmrx/FreeCRM/blob/main/docs/AUDIT_HISTORY.md" target="_blank" rel="noreferrer noopener">Export schema & limits ↗</a></header>
    <p>Read-only history from this workspace. Actor IDs are not email addresses. Unknown means the event did not record an explicit outcome; approval does not mean execution. Private record content and provider payloads are excluded.</p>
    <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); try { begin(auditDateQuery(draft.from, draft.through, draft), []); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Check the date range.'); } }}>
      <label>From date (UTC)<input type="date" required value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
      <label>Through date (UTC)<input type="date" required value={draft.through} onChange={(event) => setDraft({ ...draft, through: event.target.value })} /></label>
      <label>Actor ID<input value={draft.actor} maxLength={240} placeholder="Exact actor ID" onChange={(event) => setDraft({ ...draft, actor: event.target.value })} /></label>
      <label>Action family<input value={draft.family} maxLength={40} placeholder="For example: record or agent" onChange={(event) => setDraft({ ...draft, family: event.target.value })} /></label>
      <label>Outcome<select value={draft.outcome} onChange={(event) => setDraft({ ...draft, outcome: event.target.value })}><option value="">All outcomes</option>{auditOutcomes.map((outcome) => <option value={outcome} key={outcome}>{outcome === 'unknown' ? 'Unknown / not recorded' : outcome === 'executed' ? 'Executed (local simulator)' : outcome}</option>)}</select></label>
      <label>Affected record ID<input value={draft.record} maxLength={240} placeholder="Exact record ID" onChange={(event) => setDraft({ ...draft, record: event.target.value })} /></label>
      <button className="primary-button" disabled={loading || exporting} type="submit">Apply filters</button>
      <button className="secondary-button" disabled={loading || exporting} type="button" onClick={() => { const cleared = { ...dates, actor: '', family: '', outcome: '', record: '' }; setDraft(cleared); begin(auditDateQuery(cleared.from, cleared.through, cleared), []); }}>Reset filters</button>
    </form>
    <p className={styles.hint}>Up to {auditLimits.windowDays} days per search, {auditLimits.pageSize} matching events per page, and {auditLimits.scanRows} candidates checked per request. CSV exports one page at a time by refreshing its applied search. Newer events may change the rows.</p>
    {error && <div className={styles.warning} role="alert"><p>{error}</p><button type="button" disabled={loading} onClick={() => begin(request.query, request.history)}>Retry last request</button></div>}
    <div aria-busy={loading}><h3 tabIndex={-1} ref={resultHeading}>Search results</h3>{loading && <p role="status">Loading audit history…{displayed ? ' Previous results remain below until the request succeeds.' : ''}</p>}{displayed && <AuditResults page={displayed.page} locale={locale} />}</div>
    {displayed && <footer className={styles.footer}><nav aria-label="Audit history pages"><button type="button" disabled={loading || exporting || !displayed.history.length} onClick={() => begin(displayed.history.at(-1)!, displayed.history.slice(0, -1))}>Previous page</button><span>Page {(displayed.history.length + 1).toLocaleString(locale)}</span><button type="button" disabled={loading || exporting || !displayed.page.nextCursor} onClick={() => { const next = new URLSearchParams(displayed.query); next.set('cursor', displayed.page.nextCursor!); begin(next.toString(), [...displayed.history, displayed.query]); }}>Next page</button></nav><button className="secondary-button" type="button" disabled={loading || exporting || !displayed.page.canExport || displayed.page.events.length === 0} onClick={() => void exportPage()}>{exporting ? 'Preparing CSV…' : 'Export page as CSV'}</button>{!displayed.page.canExport && <p>Viewing history does not grant export access. Ask an owner about the data export permission.</p>}</footer>}
    {exportError && <p role="alert" className={styles.warning}>{exportError}</p>}{exportNotice && <p role="status">{exportNotice}</p>}
  </section>;
}
