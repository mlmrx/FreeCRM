'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext production prefetch is intentionally avoided for reliable navigation. */

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { completeResetRequest, legacyWorkspaceRecords, loadCloudSnapshot, prepareResetRequest, readPendingResetRequest, sendCommand } from '@/lib/cloud-client';
import { deleteDocumentFile, uploadDocumentFile } from '@/lib/file-client';
import { runWorkspaceRefresh, type WorkspaceRefreshFailureMode } from '@/lib/workspace-refresh';
import CsvImporter from '@/app/csv-importer';
import {
  formatMoney,
  moduleByType,
  moduleCatalog,
  nextStatus,
  recordHealth,
  relatedRecords,
  type CRMRecord,
  type CRMSnapshot,
  type RecordType,
} from '@/lib/crm-platform';
import { loadWorkspace } from '@/lib/storage';
import { referenceConnectors, resolveCapabilities, workspaceProfiles, type WorkspaceProfile } from '@/lib/multi-edition';
import { sendIdempotentOperation } from '@/lib/idempotent-client';
import { isAgentToolGrantUsable, renewedAgentGrantExpiry, revokeAgentToolGrant, setAgentToolGrantExpiry } from '@/lib/agent-grant-client';
import { moduleCapability, workspaceViewFromQuery, type WorkspaceView } from '@/lib/workspace-navigation';
import { normalizeLocale, translate, type TranslationKey } from '@/lib/i18n';
import { LanguageSelect, useI18n } from '@/app/i18n-provider';
import { T, LocalizedAttributes } from '@/app/localized-text';

type AppView = WorkspaceView;
type EditorState = { type: RecordType; record?: CRMRecord } | null;
type Toast = { id: number; message: string; tone?: 'success' | 'error' };

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const managedStatuses: Partial<Record<RecordType, readonly string[]>> = {
  lead: ['converted'],
  quote: ['accepted'],
  invoice: ['sent', 'partial', 'paid', 'overdue', 'void'],
  ticket: ['resolved'],
};

function editableStatuses(type: RecordType, current?: string) {
  return moduleByType[type].statuses.filter((status) => status === current || !managedStatuses[type]?.includes(status));
}

function shortDate(value: string | null, locale = 'en-US') {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

function relativeDate(value: string | null, locale = 'en-US') {
  if (!value) return translate(locale, 'date.never');
  const days = Math.round((Date.now() - new Date(value).getTime()) / 86_400_000);
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day');
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'FR';
}

function consumeCompletedReset(snapshot: CRMSnapshot) {
  const pending = readPendingResetRequest(snapshot.workspace.id);
  if (!pending || snapshot.resetReceipt?.operationId !== pending.operationId) return false;
  completeResetRequest(snapshot.workspace.id, pending.operationId);
  return true;
}

function StatusChip({ status }: { status: string }) {
  return <span className={`status-chip status-${status.replaceAll('_', '-')}`}><T text={titleCase(status)} /></span>;
}

function MetricCard({ label, value, note, onClick }: { label: string; value: string; note: string; onClick?: () => void }) {
  const { text } = useI18n();
  const content = <><span>{text(label)}</span><strong>{value}</strong><small>{text(note)}</small></>;
  return onClick ? <button className="metric-card" onClick={onClick}>{content}</button> : <article className="metric-card">{content}</article>;
}

function LoadingScreen() {
  const { t } = useI18n();
  return <main className="state-screen"><div className="brand-mark large">F</div><h1>{t('state.opening')}</h1><p>{t('state.loading')}</p><div className="loading-bar"><i /></div></main>;
}

export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t, text } = useI18n();
  const needsGithubSignIn = message.includes('Sign in with GitHub');
  const normalizedMessage = message.toLowerCase();
  const needsDeploymentSetup = normalizedMessage.includes('sealed until an identity provider is configured') || normalizedMessage.includes('authentication is not configured');

  if (needsDeploymentSetup) {
    return <main className="state-screen"><div className="brand-mark large">F</div><h1><T text="Finish workspace setup" /></h1><p><T text="This hosted workspace still needs its owner login and data services. Follow the deployment guide to connect credentials you control; no keys are bundled with FREE CRM." /></p><div className="state-actions"><a className="primary-button" href="/deploy"><T text="Complete deployment setup" /></a><a className="secondary-button" href="/"><T text="Back to home" /></a></div></main>;
  }

  return <main className="state-screen"><div className="brand-mark large">!</div><h1>{needsGithubSignIn ? t('state.signIn') : t('state.unavailable')}</h1><p>{text(message)}</p>{needsGithubSignIn ? <a className="primary-button" href="/api/auth/signin?callbackUrl=/workspace">{t('state.continueGithub')}</a> : <button className="primary-button" onClick={onRetry}>{t('state.retry')}</button>}</main>;
}


function useDialogFocus<T extends HTMLElement>(close: () => void) {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusables = () => [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter((item) => item.getClientRects().length > 0);
    const frame = window.requestAnimationFrame(() => (dialog.querySelector<HTMLElement>('[data-dialog-initial]') ?? focusables()[0] ?? dialog).focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      dialog.removeEventListener('keydown', onKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return dialogRef;
}

export default function CRMApp() {
  const { locale, adoptWorkspaceLocale, t, text } = useI18n();
  const textRef = useRef(text);
  useEffect(() => { textRef.current = text; }, [text]);
  const [snapshot, setSnapshot] = useState<CRMSnapshot | null>(null);
  const [view, setView] = useState<AppView>('dashboard');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CRMRecord | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [legacyCount, setLegacyCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileMenuRef = useRef<HTMLButtonElement>(null);

  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    setToast({ id: Date.now(), message, tone });
    window.setTimeout(() => setToast((current) => current?.message === message ? null : current), 3200);
  }, []);

  const refresh = useCallback(async (resetOperationId?: string, failureMode: WorkspaceRefreshFailureMode = 'fatal') => {
    if (failureMode === 'fatal') setError(null);
    return runWorkspaceRefresh({
      load: () => loadCloudSnapshot({ resetOperationId }),
      failureMode,
      onLoaded: (data) => {
        consumeCompletedReset(data);
        setSnapshot(data);
        setSelected((current) => current ? data.records.find((record) => record.id === current.id) ?? null : null);
        setError(null);
      },
      onFatalError: setError,
    });
  }, []);
  const refreshAfterCommittedImport = useCallback(() => refresh(undefined, 'preserve'), [refresh]);

  useEffect(() => {
    let cancelled = false;
    const text = textRef.current;
    loadCloudSnapshot().then((data) => {
      if (!cancelled) {
        const recoveredReset = consumeCompletedReset(data);
        setSnapshot(data);
        adoptWorkspaceLocale(data.workspace.locale);
        const params = new URL(window.location.href).searchParams;
        const requestedView = workspaceViewFromQuery(params.get('view'), data);
        if (requestedView) setView(requestedView);
        else if (params.has('view')) notify(text('That view is unavailable in this workspace. Showing the dashboard.'));
        const recordId = params.get('record');
        if (recordId) {
          const linked = data.records.find((record) => record.id === recordId);
          if (linked) { setSelected(linked); setView(linked.objectType); }
          else notify(text('That record is no longer available in this workspace.'));
        }
        if (recoveredReset) notify(text('Workspace reset completion was recovered from its durable receipt.'));
      }
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : text('Could not load the workspace.'));
    });
    loadWorkspace().then((workspace) => setLegacyCount(workspace?.people?.length ?? 0)).catch(() => undefined);
    return () => { cancelled = true; };
  }, [notify, adoptWorkspaceLocale]);

  const mutate = useCallback(async (type: string, payload: Record<string, unknown>, message: string, idempotencyKey?: string) => {
    setBusy(true);
    try {
      await sendCommand(type, payload, idempotencyKey);
      await refresh();
      notify(message);
      return true;
    } catch (reason) {
      const resetOperationId = type === 'demo.reset' && typeof payload.operationId === 'string' ? payload.operationId : undefined;
      const data = await refresh(resetOperationId);
      if (resetOperationId && data?.resetReceipt?.operationId === resetOperationId) {
        notify(text('Workspace reset completed; its durable receipt recovered the interrupted response.'));
        return true;
      }
      notify(reason instanceof Error ? reason.message : text('That change could not be saved.'), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }, [notify, refresh, text]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        setSelected(null);
        setEditor(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebarOpen || !sidebar || !window.matchMedia('(max-width: 820px)').matches) return;
    const menuButton = mobileMenuRef.current;
    const focusableSelector = 'button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';
    const focusables = () => [...sidebar.querySelectorAll<HTMLElement>(focusableSelector)].filter((item) => item.getClientRects().length > 0);
    const frame = window.requestAnimationFrame(() => (sidebar.querySelector<HTMLElement>('.sidebar-close') ?? focusables()[0] ?? sidebar).focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setSidebarOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        sidebar.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    sidebar.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      sidebar.removeEventListener('keydown', onKeyDown);
      menuButton?.focus();
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (!selected && !editor && !sidebarOpen) return;
    const previous = document.body.style.overflow;
    if (selected || editor) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [editor, selected, sidebarOpen]);

  const go = useCallback((target: AppView) => {
    setView(target);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!snapshot || normalized.length < 2) return [];
    return snapshot.records.filter((record) => !record.archivedAt && [record.name, record.email, record.companyName, record.status, ...record.tags].some((value) => String(value ?? '').toLowerCase().includes(normalized))).slice(0, 8);
  }, [query, snapshot]);

  if (!snapshot && !error) return <LoadingScreen />;
  if (!snapshot || error) return <ErrorScreen message={error ?? 'Unknown error'} onRetry={() => void refresh()} />;

  const currentModule = view in moduleByType ? moduleByType[view as RecordType] : null;
  const translatedModule = currentModule ? t(`module.${currentModule.key}` as TranslationKey) : null;
  const viewTitleKey = `view.${view}.title` as TranslationKey;
  const viewSubtitleKey = `view.${view}.subtitle` as TranslationKey;
  const heading = currentModule
    ? { title: translatedModule!, subtitle: t('module.manage', { items: translatedModule!.toLocaleLowerCase(locale) }) }
    : { title: t(viewTitleKey), subtitle: t(viewSubtitleKey) };

  const changeLanguage = async (nextLocale: ReturnType<typeof normalizeLocale>) => {
    await mutate('workspace.update', { locale: nextLocale }, translate(nextLocale, 'admin.saved'));
  };

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="sidebar-backdrop" aria-label={t('nav.close')} onClick={() => setSidebarOpen(false)} />}
      <aside ref={sidebarRef} id="crm-navigation" className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label={t('nav.label')} tabIndex={-1}>
        <button className="sidebar-close" aria-label={t('nav.close')} onClick={() => setSidebarOpen(false)}>×</button>
        <a className="brand" href="/"><span className="brand-mark">F</span><span>FREE CRM</span></a>
        <button className={`nav-item ${view === 'dashboard' ? 'active' : ''}`} aria-current={view === 'dashboard' ? 'page' : undefined} onClick={() => go('dashboard')}><span>⌂</span>{t('nav.home')}</button>
        {([['Relationships', 'nav.relationships'], ['Sales', 'nav.sales'], ['Work', 'nav.work'], ['Growth', 'nav.growth'], ['Service', 'nav.service']] as const).map(([group, label]) => (
          <div className="nav-group" key={group}>
            <p>{t(label)}</p>
            {moduleCatalog.filter((module) => module.group === group && snapshot.capabilities[moduleCapability(module.key)].enabled && snapshot.modules.find((item) => item.moduleKey === module.key)?.enabled !== false).map((module) => {
              const count = snapshot.records.filter((record) => record.objectType === module.key && !record.archivedAt).length;
              return <button key={module.key} className={`nav-item ${view === module.key ? 'active' : ''}`} aria-current={view === module.key ? 'page' : undefined} onClick={() => go(module.key)}><span>{module.glyph}</span>{t(`module.${module.key}` as TranslationKey)}<b>{count.toLocaleString(locale)}</b></button>;
            })}
          </div>
        ))}
        <div className="nav-group nav-tools">
          <p>{t('nav.operate')}</p>
          <a className="nav-item" href="/brain"><span>◎</span>{t('nav.secondBrain')}</a>
          <a className="nav-item" href="/today"><span>✳</span>{t('nav.today')}</a>
          <button className={`nav-item ${view === 'reports' ? 'active' : ''}`} aria-current={view === 'reports' ? 'page' : undefined} onClick={() => go('reports')}><span>⌁</span>{t('nav.reports')}</button>
          <button className={`nav-item ${view === 'workflows' ? 'active' : ''}`} aria-current={view === 'workflows' ? 'page' : undefined} onClick={() => go('workflows')}><span>↯</span>{t('nav.workflows')}</button>
          {snapshot.capabilities.integrations.enabled && <button className={`nav-item ${view === 'integrations' ? 'active' : ''}`} aria-current={view === 'integrations' ? 'page' : undefined} onClick={() => go('integrations')}><span>⌘</span>{t('nav.integrations')}</button>}
          {snapshot.capabilities.agentPlane.enabled && <button className={`nav-item ${view === 'agents' ? 'active' : ''}`} aria-current={view === 'agents' ? 'page' : undefined} onClick={() => go('agents')}><span>◈</span>{t('nav.agents')}</button>}
          <button className={`nav-item ${view === 'admin' ? 'active' : ''}`} aria-current={view === 'admin' ? 'page' : undefined} onClick={() => go('admin')}><span>⚙</span>{t('nav.settings')}</button>
          <a className="nav-item" href="/how-it-works"><span>?</span>{t('nav.how')}</a>
        </div>
        <div className="sidebar-health"><i /><div><strong><T text={snapshot.runtime.label} /></strong><small><T text={snapshot.runtime.detail} /></small></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button ref={mobileMenuRef} className="mobile-menu" aria-label={t('nav.open')} aria-expanded={sidebarOpen} aria-controls="crm-navigation" onClick={() => setSidebarOpen((open) => !open)}>☰</button>
          <div className="search-box">
            <span>⌕</span>
            <input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('workspace.search')} aria-label={t('workspace.searchLabel')} />
            <kbd><T text="⌘ K" /></kbd>
            {query.trim().length >= 2 && <div className="search-results">
              {searchResults.length ? searchResults.map((record) => <button key={record.id} onClick={() => { setSelected(record); setQuery(''); }}><span className="mini-avatar">{initials(record.name)}</span><span><strong>{record.name}</strong><small>{t(`module.${record.objectType}` as TranslationKey)} · {record.companyName || text(titleCase(record.status))}</small></span></button>) : <p>{t('workspace.noMatches')}</p>}
            </div>}
          </div>
          <div className="top-actions"><LanguageSelect className="workspace-language-select" disabled={busy} onChange={changeLanguage} /><span className="sync-pill"><i />{t('workspace.loaded', { when: relativeDate(snapshot.generatedAt, locale) })}</span><span className="avatar-button" title={snapshot.workspace.ownerEmail} aria-label={snapshot.runtime.mode === 'device' ? text("Local workspace owner: {value0}", { value0: snapshot.workspace.ownerName }) : text("Signed in as {value0}", { value0: snapshot.workspace.ownerName })}>{initials(snapshot.workspace.ownerName)}</span></div>
        </header>

        <main className="content">
          {snapshot.demo && <div className="demo-banner"><span><b>{t('workspace.demoTitle')}</b> — {t('workspace.demoBody')}</span><button onClick={() => go('admin')}>{t('workspace.startClean')}</button></div>}
          {snapshot.resetState && <div className="legacy-banner"><span><b><T text="Workspace reset " /><T text={snapshot.resetState.status} />.</b><T text=" Resume the " /><T text={snapshot.resetState.mode} /><T text=" reset from Settings before making other changes." /></span><button onClick={() => go('admin')}><T text="Open reset controls" /></button></div>}
          {snapshot.workspace.settings.onboardingComplete !== true && <Onboarding mutate={mutate} busy={busy} />}
          {legacyCount > 0 && <div className="legacy-banner"><span><b><T text="Your earlier on-device CRM is safe." /></b>{' '}{text(legacyCount === 1 ? 'Import {count} contact into this workspace.' : 'Import {count} contacts into this workspace.', { count: legacyCount.toLocaleString(locale) })}</span><button disabled={busy} onClick={async () => {
            const legacy = await loadWorkspace();
            if (!legacy) return;
            const ok = await mutate('legacy.import', { records: legacyWorkspaceRecords(legacy) }, text("Imported {value0} contacts and related work.", { value0: legacyCount }));
            if (ok) setLegacyCount(0);
          }}><T text="Import now" /></button></div>}

          <div className="page-head">
            <div><p className="eyebrow">{currentModule ? t(`nav.${currentModule.group.toLowerCase()}` as TranslationKey) : t('workspace.system')}</p><h1>{heading.title}</h1><p>{heading.subtitle}</p></div>
            {currentModule && <button className="primary-button" onClick={() => setEditor({ type: currentModule.key })}><span>＋</span>{t('common.new', { item: translatedModule!.toLocaleLowerCase(locale) })}</button>}
          </div>

          {view === 'dashboard' && <Dashboard snapshot={snapshot} go={go} open={setSelected} create={(type) => setEditor({ type })} />}
          {currentModule && <RecordsView type={currentModule.key} snapshot={snapshot} open={setSelected} edit={(record) => setEditor({ type: record.objectType, record })} create={() => setEditor({ type: currentModule.key })} mutate={mutate} busy={busy} refresh={refresh} notify={notify} />}
          {view === 'reports' && <Reports snapshot={snapshot} go={go} />}
          {view === 'workflows' && <Workflows snapshot={snapshot} mutate={mutate} busy={busy} />}
          {view === 'integrations' && <Integrations snapshot={snapshot} refresh={refresh} refreshAfterCommittedImport={refreshAfterCommittedImport} notify={notify} />}
          {view === 'agents' && <Agents snapshot={snapshot} refresh={refreshAfterCommittedImport} notify={notify} />}
          {view === 'admin' && <Admin snapshot={snapshot} mutate={mutate} refresh={refresh} busy={busy} onLanguageChange={changeLanguage} />}
        </main>
      </section>

      {selected && <Customer360 record={selected} snapshot={snapshot} close={() => setSelected(null)} edit={() => { setSelected(null); setEditor({ type: selected.objectType, record: selected }); }} mutate={mutate} busy={busy} />}
      {editor && <RecordEditor state={editor} currency={snapshot.workspace.currency} close={() => setEditor(null)} save={async (payload) => {
        const editing = editor.record;
        const ok = await mutate(editing ? 'record.update' : 'record.create', editing ? { ...payload, id: editing.id, version: editing.version } : payload, text("{value0} saved.", { value0: text(moduleByType[editor.type].singular) }));
        if (ok) setEditor(null);
      }} busy={busy} />}
      {toast && <ToastNotice message={toast.message} tone={toast.tone} />}
    </div>
  );
}

/** Messages are already formatted; a second lookup could translate a record name. */
export function ToastNotice({ message, tone }: { message: string; tone: Toast['tone'] }) {
  return <div className={`toast ${tone === 'error' ? 'error' : ''}`} role="status">{tone === 'error' ? '!' : '✓'} {message}</div>;
}

function Dashboard({ snapshot, go, open, create }: { snapshot: CRMSnapshot; go: (view: AppView) => void; open: (record: CRMRecord) => void; create: (type: RecordType) => void }) {
  const { locale, t, text } = useI18n();
  const { analytics } = snapshot;
  const tasks = snapshot.records.filter((record) => record.objectType === 'task' && !record.archivedAt && record.status !== 'completed').sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt))).slice(0, 5);
  const activity = snapshot.records.filter((record) => ['activity', 'ticket', 'invoice'].includes(record.objectType) && !record.archivedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  const maxPipeline = Math.max(1, ...analytics.pipeline.map((item) => item.amountCents));
  return <>
    <section className="metrics-grid">
      <MetricCard label={t('dashboard.openPipeline')} value={formatMoney(analytics.openPipelineCents, snapshot.workspace.currency, locale)} note={t('dashboard.weighted', { amount: formatMoney(analytics.weightedForecastCents, snapshot.workspace.currency, locale) })} onClick={() => go('opportunity')} />
      <MetricCard label={t('dashboard.revenueWon')} value={formatMoney(analytics.wonRevenueCents, snapshot.workspace.currency, locale)} note={t('dashboard.closedOpportunities')} onClick={() => go('reports')} />
      <MetricCard label={t('dashboard.outstanding')} value={formatMoney(analytics.outstandingInvoiceCents, snapshot.workspace.currency, locale)} note={t('dashboard.overdueAmount', { amount: formatMoney(analytics.overdueInvoiceCents, snapshot.workspace.currency, locale) })} onClick={() => go('invoice')} />
      <MetricCard label={t('dashboard.needsAttention')} value={(analytics.overdueTasks + analytics.openTickets).toLocaleString(locale)} note={t('dashboard.attentionNote', { tasks: analytics.overdueTasks.toLocaleString(locale), tickets: analytics.openTickets.toLocaleString(locale) })} onClick={() => go('task')} />
    </section>
    <section className="dashboard-grid">
      <div className="panel task-panel">
        <div className="panel-head"><div><p className="eyebrow">{t('dashboard.today')}</p><h2>{t('dashboard.commitments')}</h2></div><button onClick={() => create('task')}>＋ {t('dashboard.addTask')}</button></div>
        {tasks.length ? tasks.map((task) => <button className="task-row" key={task.id} onClick={() => open(task)}><i className={task.dueAt && new Date(task.dueAt) < new Date() ? 'overdue' : ''} /><span><strong>{task.name}</strong><small>{task.companyName || String(task.fields.personName ?? text('Independent'))}</small></span><time>{relativeDate(task.dueAt, locale)}</time><StatusChip status={task.priority || 'medium'} /></button>) : <EmptyState title="Nothing overdue" body="Your task list is clear." action={t('dashboard.addTask')} onAction={() => create('task')} />}
      </div>
      <div className="panel pipeline-panel">
        <div className="panel-head"><div><p className="eyebrow">{t('dashboard.forecast')}</p><h2>{t('dashboard.pipelineShape')}</h2></div><button onClick={() => go('opportunity')}>{t('dashboard.openBoard')}</button></div>
        <div className="bar-list">{analytics.pipeline.filter((item) => !['lost'].includes(item.label)).map((item) => <div key={item.label}><span>{text(titleCase(item.label))}</span><div><i style={{ width: `${Math.max(4, item.amountCents / maxPipeline * 100)}%` }} /></div><b>{formatMoney(item.amountCents, snapshot.workspace.currency, locale)}</b></div>)}</div>
      </div>
      <div className="panel activity-panel">
        <div className="panel-head"><div><p className="eyebrow">{t('dashboard.signals')}</p><h2>{t('dashboard.recentActivity')}</h2></div><button onClick={() => go('activity')}>{t('dashboard.viewAll')}</button></div>
        <div className="timeline">{activity.map((record) => <button key={record.id} onClick={() => open(record)}><span className={`timeline-dot ${record.objectType}`} /><span><strong>{record.name}</strong><small>{t(`module.${record.objectType}` as TranslationKey)} · {record.companyName || text(titleCase(record.status))}</small></span><time>{relativeDate(record.updatedAt, locale)}</time></button>)}</div>
      </div>
      <aside className="panel focus-panel"><p className="eyebrow">{t('dashboard.soloFocus')}</p><h2>{t('dashboard.calmSystem')}</h2><p>{t('dashboard.focusBody')}</p><div className="focus-score"><strong>{analytics.taskCompletionRate.toLocaleString(locale)}%</strong><span>{t('dashboard.taskCompletion')}</span></div><div className="focus-score"><strong>{analytics.leadConversionRate.toLocaleString(locale)}%</strong><span>{t('dashboard.leadConversion')}</span></div><button className="secondary-button" onClick={() => go('reports')}>{t('dashboard.exploreInsights')}</button></aside>
    </section>
  </>;
}

function RecordsView({ type, snapshot, open, edit, create, mutate, busy, refresh, notify }: { type: RecordType; snapshot: CRMSnapshot; open: (record: CRMRecord) => void; edit: (record: CRMRecord) => void; create: () => void; mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; busy: boolean; refresh: () => Promise<CRMSnapshot | null>; notify: (message: string, tone?: Toast['tone']) => void }) {
  const { text } = useI18n();
  const moduleDefinition = moduleByType[type];
  const [status, setStatus] = useState('all');
  const [scope, setScope] = useState<'active' | 'archived'>('active');
  const [fileBusy, setFileBusy] = useState(false);
  const records = snapshot.records.filter((record) => record.objectType === type && (scope === 'archived' ? Boolean(record.archivedAt) : !record.archivedAt));
  const archivedCount = snapshot.records.filter((record) => record.objectType === type && record.archivedAt).length;
  const activeCount = snapshot.records.filter((record) => record.objectType === type && !record.archivedAt).length;
  const filtered = scope === 'archived' || status === 'all' ? records : records.filter((record) => record.status === status);

  if (type === 'opportunity' && scope === 'active') return <><section className="module-panel panel archive-toolbar"><div className="module-toolbar"><div className="filter-tabs"><button className="active" onClick={() => setScope('active')}><T text="Active " /><b>{activeCount}</b></button><button onClick={() => setScope('archived')}><T text="Archived " /><b>{archivedCount}</b></button></div></div></section><PipelineBoard records={records} currency={snapshot.workspace.currency} open={open} edit={edit} mutate={mutate} busy={busy} create={create} /></>;

  const uploadDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileBusy(true);
    try {
      await uploadDocumentFile(snapshot.workspace.id, file);
      await refresh();
      notify(text("{value0} uploaded securely.", { value0: file.name }));
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : text('Upload failed.'), 'error');
    } finally {
      setFileBusy(false);
      event.target.value = '';
    }
  };

  const removeDocument = async (record: CRMRecord) => {
    if (!window.confirm(text("Permanently delete {value0}? This also removes the stored file.", { value0: record.name }))) return;
    setFileBusy(true);
    try {
      await deleteDocumentFile(snapshot.workspace.id, record.id);
      await refresh();
      notify(text("{value0} permanently deleted.", { value0: record.name }));
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : text('Delete failed.'), 'error');
    } finally {
      setFileBusy(false);
    }
  };

  return <section className="module-panel panel">
    <div className="module-toolbar">
      <div className="filter-tabs"><button className={scope === 'active' && status === 'all' ? 'active' : ''} onClick={() => { setScope('active'); setStatus('all'); }}><T text="Active " /><b>{activeCount}</b></button><button className={scope === 'archived' ? 'active' : ''} onClick={() => setScope('archived')}><T text="Archived " /><b>{archivedCount}</b></button>{scope === 'active' && moduleDefinition.statuses.map((item) => <button key={item} className={status === item ? 'active' : ''} onClick={() => setStatus(item)}>{text(titleCase(item))}</button>)}</div>
      {type === 'task' && <a className="secondary-button compact" href="/api/v1/calendar"><T text="Export calendar" /></a>}
      {type === 'document' && <label className="secondary-button compact upload-button"><T text="Upload file" /><input type="file" onChange={uploadDocument} disabled={busy || fileBusy} accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.json,.docx,.xlsx" /></label>}
    </div>
    {filtered.length ? <div className="record-table-wrap" role="region" aria-label={text("{value0} table. Scroll horizontally for more columns.", { value0: text(moduleDefinition.label) })} tabIndex={0}><table className="record-table"><thead><tr><th><T text={moduleDefinition.singular} /></th><th><T text="Status" /></th><th>{['opportunity', 'quote', 'invoice', 'product'].includes(type) ? <T text="Value" /> : <T text="Company / context" />}</th><th>{['task', 'activity', 'invoice'].includes(type) ? <T text="Date" /> : <T text="Updated" />}</th><th><T text="Health" /></th><th><span className="sr-only"><T text="Actions" /></span></th></tr></thead><tbody>{filtered.map((record) => <RecordRow key={record.id} record={record} open={open} edit={edit} mutate={mutate} busy={busy || fileBusy} removeDocument={removeDocument} />)}</tbody></table></div> : <EmptyState title={scope === 'archived' ? text("No archived {value0}", { value0: text(moduleDefinition.label) }) : text("No {value0} yet", { value0: status === 'all' ? text(moduleDefinition.label) : text(titleCase(status)).toLowerCase() })} body={scope === 'archived' ? 'Archived records appear here and can be restored without losing their history.' : text("Create your first {value0} to put this module to work.", { value0: text(moduleDefinition.singular) })} action={scope === 'active' ? text("New {value0}", { value0: text(moduleDefinition.singular) }) : undefined} onAction={scope === 'active' ? create : undefined} />}
  </section>;
}

function RecordRow({ record, open, edit, mutate, busy, removeDocument }: { record: CRMRecord; open: (record: CRMRecord) => void; edit: (record: CRMRecord) => void; mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; busy: boolean; removeDocument: (record: CRMRecord) => Promise<void> }) {
  const { locale, text } = useI18n();
  const moneyType = ['opportunity', 'quote', 'invoice', 'product'].includes(record.objectType);
  const date = ['task', 'activity', 'invoice'].includes(record.objectType) ? record.dueAt || record.closedAt : record.updatedAt;
  const health = recordHealth(record);
  return <tr>
    <td><button className="record-name" onClick={() => open(record)}><span className={`record-avatar ${record.objectType}`}>{initials(record.name)}</span><span><strong>{record.name}</strong><small>{record.email || record.source || text(moduleByType[record.objectType].singular)}</small></span></button></td>
    <td><StatusChip status={record.status} /></td>
    <td>{moneyType ? <strong>{formatMoney(record.amountCents, record.currency, locale)}</strong> : record.companyName || String(record.fields.channel ?? record.fields.industry ?? '—')}</td>
    <td>{shortDate(date, locale)}</td>
    <td><span className={`health health-${health}`}><i />{text(titleCase(health))}</span></td>
    <td><div className="row-actions">{record.archivedAt ? <button disabled={busy} onClick={() => void mutate('record.restore', { id: record.id, version: record.version }, text("{value0} restored.", { value0: record.name }))}><T text="Restore" /></button> : <><button onClick={() => edit(record)}><T text="Edit" /></button>{record.objectType === 'lead' && ['new', 'contacted', 'qualified'].includes(record.status) && <button disabled={busy} onClick={() => void mutate('lead.convert', { id: record.id, version: record.version, createOpportunity: true, amountCents: record.amountCents }, text("{value0} converted to a contact and opportunity.", { value0: record.name }))}><T text="Convert" /></button>}{record.objectType === 'quote' && record.status === 'sent' && <button disabled={busy} onClick={() => void mutate('quote.accept', { id: record.id, version: record.version }, text('Quote accepted and invoice created.'))}><T text="Accept" /></button>}{record.objectType === 'invoice' && record.status === 'draft' && <button disabled={busy} onClick={() => void mutate('invoice.issue', { id: record.id, version: record.version }, text('Invoice issued with a durable number and due date.'))}><T text="Issue" /></button>}{record.objectType === 'invoice' && ['sent', 'partial', 'overdue'].includes(record.status) && <button disabled={busy} onClick={() => {
      const raw = window.prompt(text('Payment amount'), String(Math.max(0, record.amountCents - Number(record.fields.paidCents ?? 0)) / 100));
      const paymentCents = Math.round(Number(raw) * 100);
      if (raw && Number.isSafeInteger(paymentCents) && paymentCents > 0) void mutate('invoice.record_payment', { id: record.id, version: record.version, paymentCents }, text('Payment recorded.'));
    }}><T text="Pay" /></button>}{record.objectType === 'ticket' && !['resolved', 'closed'].includes(record.status) && <button disabled={busy} onClick={() => {
      const resolution = window.prompt(text('Resolution summary'));
      if (resolution) void mutate('ticket.resolve', { id: record.id, version: record.version, resolution }, text('Ticket resolved.'));
    }}><T text="Resolve" /></button>}{record.objectType === 'document' && typeof record.fields.objectKey === 'string' && <><a href={`/api/v1/files?id=${encodeURIComponent(record.id)}`}><T text="Download" /></a><button disabled={busy} onClick={() => void removeDocument(record)}><T text="Delete" /></button></>}</>}</div></td>
  </tr>;
}

function PipelineBoard({ records, currency, open, edit, mutate, busy, create }: { records: CRMRecord[]; currency: string; open: (record: CRMRecord) => void; edit: (record: CRMRecord) => void; mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; busy: boolean; create: () => void }) {
  const { locale, text } = useI18n();
  const stages = moduleByType.opportunity.statuses;
  return <LocalizedAttributes names={["aria-label"]}><div className="pipeline-board" role="region" aria-label="Opportunity pipeline. Scroll horizontally to review every stage." tabIndex={0}>{stages.map((stage) => {
    const items = records.filter((record) => record.status === stage);
    const value = items.reduce((sum, record) => sum + record.amountCents, 0);
    return <section className="pipeline-column" key={stage}><header><span><i className={`stage-dot ${stage}`} />{text(titleCase(stage))}</span><b>{items.length}</b><small>{formatMoney(value, currency, locale)}</small></header><div>{items.map((record) => <article className="deal-card" key={record.id}><button className="deal-main" onClick={() => open(record)}><strong>{record.name}</strong><span>{record.companyName || text('Independent')}</span><b>{formatMoney(record.amountCents, record.currency, locale)}</b><small>{record.probability}<T text="% probability · " />{shortDate(record.dueAt, locale)}</small></button><div><button onClick={() => edit(record)}><T text="Edit" /></button>{!['won', 'lost'].includes(record.status) && <button disabled={busy} onClick={() => void mutate('record.update', { id: record.id, version: record.version, status: nextStatus('opportunity', record.status) }, text("Moved {value0} to {value1}.", { value0: record.name, value1: text(titleCase(nextStatus('opportunity', record.status))) }))}><T text="Advance →" /></button>}</div></article>)}</div>{stage === 'exploring' && <button className="add-card" onClick={create}><T text="＋ New opportunity" /></button>}</section>;
  })}</div></LocalizedAttributes>;
}

function Reports({ snapshot, go }: { snapshot: CRMSnapshot; go: (view: AppView) => void }) {
  const { locale, text } = useI18n();
  const analytics = snapshot.analytics;
  const maxRevenue = Math.max(1, ...analytics.revenueByMonth.map((item) => item.amountCents));
  const maxActivity = Math.max(1, ...analytics.activityByWeek.map((item) => item.count));
  return <>
    <section className="metrics-grid report-metrics"><MetricCard label="Weighted forecast" value={formatMoney(analytics.weightedForecastCents, snapshot.workspace.currency, locale)} note="Probability-adjusted" onClick={() => go('opportunity')} /><MetricCard label="Lead conversion" value={`${analytics.leadConversionRate.toLocaleString(locale)}%`} note="Leads converted" onClick={() => go('lead')} /><MetricCard label="Task completion" value={`${analytics.taskCompletionRate.toLocaleString(locale)}%`} note={text("{value0} overdue", { value0: analytics.overdueTasks })} onClick={() => go('task')} /><MetricCard label="Open support" value={analytics.openTickets.toLocaleString(locale)} note="Customer tickets" onClick={() => go('ticket')} /></section>
    <section className="reports-grid">
      <div className="panel chart-card"><div className="panel-head"><div><p className="eyebrow"><T text="REVENUE" /></p><h2><T text="Won by month" /></h2></div><strong>{formatMoney(analytics.wonRevenueCents, snapshot.workspace.currency, locale)}</strong></div><div className="column-chart">{analytics.revenueByMonth.map((item) => <div key={item.label}><b>{item.amountCents ? formatMoney(item.amountCents, snapshot.workspace.currency, locale) : ''}</b><i style={{ height: `${Math.max(5, item.amountCents / maxRevenue * 100)}%` }} /><span>{item.label}</span></div>)}</div></div>
      <div className="panel chart-card"><div className="panel-head"><div><p className="eyebrow"><T text="MOMENTUM" /></p><h2><T text="Activity volume" /></h2></div><strong>{analytics.activityByWeek.reduce((sum, item) => sum + item.count, 0)}</strong></div><div className="column-chart activity-chart">{analytics.activityByWeek.map((item) => <div key={item.label}><b>{item.count}</b><i style={{ height: `${Math.max(5, item.count / maxActivity * 100)}%` }} /><span>{item.label}</span></div>)}</div></div>
      <div className="panel report-list"><div className="panel-head"><div><p className="eyebrow"><T text="ACQUISITION" /></p><h2><T text="Lead sources" /></h2></div></div>{analytics.sources.map((source) => <button key={source.label} onClick={() => go('lead')}><span><strong>{source.label}</strong><small>{source.leads}<T text=" leads" /></small></span><span>{source.converted}<T text=" converted" /></span><b>{source.leads ? Math.round(source.converted / source.leads * 100) : 0}%</b></button>)}</div>
      <div className="panel report-list"><div className="panel-head"><div><p className="eyebrow"><T text="CASH FLOW" /></p><h2><T text="Invoice aging" /></h2></div></div>{analytics.invoiceAging.map((bucket) => <button key={bucket.label} onClick={() => go('invoice')}><span><strong><T text={bucket.label} /></strong><small><T text="days overdue" /></small></span><b>{formatMoney(bucket.amountCents, snapshot.workspace.currency, locale)}</b></button>)}</div>
    </section>
  </>;
}

function Workflows({ snapshot, mutate, busy }: { snapshot: CRMSnapshot; mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; busy: boolean }) {
  const { locale, text } = useI18n();
  return <div className="settings-grid"><section className="panel settings-card wide"><div className="panel-head"><div><p className="eyebrow"><T text="AUTOMATION RULES" /></p><h2><T text="Active logic" /></h2></div><span className="truth-badge"><T text="Audited" /></span></div>{snapshot.workflows.map((workflow) => <div className="workflow-row" key={workflow.id}><span className="workflow-icon">↯</span><span><strong>{workflow.name}</strong><small>{text(workflow.actions.length === 1 ? 'When {trigger} · {count} action' : 'When {trigger} · {count} actions', { trigger: text(titleCase(workflow.triggerType)), count: workflow.actions.length.toLocaleString(locale) })}</small></span><span><small><T text="Last run" /></small><strong>{relativeDate(workflow.lastRunAt, locale)}</strong></span><label className="switch"><input type="checkbox" aria-label={text("Enable {value0}", { value0: workflow.name })} checked={workflow.enabled} disabled={busy} onChange={(event) => void mutate('workflow.toggle', { id: workflow.id, enabled: event.target.checked }, text(event.target.checked ? '{name} enabled.' : '{name} paused.', { name: workflow.name }))} /><i /></label></div>)}</section><section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow"><T text="RUN HISTORY" /></p><h2><T text="Recent executions" /></h2></div></div>{snapshot.workflowRuns.length ? snapshot.workflowRuns.map((run) => <div className="audit-row" key={run.id}><span className={run.status === 'succeeded' ? 'success-dot' : 'error-dot'} /><span><strong>{run.status === 'succeeded' ? text('Workflow completed') : text(run.error ?? '')}</strong><small>{text(((run.output.createdRecordIds as unknown[])?.length ?? 0) === 1 ? '{date} · {count} record created' : '{date} · {count} records created', { date: shortDate(run.startedAt, locale), count: ((run.output.createdRecordIds as unknown[])?.length ?? 0).toLocaleString(locale) })}</small></span></div>) : <EmptyState title="No runs yet" body="Enabled workflows run when matching records change." />}</section></div>;
}

function Integrations({ snapshot, refresh, refreshAfterCommittedImport, notify }: { snapshot: CRMSnapshot; refresh: () => Promise<CRMSnapshot | null>; refreshAfterCommittedImport: () => Promise<CRMSnapshot | null>; notify: (message: string, tone?: Toast['tone']) => void }) {
  const { text } = useI18n();
  const [simulatorBusy, setSimulatorBusy] = useState(false);
  const operateSimulator = async (payload: Record<string, unknown>, message: string) => { setSimulatorBusy(true); try { await sendIdempotentOperation('/api/v1/connectors', payload); await refresh(); notify(message); } catch (error) { notify(error instanceof Error ? error.message : text('Connector operation failed.'), 'error'); } finally { setSimulatorBusy(false); } };
  return <>
    <div className="integration-intro panel"><span className="integration-lock">⌘</span><div><strong><T text="Working data paths are labeled clearly" /></strong><p><T text="CSV import/export, calendar export, mail composer, and the eligible webhook simulator work now. External OAuth and outbound delivery adapters are not implemented; supplying credentials alone does not enable them." /></p></div><a className="secondary-button compact" href="/api/v1/export"><T text="Export snapshot" /></a></div>
    <CsvImporter refresh={refreshAfterCommittedImport} notify={notify} />
    <div className="integration-section-head"><div><p className="eyebrow"><T text="CONNECTORS & HANDOFFS" /></p><h2><T text="Other ways to move work" /></h2></div><p><T text="Webhook simulation is isolated from file import. Each remaining card states whether it performs a real local handoff or only previews future architecture." /></p></div>
    <section className="integration-grid">
      {referenceConnectors.filter((definition) => definition.key === 'webhook-simulator').map((definition) => {
        const connection = snapshot.connectorConnections.find((item) => item.connectorKey === definition.key);
        const connected = connection?.status === 'connected';
        const webhookIngressUnavailable = snapshot.runtime.mode === 'authjs';
        return <article className="integration-card panel" key={definition.key}>
          <header><span className="integration-logo">↗</span><StatusChip status={webhookIngressUnavailable ? 'unavailable' : connection?.health ?? 'disconnected'} /></header>
          <h2><T text={definition.name} /></h2>
          <p>{webhookIngressUnavailable ? <T text="Native Vercel machine ingress is disabled until a free, rate-limited service-auth boundary exists." /> : <T text="Inbound delivery uses the workspace-specific key you create when connecting; only its SHA-256 hash is stored." />}<T text=" Scopes: " />{definition.scopes.join(', ')}.</p>
          {!webhookIngressUnavailable && <p><strong><T text="Endpoint:" /></strong> <code>{`/api/v1/webhooks/${snapshot.workspace.id}`}</code></p>}
          <dl><div><dt><T text="Cursor" /></dt><dd>{connection?.syncCursor ?? text('Not started')}</dd></div><div><dt><T text="Auth" /></dt><dd>{webhookIngressUnavailable ? <T text="Unavailable on Vercel" /> : <T text="Workspace key" />}</dd></div></dl>
          <div className="button-row">{webhookIngressUnavailable ? <><button className="secondary-button" disabled>Unavailable on Vercel</button>{connected && <button className="secondary-button" disabled={simulatorBusy} onClick={() => void operateSimulator({ operation: 'disconnect', connectionId: connection.id }, text('Simulator disconnected and credential metadata cleared.'))}>Disconnect</button>}</> : !connected ? <button className="primary-button" disabled={simulatorBusy} onClick={() => {
              const payload: Record<string, unknown> = { operation: 'connect', connectorKey: definition.key };
              const suggested = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
              const webhookKey = window.prompt(text('Copy and store this workspace webhook key now. FREE CRM stores only its SHA-256 hash. Reconnecting rotates it.'), suggested);
              if (!webhookKey) return;
              payload.webhookKey = webhookKey;
              void operateSimulator(payload, text("{value0} simulator connected.", { value0: text(definition.name) }));
            }}>Connect simulator</button> : <><button className="primary-button" disabled={simulatorBusy} onClick={() => void operateSimulator({ operation: 'sync', connectionId: connection.id }, text('Simulation completed; no external data was claimed.'))}>Run simulation</button><button className="secondary-button" disabled={simulatorBusy} onClick={() => void operateSimulator({ operation: 'disconnect', connectionId: connection.id }, text('Simulator disconnected and credential metadata cleared.'))}>Disconnect</button></>}
          </div>
        </article>;
      })}
      {snapshot.integrations.map((integration) => {
        const localHref = integration.provider === 'calendar' ? '/api/v1/calendar' : integration.provider === 'email' ? 'mailto:' : null;
        const description = integration.provider === 'calendar'
          ? 'Working ICS export for active tasks; this is not a two-way calendar sync.'
          : integration.provider === 'email'
            ? 'Opens your default mail client; FREE CRM does not send, sync, or log the message.'
            : 'Architecture preview only. A reviewed provider adapter is not installed in this release.';
        return <article className="integration-card panel" key={integration.id}>
          <header><span className={`integration-logo ${integration.provider}`}>{integration.provider === 'google' ? <T text="G" /> : integration.provider === 'microsoft' ? <T text="M" /> : integration.provider === 'slack' ? '#' : '↗'}</span><StatusChip status={localHref ? 'available' : 'preview'} /></header>
          <h2>{integration.name}</h2>
          <p><T text={description} /></p>
          <dl><div><dt><T text="Mode" /></dt><dd>{integration.provider === 'calendar' ? <T text="One-way export" /> : integration.provider === 'email' ? <T text="System composer" /> : <T text="Not active" />}</dd></div><div><dt><T text="Adapter" /></dt><dd>{localHref ? <T text="Built in" /> : <T text="Not installed" />}</dd></div></dl>
          {localHref && <a className="primary-button" href={localHref}>{integration.provider === 'calendar' ? <T text="Export calendar" /> : <T text="Compose email" />}</a>}
          {!localHref && <button className="secondary-button" disabled><T text="Not implemented in this release" /></button>}
          {integration.lastError && <small className="inline-error">{integration.lastError}</small>}
        </article>;
      })}
    </section>
  </>;
}

function Onboarding({ mutate, busy }: { mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; busy: boolean }) {
  const { t } = useI18n();
  const choose = (profile: WorkspaceProfile) => void mutate('workspace.update', { profile, settings: { onboardingComplete: true } }, t('onboarding.ready'));
  return <section className="panel onboarding-panel"><div><p className="eyebrow">{t('onboarding.eyebrow')}</p><h2>{t('onboarding.title')}</h2><p>{t('onboarding.body')}</p></div><div className="onboarding-choices"><button disabled={busy} onClick={() => choose('personal')}>{t('onboarding.personal')}<small>{t('onboarding.personalHelp')}</small></button><button disabled={busy} onClick={() => choose('business')}>{t('onboarding.business')}<small>{t('onboarding.businessHelp')}</small></button><button disabled={busy} onClick={() => choose('enterprise')}>{t('onboarding.enterprise')}<small>{t('onboarding.enterpriseHelp')}</small></button></div></section>;
}

async function agentOperation(payload: Record<string, unknown>) {
  if (payload.operation === 'agent.create') return sendIdempotentOperation('/api/v1/agents/actions', payload);
  if (payload.operation === 'action.propose') return sendIdempotentOperation('/api/v1/agents/actions', payload, { keyInBody: 'idempotencyKey' });
  if (payload.operation === 'grant.expiry.set') {
    return setAgentToolGrantExpiry(String(payload.agentId ?? ''), String(payload.toolId ?? ''), payload.expiresAt === null ? null : String(payload.expiresAt ?? ''));
  }
  if (payload.operation === 'grant.revoke') return revokeAgentToolGrant(String(payload.agentId ?? ''), String(payload.toolId ?? ''));
  const response = await fetch('/api/v1/agents/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({})) as { data?: Record<string, unknown>; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || 'Agent operation failed.');
  return body.data ?? {};
}

function Agents({ snapshot, refresh, notify }: { snapshot: CRMSnapshot; refresh: () => Promise<CRMSnapshot | null>; notify: (message: string, tone?: Toast['tone']) => void }) {
  const { locale, text } = useI18n();
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const run = async (payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    try {
      const data = await agentOperation(payload) as Record<string, unknown>;
      const refreshed = await refresh();
      const output = data.output && typeof data.output === 'object' ? data.output as { recordCounts?: Record<string, number> } : null;
      const count = output?.recordCounts ? Object.values(output.recordCounts).reduce((sum, value) => sum + Number(value || 0), 0) : null;
      const completed = count === null ? success : text("{value0} Read {value1} active records.", { value0: success, value1: count });
      notify(refreshed ? completed : text("{value0} The receipt is saved, but refresh failed; reload before another agent action.", { value0: completed }), refreshed ? 'success' : 'error');
    } catch (error) {
      await refresh().catch(() => undefined);
      notify(error instanceof Error ? error.message : text('Agent operation failed.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const create = () => { const name = window.prompt(text('Agent name')); if (name) void run({ operation: 'agent.create', name, autonomy: 'approval-required', monthlyBudgetCents: 2500 }, text("{value0} created paused by default.", { value0: name })); };
  const propose = (agent: CRMSnapshot['agents'][number]) => {
    const tool = agent.tools.find((item) => isAgentToolGrantUsable(item, clock));
    const summary = window.prompt(text('What should the local read simulator prepare?'), text('Summarize workspace relationship health'));
    if (tool && summary) void run({ operation: 'action.propose', agentId: agent.id, toolId: tool.id, summary, requestedScope: tool.scopes[0] ?? 'records:read', estimatedCostCents: 0 }, text('Action proposed. Approval is required before execution.'));
  };
  const renewGrant = (agentId: string, toolId: string) => void run(
    { operation: 'grant.expiry.set', agentId, toolId, expiresAt: renewedAgentGrantExpiry(clock) },
    text('Tool grant renewed for 30 days; earlier proposals were cancelled for safety.'),
  );
  const removeGrantExpiry = (agentId: string, toolId: string) => {
    if (!window.confirm(text('Allow this tool grant without an expiry? You must revoke it manually. Existing proposals will be cancelled.'))) return;
    void run({ operation: 'grant.expiry.set', agentId, toolId, expiresAt: null }, text('Tool grant now has no expiry; earlier proposals were cancelled for safety.'));
  };
  const revokeGrant = (agentId: string, toolId: string, toolName: string) => {
    const confirmation = window.prompt(text('Revoking {name} cancels its pending and authorized work and cannot be undone for this agent. Type {confirmation} to continue.', { name: toolName, confirmation: 'REVOKE' }));
    if (confirmation !== 'REVOKE') return;
    void run({ operation: 'grant.revoke', agentId, toolId }, text("{value0} grant revoked. Existing receipts remain available.", { value0: toolName }));
  };

  return <div className="settings-grid">
    <section className="panel settings-card wide">
      <div className="panel-head"><div><p className="eyebrow"><T text="AGENT CONTROL PLANE" /></p><h2><T text="Owned, budgeted, stoppable" /></h2></div><button className="primary-button" disabled={busy} onClick={create}><T text="＋ New agent" /></button></div>
      {snapshot.agents.length ? snapshot.agents.map((agent) => {
        const usableGrant = agent.tools.some((tool) => isAgentToolGrantUsable(tool, clock));
        return <article className="agent-control-card" key={agent.id}>
          <div className="workflow-row agent-summary-row">
            <span className="workflow-icon">◈</span>
            <span><strong>{agent.name}</strong><small>{text(agent.tools.length === 1 ? '{autonomy} · {spent} of {budget} · {count} granted tool' : '{autonomy} · {spent} of {budget} · {count} granted tools', { autonomy: text(titleCase(agent.autonomy)), spent: formatMoney(agent.spentCents, snapshot.workspace.currency, locale), budget: formatMoney(agent.monthlyBudgetCents, snapshot.workspace.currency, locale), count: agent.tools.length.toLocaleString(locale) })}</small></span>
            <StatusChip status={agent.emergencyStoppedAt ? 'emergency_stopped' : agent.status} />
            {agent.status === 'active' && !agent.emergencyStoppedAt && <button disabled={busy || !usableGrant} onClick={() => propose(agent)}><T text="Propose action" /></button>}
            <button disabled={busy || Boolean(agent.emergencyStoppedAt)} onClick={() => void run({ operation: 'agent.safety', agentId: agent.id, status: agent.status === 'active' ? 'paused' : 'active' }, agent.status === 'active' ? text('Agent paused.') : text('Agent activated.'))}>{agent.status === 'active' ? <T text="Pause" /> : <T text="Activate" />}</button>
            <button className="danger-button" disabled={busy} onClick={() => void run({ operation: 'agent.safety', agentId: agent.id, emergencyStop: !agent.emergencyStoppedAt }, agent.emergencyStoppedAt ? text('Emergency stop cleared; agent remains paused.') : text('Emergency stop activated.'))}>{agent.emergencyStoppedAt ? <T text="Clear stop" /> : <T text="Emergency stop" />}</button>
          </div>
          <div className="agent-grant-list" aria-label={text("{value0} tool grants", { value0: agent.name })}>
            {agent.tools.length ? agent.tools.map((tool) => {
              const usable = isAgentToolGrantUsable(tool, clock);
              const expiryTime = tool.expiresAt === null ? Number.POSITIVE_INFINITY : Date.parse(tool.expiresAt);
              const expiryLabel = tool.expiresAt === null
                ? text('No expiry · manual revocation required')
                : !Number.isFinite(expiryTime)
                  ? text('Invalid expiry · grant blocked')
                  : expiryTime <= clock
                    ? text("Expired {value0}", { value0: shortDate(tool.expiresAt, locale) })
                    : text("Expires {value0} · {value1}", { value0: shortDate(tool.expiresAt, locale), value1: relativeDate(tool.expiresAt, locale) });
              return <div className="agent-grant-row" key={tool.id}>
                <span className={usable ? 'success-dot' : 'error-dot'} />
                <span><strong>{tool.name}</strong><small>{tool.external ? <T text="External tool" /> : <T text="Local-only tool" />} · {tool.scopes.join(', ') || text('No scopes')} · <T text={expiryLabel} /></small></span>
                <StatusChip status={usable ? 'granted' : 'expired'} />
                <div className="agent-grant-actions">
                  <button className="secondary-button compact" disabled={busy} onClick={() => renewGrant(agent.id, tool.id)}>{usable && tool.expiresAt ? <T text="Reset to 30 days" /> : <T text="Renew 30 days" />}</button>
                  <button className="secondary-button compact" disabled={busy || tool.expiresAt === null} onClick={() => removeGrantExpiry(agent.id, tool.id)}><T text="No expiry" /></button>
                  <button className="danger-button" disabled={busy} onClick={() => revokeGrant(agent.id, tool.id, tool.name)}><T text="Revoke" /></button>
                </div>
              </div>;
            }) : <p className="agent-no-grants"><T text="All grants were revoked. Completed receipts remain; create a new agent to issue a fresh, scoped grant." /></p>}
          </div>
        </article>;
      }) : <EmptyState title="No agents yet" body="Create an approval-first agent. It starts paused with one local read grant that expires after 30 days." action="Create agent" onAction={create} />}
    </section>
    <section className="panel settings-card">
      <div className="panel-head"><div><p className="eyebrow"><T text="APPROVAL QUEUE" /></p><h2><T text="Human decisions" /></h2></div></div>
      {snapshot.approvals.filter((approval) => approval.status === 'pending').map((approval) => <div className="audit-row" key={approval.id}><span className="warning-dot" /><span><strong>{approval.actionSummary}</strong><small><T text="Expires " />{shortDate(approval.expiresAt, locale)}</small></span><button disabled={busy} onClick={() => void run({ operation: 'approval.decide', approvalId: approval.id, decision: 'approved' }, text('Action approved.'))}><T text="Approve" /></button><button disabled={busy} onClick={() => void run({ operation: 'approval.decide', approvalId: approval.id, decision: 'rejected' }, text('Action rejected.'))}><T text="Reject" /></button></div>)}
    </section>
    <section className="panel settings-card">
      <div className="panel-head"><div><p className="eyebrow"><T text="RUNS & RECEIPTS" /></p><h2><T text="Auditable execution" /></h2></div><span>{snapshot.executionReceipts.length}<T text=" receipts" /></span></div>
      {snapshot.agentRuns.slice(0, 12).map((runItem) => { const receipt = snapshot.executionReceipts.find((item) => item.runId === runItem.id); const outputCounts = receipt?.output ? Object.values(receipt.output.recordCounts).reduce((sum, value) => sum + value, 0) : null; return <div className="audit-row" key={runItem.id}><span className={runItem.status === 'succeeded' ? 'success-dot' : 'warning-dot'} /><span><strong>{receipt?.output?.summary || text(titleCase(runItem.status))}</strong><small>{runItem.id.slice(0, 8)} · {shortDate(runItem.createdAt, locale)}{receipt ? text(" · Receipt {value0} · {value1}", { value0: receipt.id.slice(0, 8), value1: formatMoney(receipt.costCents, snapshot.workspace.currency, locale) }) : ''}{outputCounts === null ? '' : text(" · Read {value0} active records", { value0: outputCounts })}</small></span>{runItem.status === 'authorized' && <button disabled={busy} onClick={() => void run({ operation: 'run.execute', runId: runItem.id }, text('Local simulation executed with a receipt.'))}><T text="Execute simulator" /></button>}</div>; })}
    </section>
  </div>;
}

function Admin({ snapshot, mutate, refresh, busy, onLanguageChange }: { snapshot: CRMSnapshot; mutate: (type: string, payload: Record<string, unknown>, message: string, idempotencyKey?: string) => Promise<boolean>; refresh: () => Promise<CRMSnapshot | null>; busy: boolean; onLanguageChange: (locale: ReturnType<typeof normalizeLocale>) => Promise<void> }) {
  const { locale, t, text } = useI18n();
  const [workspaceName, setWorkspaceName] = useState(snapshot.workspace.name);
  const [currency, setCurrency] = useState(snapshot.workspace.currency);
  const [profile, setProfile] = useState<WorkspaceProfile>(snapshot.workspace.profile);
  const enabled = resolveCapabilities(snapshot.workspace.profile);
  const resetCanResume = Boolean(snapshot.resetState);
  const reset = async (mode: 'clean' | 'demo', operationId?: string) => {
    const label = operationId ? text('resume the {mode} reset', { mode: text(mode) }) : mode === 'clean' ? text('start with a clean workspace') : text('restore the product demo');
    if (window.prompt(text('Type {confirmation} to {action}', { confirmation: 'RESET', action: label })) !== 'RESET') return;
    try {
      const request = prepareResetRequest(snapshot.workspace.id, mode, operationId);
      const ok = await mutate('demo.reset', { confirm: 'RESET', mode, operationId: request.operationId }, mode === 'clean' ? text('Clean workspace created.') : text('Demo workspace restored.'), request.idempotencyKey);
      if (ok) completeResetRequest(snapshot.workspace.id, request.operationId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : text('The reset could not be prepared.'));
    }
  };
  return <div className="settings-grid">
    <section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow">{t('admin.workspace')}</p><h2>{t('admin.profileDefaults')}</h2></div><StatusChip status={snapshot.workspace.role} /></div><form className="settings-form" onSubmit={(event) => { event.preventDefault(); void mutate('workspace.update', { name: workspaceName, currency, profile, locale }, t('admin.saved')); }}><label>{t('admin.workspaceName')}<input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} maxLength={120} required /></label><label>{t('admin.workStyle')}<select value={profile} onChange={(event) => setProfile(event.target.value as WorkspaceProfile)}>{workspaceProfiles.map((item) => <option key={item} value={item}>{item === 'personal' ? <T text="Personal / solo" /> : item === 'business' ? <T text="Business profile (single owner)" /> : <T text="Enterprise profile preview (single owner)" />}</option>)}</select></label><div className="settings-language-field"><span>{t('language.label')}</span><LanguageSelect className="settings-language-select" disabled={busy} onChange={onLanguageChange} /><small>{t('language.workspaceHelp')}</small></div><label className="profile-agent-option"><input type="checkbox" checked={enabled.agentPlane.enabled} readOnly /><T text=" Approval-first agent simulation is available in every profile" /></label><small><T text="Changing profile only changes capability defaults. Records and relationships are never migrated or deleted. Multi-user memberships and external agent transports are not implemented yet." /></small><small><T text="Dates are currently entered and displayed in this browser’s local timezone. Workspace timezone conversion is not implemented yet." /></small><label>{t('admin.currency')}<input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} required /></label><button className="primary-button" disabled={busy}>{t('admin.save')}</button></form></section>
    <section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow"><T text="CONTROL PLANE" /></p><h2><T text="Runtime status" /></h2></div><span className="truth-badge"><i /><T text="Workspace loaded" /></span></div><div className="system-list"><div><span><T text="Runtime" /></span><b><T text={snapshot.runtime.label} /></b></div><div><span><T text="Data bindings" /></span><b><T text={snapshot.runtime.detail} /></b></div><div><span><T text="Identity boundary" /></span><b>{snapshot.runtime.mode === 'device' ? <T text="Loopback-local single user" /> : snapshot.runtime.mode === 'authjs' ? <T text="GitHub OAuth · exact owner" /> : <T text="Cloudflare Access JWT" />}</b></div><div><span><T text="Reference timezone" /></span><b>{snapshot.workspace.timezone}</b></div><div><span><T text="Last refresh" /></span><b>{relativeDate(snapshot.generatedAt, locale)}</b></div><button className="secondary-button" onClick={() => void refresh()}><T text="Refresh workspace status" /></button>{snapshot.runtime.mode === 'authjs' && <a className="secondary-button" href="/api/auth/signout?callbackUrl=/"><T text="Sign out" /></a>}</div></section>
    <section className="panel settings-card wide"><div className="panel-head"><div><p className="eyebrow"><T text="CAPABILITY REGISTRY" /></p><h2><T text="Modules, navigation, limits, and policy" /></h2><small><T text="Current complete-workspace envelope: 1,000 total records, active and archived. Profile module limits can be lower." /></small></div><span><T text="Profile: " />{text(titleCase(snapshot.workspace.profile))}</span></div>{Object.values(snapshot.capabilities).map((capability) => <div className="workflow-row" key={capability.key}><span className="workflow-icon">◇</span><span><strong><T text={capability.label} /></strong><small>{capability.key === 'advancedPolicies' ? <T text="Architecture preview · no authoring or evaluation UI in this release" /> : `${capability.limit === null ? 'No configured module limit' : text("Module limit {value0}", { value0: capability.limit.toLocaleString(locale) })} · ${capability.navigation ? 'Navigation module' : 'Policy capability'}`}</small></span>{capability.key === 'advancedPolicies' ? <StatusChip status="preview" /> : <label className="switch"><input type="checkbox" aria-label={text("Enable {value0}", { value0: text(capability.label) })} checked={capability.enabled} disabled={busy} onChange={(event) => void mutate('capability.update', { key: capability.key, enabled: event.target.checked }, text("{value0} {value1} without deleting data.", { value0: text(capability.label), value1: event.target.checked ? text('enabled') : text('disabled') }))} /><i /></label>}</div>)}</section>
    <section className="panel settings-card wide"><div className="panel-head"><div><p className="eyebrow"><T text="AUDIT TRAIL" /></p><h2><T text="Recent control and data events" /></h2></div><span>{snapshot.audit.length}<T text=" retained here" /></span></div><div className="audit-list">{snapshot.audit.slice(0, 12).map((event) => <div className="audit-row" key={event.id}><span className="success-dot" /><span><strong>{text(titleCase(event.action))}</strong><small>{text(titleCase(event.entityType))}{event.entityId ? ` · ${event.entityId.slice(0, 8)}` : ''}</small></span><time>{relativeDate(event.createdAt, locale)}</time></div>)}</div></section>
    <section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow"><T text="PORTABILITY" /></p><h2><T text="Your data, always" /></h2></div></div><p><T text="The portable snapshot contains CRM application data, but not document bytes or provider-level database backups. Keep your D1/R2 or local state backup as the recovery source of truth." /></p><div className="button-stack"><a className="secondary-button" href="/api/v1/export"><T text="Download portable JSON snapshot" /></a><a className="secondary-button" href="/api/v1/export?format=csv"><T text="Export CRM records (CSV)" /></a><a className="secondary-button" href="/api/v1/calendar"><T text="Export calendar (.ics)" /></a><a className="secondary-button" href="/deploy"><T text="Deploy with your cloud credentials" /></a></div></section>
    <section className="panel settings-card danger-card"><div className="panel-head"><div><p className="eyebrow"><T text="DATA RESET" /></p><h2><T text="Demo and clean modes" /></h2></div></div><p><T text="Reset permanently removes CRM records, links, notes, workflow runs, connector jobs, queued events, and stored document bytes. The append-only security audit, durable reset receipts, minimal retry/delivery receipts, and required agent control-plane identities remain for accountability and replay safety. Interrupted operations use a durable lease and can be resumed safely." /></p>{snapshot.resetState && <div className="reset-state"><strong>{snapshot.resetState.status === 'failed' ? <T text="Interrupted" /> : <T text="Running" />} <T text={snapshot.resetState.mode} /><T text=" reset" /></strong><small><T text="Operation " />{snapshot.resetState.operationId.slice(0, 8)} · {relativeDate(snapshot.resetState.updatedAt, locale)}{snapshot.resetState.lastErrorCode ? ` · ${text(titleCase(snapshot.resetState.lastErrorCode))}` : ''}{snapshot.resetState.status === 'running' && snapshot.resetState.leaseExpiresAt ? text(" · lease {value0}", { value0: relativeDate(snapshot.resetState.leaseExpiresAt, locale) }) : ''}</small><button className="secondary-button" disabled={busy || !resetCanResume} onClick={() => void reset(snapshot.resetState!.mode, snapshot.resetState!.operationId)}><T text="Check or resume reset" /></button></div>}<div className="danger-actions"><button disabled={busy || Boolean(snapshot.resetState)} onClick={() => void reset('clean')}><T text="Start clean" /></button><button disabled={busy || Boolean(snapshot.resetState)} onClick={() => void reset('demo')}><T text="Restore demo" /></button></div></section>
  </div>;
}

function Customer360({ record, snapshot, close, edit, mutate, busy }: { record: CRMRecord; snapshot: CRMSnapshot; close: () => void; edit: () => void; mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; busy: boolean }) {
  const { locale, text } = useI18n();
  const dialogRef = useDialogFocus<HTMLElement>(close);
  const related = relatedRecords(record.id, snapshot.records, snapshot.links);
  const notes = snapshot.notes.filter((note) => note.recordId === record.id);
  const payments = snapshot.invoicePayments.filter((payment) => payment.invoiceId === record.id);
  const [note, setNote] = useState('');
  const submitNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    const ok = await mutate('note.create', { recordId: record.id, kind: 'note', body: note }, text('Note added to the customer timeline.'));
    if (ok) setNote('');
  };
  const changeArchiveState = async () => {
    const restoring = Boolean(record.archivedAt);
    const ok = await mutate(restoring ? 'record.restore' : 'record.archive', { id: record.id, version: record.version }, text(restoring ? '{name} restored.' : '{name} archived.', { name: record.name }));
    if (ok) close();
  };
  return <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <aside ref={dialogRef} tabIndex={-1} className="drawer" role="dialog" aria-modal="true" aria-labelledby="customer-360-title">
      <header><span className={`record-avatar large ${record.objectType}`}>{initials(record.name)}</span><div><p className="eyebrow"><T text="CUSTOMER 360 · " />{text(moduleByType[record.objectType].singular)}</p><h2 id="customer-360-title">{record.name}</h2><p>{record.companyName || record.email || text(titleCase(record.lifecycle))}</p></div><LocalizedAttributes names={["aria-label"]}><button data-dialog-initial className="close-button" aria-label="Close customer 360" onClick={close}>×</button></LocalizedAttributes></header>
      <div className="drawer-actions">{!record.archivedAt && <button className="primary-button" onClick={edit}><T text="Edit record" /></button>}{!record.archivedAt && record.email && <a className="secondary-button" href={`mailto:${record.email}`}><T text="Send email" /></a>}<button className="secondary-button" disabled={busy} onClick={() => void changeArchiveState()}>{record.archivedAt ? <T text="Restore record" /> : <T text="Archive" />}</button></div>
      <section className="detail-grid"><div><span><T text="Status" /></span><StatusChip status={record.archivedAt ? 'archived' : record.status} /></div><div><span><T text="Health" /></span><b className={`health health-${recordHealth(record)}`}><i />{text(titleCase(recordHealth(record)))}</b></div><div><span><T text="Value" /></span><b>{record.amountCents ? formatMoney(record.amountCents, record.currency, locale) : '—'}</b></div><div><span><T text="Owner" /></span><b><T text="You" /></b></div><div><span><T text="Email" /></span><b>{record.email || '—'}</b></div><div><span><T text="Next date" /></span><b>{shortDate(record.dueAt, locale)}</b></div></section>
      <section className="drawer-section"><div className="drawer-section-head"><h3><T text="Explicit connected records" /></h3><span>{related.length}</span></div><div className="related-grid">{related.length ? related.map((item) => <article key={item.id}><span className={`record-avatar ${item.objectType}`}>{initials(item.name)}</span><div><strong>{item.name}</strong><small><T text={moduleByType[item.objectType].singular} /> · {text(titleCase(item.archivedAt ? 'archived' : item.status))}</small></div></article>) : <p className="muted"><T text="No explicit record links yet." /></p>}</div></section>
      {record.objectType === 'invoice' && <section className="drawer-section"><div className="drawer-section-head"><h3><T text="Payment ledger" /></h3><span>{payments.length}</span></div><div className="note-list">{payments.length ? payments.map((payment) => <article key={payment.id}><i /><div><strong>{formatMoney(payment.amountCents, record.currency, locale)}</strong><p><T text="Immutable payment receipt " />{payment.id.slice(0, 8)}</p><small>{shortDate(payment.recordedAt, locale)}</small></div></article>) : <p className="muted"><T text="No payments recorded." /></p>}</div></section>}
      <section className="drawer-section"><div className="drawer-section-head"><h3><T text="Notes" /></h3><span>{notes.length}</span></div>{!record.archivedAt && <form className="note-form" onSubmit={submitNote}><label><span className="sr-only"><T text="Add a note to " />{record.name}</span><LocalizedAttributes names={["placeholder"]}><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a useful note…" maxLength={2000} /></LocalizedAttributes></label><button className="primary-button" disabled={busy || !note.trim()}><T text="Add note" /></button></form>}<div className="note-list">{notes.map((item) => <article key={item.id}><i /><div><strong>{text(titleCase(item.kind))}</strong><p>{item.body}</p><small>{shortDate(item.occurredAt, locale)} · {text(titleCase(item.source))}</small></div></article>)}</div></section>
    </aside>
  </div>;
}

function RecordEditor({ state, currency, close, save, busy }: { state: NonNullable<EditorState>; currency: string; close: () => void; save: (payload: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const { text } = useI18n();
  const dialogRef = useDialogFocus<HTMLDivElement>(close);
  const record = state.record;
  const moduleDefinition = moduleByType[state.type];
  const statuses = editableStatuses(state.type, record?.status);
  const [name, setName] = useState(record?.name ?? '');
  const [status, setStatus] = useState(record?.status ?? moduleDefinition.statuses[0]);
  const [email, setEmail] = useState(record?.email ?? '');
  const [phone, setPhone] = useState(record?.phone ?? '');
  const [companyName, setCompanyName] = useState(record?.companyName ?? '');
  const [amount, setAmount] = useState(record?.amountCents ? String(record.amountCents / 100) : '');
  const [probability, setProbability] = useState(String(record?.probability ?? (state.type === 'opportunity' ? 20 : 0)));
  const [source, setSource] = useState(record?.source ?? '');
  const [priority, setPriority] = useState(record?.priority ?? (['task', 'ticket'].includes(state.type) ? 'medium' : ''));
  const [dueAt, setDueAt] = useState(record?.dueAt ? record.dueAt.slice(0, 16) : '');
  const [tags, setTags] = useState(record?.tags.join(', ') ?? '');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save({ objectType: state.type, name, status, lifecycle: record?.lifecycle ?? (state.type === 'lead' ? 'lead' : 'active'), email: email || null, phone: phone || null, companyName: companyName || null, amountCents: Math.max(0, Math.round(Number(amount || 0) * 100)), currency: record?.currency ?? currency, probability: Number(probability || 0), source: source || null, priority: priority || null, dueAt: dueAt ? new Date(dueAt).toISOString() : null, fields: record?.fields ?? {}, tags });
  };
  const moneyType = ['opportunity', 'product', 'quote', 'invoice'].includes(state.type);
  return <div className="overlay modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div ref={dialogRef} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-labelledby="editor-title"><header><div><p className="eyebrow">{record ? <T text="EDIT" /> : <T text="CREATE" />} · {text(moduleDefinition.group)}</p><h2 id="editor-title">{record ? record.name : text("New {value0}", { value0: text(moduleDefinition.singular) })}</h2></div><LocalizedAttributes names={["aria-label"]}><button className="close-button" aria-label="Close editor" onClick={close}>×</button></LocalizedAttributes></header><form className="editor-form" onSubmit={submit}><label className="full"><T text="Name" /><input data-dialog-initial value={name} onChange={(event) => setName(event.target.value)} maxLength={240} required placeholder={text("{value0} name", { value0: text(moduleDefinition.singular) })} /></label><label><T text="Status" /><select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item} value={item}>{text(titleCase(item))}</option>)}</select></label><label><T text="Company / context" /><input value={companyName} onChange={(event) => setCompanyName(event.target.value)} maxLength={240} /></label>{['lead', 'contact'].includes(state.type) && <><label><T text="Email" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} /></label><label><T text="Phone" /><input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={80} /></label></>}{moneyType && <><label>{text('Amount ({currency})', { currency })}<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>{state.type === 'opportunity' && <label><T text="Probability" /><input type="number" min="0" max="100" value={probability} onChange={(event) => setProbability(event.target.value)} /></label>}</>}{['task', 'activity', 'opportunity', 'quote', 'invoice', 'campaign', 'ticket'].includes(state.type) && <label><T text="Due / target date (device time)" /><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>}{['task', 'ticket'].includes(state.type) && <label><T text="Priority" /><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="low"><T text="Low" /></option><option value="medium"><T text="Medium" /></option><option value="high"><T text="High" /></option></select></label>}<label><T text="Source" /><LocalizedAttributes names={["placeholder"]}><input value={source} onChange={(event) => setSource(event.target.value)} maxLength={120} placeholder="Referral, event, website…" /></LocalizedAttributes></label><label className="full"><T text="Tags" /><LocalizedAttributes names={["placeholder"]}><input value={tags} onChange={(event) => setTags(event.target.value)} maxLength={500} placeholder="Important, SF, Founder" /></LocalizedAttributes></label><footer><button type="button" className="secondary-button" onClick={close}><T text="Cancel" /></button><button className="primary-button" disabled={busy}>{busy ? <T text="Saving…" /> : text("Save {value0}", { value0: text(moduleDefinition.singular) })}</button></footer></form></div></div>;
}

function EmptyState({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  const { text } = useI18n();
  return <div className="empty-state"><span>＋</span><h3>{text(title)}</h3><p>{text(body)}</p>{action && onAction && <button className="secondary-button" onClick={onAction}>{text(action)}</button>}</div>;
}
