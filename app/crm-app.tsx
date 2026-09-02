'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext production prefetch is intentionally avoided for reliable navigation. */

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { completeResetRequest, legacyWorkspaceRecords, loadCloudSnapshot, prepareResetRequest, readPendingResetRequest, sendCommand } from '@/lib/cloud-client';
import { deleteDocumentFile, uploadDocumentFile } from '@/lib/file-client';
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

type AppView = 'dashboard' | RecordType | 'reports' | 'workflows' | 'integrations' | 'agents' | 'admin';
type EditorState = { type: RecordType; record?: CRMRecord } | null;
type Toast = { id: number; message: string; tone?: 'success' | 'error' };

const viewTitles: Record<'dashboard' | 'reports' | 'workflows' | 'integrations' | 'agents' | 'admin', { title: string; subtitle: string }> = {
  dashboard: { title: 'Good work starts here', subtitle: 'Your relationships, revenue, and promises in one place.' },
  reports: { title: 'Reports & analytics', subtitle: 'Live answers from the same records that power your day.' },
  workflows: { title: 'Workflows', subtitle: 'Small, dependable automations with recent run history.' },
  integrations: { title: 'Apps & integrations', subtitle: 'Connect deliberately. Nothing is shown as connected until it really is.' },
  agents: { title: 'Humans + agents', subtitle: 'Constrained assistance with approvals, budgets, receipts, and an emergency stop.' },
  admin: { title: 'Settings & system', subtitle: 'Workspace controls, audit history, exports, and platform health.' },
};

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

function shortDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

function relativeDate(value: string | null) {
  if (!value) return 'Never';
  const days = Math.round((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (Math.abs(days) < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 0) return `In ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  return `${days} days ago`;
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
  return <span className={`status-chip status-${status.replaceAll('_', '-')}`}>{titleCase(status)}</span>;
}

function MetricCard({ label, value, note, onClick }: { label: string; value: string; note: string; onClick?: () => void }) {
  const content = <><span>{label}</span><strong>{value}</strong><small>{note}</small></>;
  return onClick ? <button className="metric-card" onClick={onClick}>{content}</button> : <article className="metric-card">{content}</article>;
}

function LoadingScreen() {
  return <main className="state-screen"><div className="brand-mark large">F</div><h1>Opening FREE CRM</h1><p>Loading your private workspace and live reports…</p><div className="loading-bar"><i /></div></main>;
}

export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const needsGithubSignIn = message.includes('Sign in with GitHub');
  const normalizedMessage = message.toLowerCase();
  const needsDeploymentSetup = normalizedMessage.includes('sealed until an identity provider is configured') || normalizedMessage.includes('authentication is not configured');

  if (needsDeploymentSetup) {
    return <main className="state-screen"><div className="brand-mark large">F</div><h1>Finish workspace setup</h1><p>This hosted workspace still needs its owner login and data services. Follow the deployment guide to connect credentials you control; no keys are bundled with FREE CRM.</p><div className="state-actions"><a className="primary-button" href="/deploy">Complete deployment setup</a><a className="secondary-button" href="/">Back to home</a></div></main>;
  }

  return <main className="state-screen"><div className="brand-mark large">!</div><h1>{needsGithubSignIn ? 'Sign in to FREE CRM' : 'Workspace unavailable'}</h1><p>{message}</p>{needsGithubSignIn ? <a className="primary-button" href="/api/auth/signin?callbackUrl=/workspace">Continue with GitHub</a> : <button className="primary-button" onClick={onRetry}>Try again</button>}</main>;
}

const moduleCapability = (type: RecordType) => type === 'ticket' ? 'service' : ['lead', 'contact', 'company', 'activity', 'task', 'document'].includes(type) ? 'relationships' : 'sales';

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

  const refresh = useCallback(async (resetOperationId?: string) => {
    try {
      setError(null);
      const data = await loadCloudSnapshot({ resetOperationId });
      consumeCompletedReset(data);
      setSnapshot(data);
      setSelected((current) => current ? data.records.find((record) => record.id === current.id) ?? null : null);
      return data;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load the workspace.');
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadCloudSnapshot().then((data) => {
      if (!cancelled) {
        const recoveredReset = consumeCompletedReset(data);
        setSnapshot(data);
        if (recoveredReset) notify('Workspace reset completion was recovered from its durable receipt.');
      }
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load the workspace.');
    });
    loadWorkspace().then((workspace) => setLegacyCount(workspace?.people?.length ?? 0)).catch(() => undefined);
    return () => { cancelled = true; };
  }, [notify]);

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
        notify('Workspace reset completed; its durable receipt recovered the interrupted response.');
        return true;
      }
      notify(reason instanceof Error ? reason.message : 'That change could not be saved.', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }, [notify, refresh]);

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
  const heading = currentModule
    ? { title: currentModule.label, subtitle: `Manage ${currentModule.label.toLowerCase()}, statuses, and the context stored in this workspace.` }
    : viewTitles[view as keyof typeof viewTitles];

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside ref={sidebarRef} id="crm-navigation" className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="CRM navigation" tabIndex={-1}>
        <button className="sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}>×</button>
        <a className="brand" href="/"><span className="brand-mark">F</span><span>FREE CRM</span></a>
        <button className={`nav-item ${view === 'dashboard' ? 'active' : ''}`} aria-current={view === 'dashboard' ? 'page' : undefined} onClick={() => go('dashboard')}><span>⌂</span>Home</button>
        {(['Relationships', 'Sales', 'Work', 'Growth', 'Service'] as const).map((group) => (
          <div className="nav-group" key={group}>
            <p>{group}</p>
            {moduleCatalog.filter((module) => module.group === group && snapshot.capabilities[moduleCapability(module.key)].enabled && snapshot.modules.find((item) => item.moduleKey === module.key)?.enabled !== false).map((module) => {
              const count = snapshot.records.filter((record) => record.objectType === module.key && !record.archivedAt).length;
              return <button key={module.key} className={`nav-item ${view === module.key ? 'active' : ''}`} aria-current={view === module.key ? 'page' : undefined} onClick={() => go(module.key)}><span>{module.glyph}</span>{module.label}<b>{count}</b></button>;
            })}
          </div>
        ))}
        <div className="nav-group nav-tools">
          <p>Operate</p>
          <button className={`nav-item ${view === 'reports' ? 'active' : ''}`} aria-current={view === 'reports' ? 'page' : undefined} onClick={() => go('reports')}><span>⌁</span>Reports</button>
          <button className={`nav-item ${view === 'workflows' ? 'active' : ''}`} aria-current={view === 'workflows' ? 'page' : undefined} onClick={() => go('workflows')}><span>↯</span>Workflows</button>
          {snapshot.capabilities.integrations.enabled && <button className={`nav-item ${view === 'integrations' ? 'active' : ''}`} aria-current={view === 'integrations' ? 'page' : undefined} onClick={() => go('integrations')}><span>⌘</span>Integrations</button>}
          {snapshot.capabilities.agentPlane.enabled && <button className={`nav-item ${view === 'agents' ? 'active' : ''}`} aria-current={view === 'agents' ? 'page' : undefined} onClick={() => go('agents')}><span>◈</span>Agents</button>}
          <button className={`nav-item ${view === 'admin' ? 'active' : ''}`} aria-current={view === 'admin' ? 'page' : undefined} onClick={() => go('admin')}><span>⚙</span>Settings</button>
          <a className="nav-item" href="/how-it-works"><span>?</span>How it works</a>
        </div>
        <div className="sidebar-health"><i /><div><strong>{snapshot.runtime.label}</strong><small>{snapshot.runtime.detail}</small></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button ref={mobileMenuRef} className="mobile-menu" aria-label="Open navigation" aria-expanded={sidebarOpen} aria-controls="crm-navigation" onClick={() => setSidebarOpen((open) => !open)}>☰</button>
          <div className="search-box">
            <span>⌕</span>
            <input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search active records…" aria-label="Search active CRM records" />
            <kbd>⌘ K</kbd>
            {query.trim().length >= 2 && <div className="search-results">
              {searchResults.length ? searchResults.map((record) => <button key={record.id} onClick={() => { setSelected(record); setQuery(''); }}><span className="mini-avatar">{initials(record.name)}</span><span><strong>{record.name}</strong><small>{moduleByType[record.objectType].singular} · {record.companyName || titleCase(record.status)}</small></span></button>) : <p>No matching records</p>}
            </div>}
          </div>
          <div className="top-actions"><span className="sync-pill"><i />Workspace loaded · {relativeDate(snapshot.generatedAt)}</span><span className="avatar-button" title={snapshot.workspace.ownerEmail} aria-label={snapshot.runtime.mode === 'device' ? `Local workspace owner: ${snapshot.workspace.ownerName}` : `Signed in as ${snapshot.workspace.ownerName}`}>{initials(snapshot.workspace.ownerName)}</span></div>
        </header>

        <main className="content">
          {snapshot.demo && <div className="demo-banner"><span><b>Demo workspace</b> — a complete lead-to-cash story is loaded so every module is useful.</span><button onClick={() => go('admin')}>Start clean</button></div>}
          {snapshot.resetState && <div className="legacy-banner"><span><b>Workspace reset {snapshot.resetState.status}.</b> Resume the {snapshot.resetState.mode} reset from Settings before making other changes.</span><button onClick={() => go('admin')}>Open reset controls</button></div>}
          {snapshot.workspace.settings.onboardingComplete !== true && <Onboarding mutate={mutate} busy={busy} />}
          {legacyCount > 0 && <div className="legacy-banner"><span><b>Your earlier on-device CRM is safe.</b> Import {legacyCount} contact{legacyCount === 1 ? '' : 's'} into this workspace.</span><button disabled={busy} onClick={async () => {
            const legacy = await loadWorkspace();
            if (!legacy) return;
            const ok = await mutate('legacy.import', { records: legacyWorkspaceRecords(legacy) }, `Imported ${legacyCount} contacts and related work.`);
            if (ok) setLegacyCount(0);
          }}>Import now</button></div>}

          <div className="page-head">
            <div><p className="eyebrow">{currentModule?.group ?? 'FREE CRM OPERATING SYSTEM'}</p><h1>{heading.title}</h1><p>{heading.subtitle}</p></div>
            {currentModule && <button className="primary-button" onClick={() => setEditor({ type: currentModule.key })}><span>＋</span>New {currentModule.singular.toLowerCase()}</button>}
          </div>

          {view === 'dashboard' && <Dashboard snapshot={snapshot} go={go} open={setSelected} create={(type) => setEditor({ type })} />}
          {currentModule && <RecordsView type={currentModule.key} snapshot={snapshot} open={setSelected} edit={(record) => setEditor({ type: record.objectType, record })} create={() => setEditor({ type: currentModule.key })} mutate={mutate} busy={busy} refresh={refresh} notify={notify} />}
          {view === 'reports' && <Reports snapshot={snapshot} go={go} />}
          {view === 'workflows' && <Workflows snapshot={snapshot} mutate={mutate} busy={busy} />}
          {view === 'integrations' && <Integrations snapshot={snapshot} refresh={refresh} notify={notify} />}
          {view === 'agents' && <Agents snapshot={snapshot} refresh={refresh} notify={notify} />}
          {view === 'admin' && <Admin snapshot={snapshot} mutate={mutate} refresh={refresh} busy={busy} />}
        </main>
      </section>

      {selected && <Customer360 record={selected} snapshot={snapshot} close={() => setSelected(null)} edit={() => { setSelected(null); setEditor({ type: selected.objectType, record: selected }); }} mutate={mutate} busy={busy} />}
      {editor && <RecordEditor state={editor} currency={snapshot.workspace.currency} close={() => setEditor(null)} save={async (payload) => {
        const editing = editor.record;
        const ok = await mutate(editing ? 'record.update' : 'record.create', editing ? { ...payload, id: editing.id, version: editing.version } : payload, `${moduleByType[editor.type].singular} saved.`);
        if (ok) setEditor(null);
      }} busy={busy} />}
      {toast && <div className={`toast ${toast.tone === 'error' ? 'error' : ''}`} role="status">{toast.tone === 'error' ? '!' : '✓'} {toast.message}</div>}
    </div>
  );
}

function Dashboard({ snapshot, go, open, create }: { snapshot: CRMSnapshot; go: (view: AppView) => void; open: (record: CRMRecord) => void; create: (type: RecordType) => void }) {
  const { analytics } = snapshot;
  const tasks = snapshot.records.filter((record) => record.objectType === 'task' && !record.archivedAt && record.status !== 'completed').sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt))).slice(0, 5);
  const activity = snapshot.records.filter((record) => ['activity', 'ticket', 'invoice'].includes(record.objectType) && !record.archivedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  const maxPipeline = Math.max(1, ...analytics.pipeline.map((item) => item.amountCents));
  return <>
    <section className="metrics-grid">
      <MetricCard label="Open pipeline" value={formatMoney(analytics.openPipelineCents, snapshot.workspace.currency)} note={`${formatMoney(analytics.weightedForecastCents, snapshot.workspace.currency)} weighted`} onClick={() => go('opportunity')} />
      <MetricCard label="Revenue won" value={formatMoney(analytics.wonRevenueCents, snapshot.workspace.currency)} note="Closed opportunities" onClick={() => go('reports')} />
      <MetricCard label="Outstanding" value={formatMoney(analytics.outstandingInvoiceCents, snapshot.workspace.currency)} note={`${formatMoney(analytics.overdueInvoiceCents, snapshot.workspace.currency)} overdue`} onClick={() => go('invoice')} />
      <MetricCard label="Needs attention" value={String(analytics.overdueTasks + analytics.openTickets)} note={`${analytics.overdueTasks} overdue · ${analytics.openTickets} tickets`} onClick={() => go('task')} />
    </section>
    <section className="dashboard-grid">
      <div className="panel task-panel">
        <div className="panel-head"><div><p className="eyebrow">TODAY</p><h2>Your commitments</h2></div><button onClick={() => create('task')}>＋ Add task</button></div>
        {tasks.length ? tasks.map((task) => <button className="task-row" key={task.id} onClick={() => open(task)}><i className={task.dueAt && new Date(task.dueAt) < new Date() ? 'overdue' : ''} /><span><strong>{task.name}</strong><small>{task.companyName || String(task.fields.personName ?? 'Independent')}</small></span><time>{relativeDate(task.dueAt)}</time><StatusChip status={task.priority || 'medium'} /></button>) : <EmptyState title="Nothing overdue" body="Your task list is clear." action="Add a task" onAction={() => create('task')} />}
      </div>
      <div className="panel pipeline-panel">
        <div className="panel-head"><div><p className="eyebrow">FORECAST</p><h2>Pipeline shape</h2></div><button onClick={() => go('opportunity')}>Open board →</button></div>
        <div className="bar-list">{analytics.pipeline.filter((item) => !['lost'].includes(item.label)).map((item) => <div key={item.label}><span>{titleCase(item.label)}</span><div><i style={{ width: `${Math.max(4, item.amountCents / maxPipeline * 100)}%` }} /></div><b>{formatMoney(item.amountCents, snapshot.workspace.currency)}</b></div>)}</div>
      </div>
      <div className="panel activity-panel">
        <div className="panel-head"><div><p className="eyebrow">CUSTOMER SIGNALS</p><h2>Recent activity</h2></div><button onClick={() => go('activity')}>View all →</button></div>
        <div className="timeline">{activity.map((record) => <button key={record.id} onClick={() => open(record)}><span className={`timeline-dot ${record.objectType}`} /><span><strong>{record.name}</strong><small>{moduleByType[record.objectType].singular} · {record.companyName || titleCase(record.status)}</small></span><time>{relativeDate(record.updatedAt)}</time></button>)}</div>
      </div>
      <aside className="panel focus-panel"><p className="eyebrow">SOLO FOCUS</p><h2>One calm system</h2><p>Active CRM records and reports live in one workspace. Explicit conversion links appear in Customer 360.</p><div className="focus-score"><strong>{analytics.taskCompletionRate}%</strong><span>task completion</span></div><div className="focus-score"><strong>{analytics.leadConversionRate}%</strong><span>lead conversion</span></div><button className="secondary-button" onClick={() => go('reports')}>Explore insights</button></aside>
    </section>
  </>;
}

function RecordsView({ type, snapshot, open, edit, create, mutate, busy, refresh, notify }: { type: RecordType; snapshot: CRMSnapshot; open: (record: CRMRecord) => void; edit: (record: CRMRecord) => void; create: () => void; mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; busy: boolean; refresh: () => Promise<CRMSnapshot | null>; notify: (message: string, tone?: Toast['tone']) => void }) {
  const moduleDefinition = moduleByType[type];
  const [status, setStatus] = useState('all');
  const [scope, setScope] = useState<'active' | 'archived'>('active');
  const [fileBusy, setFileBusy] = useState(false);
  const records = snapshot.records.filter((record) => record.objectType === type && (scope === 'archived' ? Boolean(record.archivedAt) : !record.archivedAt));
  const archivedCount = snapshot.records.filter((record) => record.objectType === type && record.archivedAt).length;
  const activeCount = snapshot.records.filter((record) => record.objectType === type && !record.archivedAt).length;
  const filtered = scope === 'archived' || status === 'all' ? records : records.filter((record) => record.status === status);

  if (type === 'opportunity' && scope === 'active') return <><section className="module-panel panel archive-toolbar"><div className="module-toolbar"><div className="filter-tabs"><button className="active" onClick={() => setScope('active')}>Active <b>{activeCount}</b></button><button onClick={() => setScope('archived')}>Archived <b>{archivedCount}</b></button></div></div></section><PipelineBoard records={records} currency={snapshot.workspace.currency} open={open} edit={edit} mutate={mutate} busy={busy} create={create} /></>;

  const uploadDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileBusy(true);
    try {
      await uploadDocumentFile(snapshot.workspace.id, file);
      await refresh();
      notify(`${file.name} uploaded securely.`);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Upload failed.', 'error');
    } finally {
      setFileBusy(false);
      event.target.value = '';
    }
  };

  const removeDocument = async (record: CRMRecord) => {
    if (!window.confirm(`Permanently delete ${record.name}? This also removes the stored file.`)) return;
    setFileBusy(true);
    try {
      await deleteDocumentFile(snapshot.workspace.id, record.id);
      await refresh();
      notify(`${record.name} permanently deleted.`);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Delete failed.', 'error');
    } finally {
      setFileBusy(false);
    }
  };

  return <section className="module-panel panel">
    <div className="module-toolbar">
      <div className="filter-tabs"><button className={scope === 'active' && status === 'all' ? 'active' : ''} onClick={() => { setScope('active'); setStatus('all'); }}>Active <b>{activeCount}</b></button><button className={scope === 'archived' ? 'active' : ''} onClick={() => setScope('archived')}>Archived <b>{archivedCount}</b></button>{scope === 'active' && moduleDefinition.statuses.map((item) => <button key={item} className={status === item ? 'active' : ''} onClick={() => setStatus(item)}>{titleCase(item)}</button>)}</div>
      {type === 'task' && <a className="secondary-button compact" href="/api/v1/calendar">Export calendar</a>}
      {type === 'document' && <label className="secondary-button compact upload-button">Upload file<input type="file" onChange={uploadDocument} disabled={busy || fileBusy} accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.json,.docx,.xlsx" /></label>}
    </div>
    {filtered.length ? <div className="record-table-wrap" role="region" aria-label={`${moduleDefinition.label} table. Scroll horizontally for more columns.`} tabIndex={0}><table className="record-table"><thead><tr><th>{moduleDefinition.singular}</th><th>Status</th><th>{['opportunity', 'quote', 'invoice', 'product'].includes(type) ? 'Value' : 'Company / context'}</th><th>{['task', 'activity', 'invoice'].includes(type) ? 'Date' : 'Updated'}</th><th>Health</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((record) => <RecordRow key={record.id} record={record} open={open} edit={edit} mutate={mutate} busy={busy || fileBusy} removeDocument={removeDocument} />)}</tbody></table></div> : <EmptyState title={scope === 'archived' ? `No archived ${moduleDefinition.label.toLowerCase()}` : `No ${status === 'all' ? moduleDefinition.label.toLowerCase() : titleCase(status).toLowerCase()} yet`} body={scope === 'archived' ? 'Archived records appear here and can be restored without losing their history.' : `Create your first ${moduleDefinition.singular.toLowerCase()} to put this module to work.`} action={scope === 'active' ? `New ${moduleDefinition.singular.toLowerCase()}` : undefined} onAction={scope === 'active' ? create : undefined} />}
  </section>;
}

function RecordRow({ record, open, edit, mutate, busy, removeDocument }: { record: CRMRecord; open: (record: CRMRecord) => void; edit: (record: CRMRecord) => void; mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; busy: boolean; removeDocument: (record: CRMRecord) => Promise<void> }) {
  const moneyType = ['opportunity', 'quote', 'invoice', 'product'].includes(record.objectType);
  const date = ['task', 'activity', 'invoice'].includes(record.objectType) ? record.dueAt || record.closedAt : record.updatedAt;
  const health = recordHealth(record);
  return <tr>
    <td><button className="record-name" onClick={() => open(record)}><span className={`record-avatar ${record.objectType}`}>{initials(record.name)}</span><span><strong>{record.name}</strong><small>{record.email || record.source || moduleByType[record.objectType].singular}</small></span></button></td>
    <td><StatusChip status={record.status} /></td>
    <td>{moneyType ? <strong>{formatMoney(record.amountCents, record.currency)}</strong> : record.companyName || String(record.fields.channel ?? record.fields.industry ?? '—')}</td>
    <td>{shortDate(date)}</td>
    <td><span className={`health health-${health}`}><i />{titleCase(health)}</span></td>
    <td><div className="row-actions">{record.archivedAt ? <button disabled={busy} onClick={() => void mutate('record.restore', { id: record.id, version: record.version }, `${record.name} restored.`)}>Restore</button> : <><button onClick={() => edit(record)}>Edit</button>{record.objectType === 'lead' && ['new', 'contacted', 'qualified'].includes(record.status) && <button disabled={busy} onClick={() => void mutate('lead.convert', { id: record.id, version: record.version, createOpportunity: true, amountCents: record.amountCents }, `${record.name} converted to a contact and opportunity.`)}>Convert</button>}{record.objectType === 'quote' && record.status === 'sent' && <button disabled={busy} onClick={() => void mutate('quote.accept', { id: record.id, version: record.version }, 'Quote accepted and invoice created.')}>Accept</button>}{record.objectType === 'invoice' && record.status === 'draft' && <button disabled={busy} onClick={() => void mutate('invoice.issue', { id: record.id, version: record.version }, 'Invoice issued with a durable number and due date.')}>Issue</button>}{record.objectType === 'invoice' && ['sent', 'partial', 'overdue'].includes(record.status) && <button disabled={busy} onClick={() => {
      const raw = window.prompt('Payment amount', String(Math.max(0, record.amountCents - Number(record.fields.paidCents ?? 0)) / 100));
      const paymentCents = Math.round(Number(raw) * 100);
      if (raw && Number.isSafeInteger(paymentCents) && paymentCents > 0) void mutate('invoice.record_payment', { id: record.id, version: record.version, paymentCents }, 'Payment recorded.');
    }}>Pay</button>}{record.objectType === 'ticket' && !['resolved', 'closed'].includes(record.status) && <button disabled={busy} onClick={() => {
      const resolution = window.prompt('Resolution summary');
      if (resolution) void mutate('ticket.resolve', { id: record.id, version: record.version, resolution }, 'Ticket resolved.');
    }}>Resolve</button>}{record.objectType === 'document' && typeof record.fields.objectKey === 'string' && <><a href={`/api/v1/files?id=${encodeURIComponent(record.id)}`}>Download</a><button disabled={busy} onClick={() => void removeDocument(record)}>Delete</button></>}</>}</div></td>
  </tr>;
}

function PipelineBoard({ records, currency, open, edit, mutate, busy, create }: { records: CRMRecord[]; currency: string; open: (record: CRMRecord) => void; edit: (record: CRMRecord) => void; mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; busy: boolean; create: () => void }) {
  const stages = moduleByType.opportunity.statuses;
  return <div className="pipeline-board" role="region" aria-label="Opportunity pipeline. Scroll horizontally to review every stage." tabIndex={0}>{stages.map((stage) => {
    const items = records.filter((record) => record.status === stage);
    const value = items.reduce((sum, record) => sum + record.amountCents, 0);
    return <section className="pipeline-column" key={stage}><header><span><i className={`stage-dot ${stage}`} />{titleCase(stage)}</span><b>{items.length}</b><small>{formatMoney(value, currency)}</small></header><div>{items.map((record) => <article className="deal-card" key={record.id}><button className="deal-main" onClick={() => open(record)}><strong>{record.name}</strong><span>{record.companyName || 'Independent'}</span><b>{formatMoney(record.amountCents, record.currency)}</b><small>{record.probability}% probability · {shortDate(record.dueAt)}</small></button><div><button onClick={() => edit(record)}>Edit</button>{!['won', 'lost'].includes(record.status) && <button disabled={busy} onClick={() => void mutate('record.update', { id: record.id, version: record.version, status: nextStatus('opportunity', record.status) }, `Moved ${record.name} to ${titleCase(nextStatus('opportunity', record.status))}.`)}>Advance →</button>}</div></article>)}</div>{stage === 'exploring' && <button className="add-card" onClick={create}>＋ New opportunity</button>}</section>;
  })}</div>;
}

function Reports({ snapshot, go }: { snapshot: CRMSnapshot; go: (view: AppView) => void }) {
  const analytics = snapshot.analytics;
  const maxRevenue = Math.max(1, ...analytics.revenueByMonth.map((item) => item.amountCents));
  const maxActivity = Math.max(1, ...analytics.activityByWeek.map((item) => item.count));
  return <>
    <section className="metrics-grid report-metrics"><MetricCard label="Weighted forecast" value={formatMoney(analytics.weightedForecastCents, snapshot.workspace.currency)} note="Probability-adjusted" onClick={() => go('opportunity')} /><MetricCard label="Lead conversion" value={`${analytics.leadConversionRate}%`} note="Leads converted" onClick={() => go('lead')} /><MetricCard label="Task completion" value={`${analytics.taskCompletionRate}%`} note={`${analytics.overdueTasks} overdue`} onClick={() => go('task')} /><MetricCard label="Open support" value={String(analytics.openTickets)} note="Customer tickets" onClick={() => go('ticket')} /></section>
    <section className="reports-grid">
      <div className="panel chart-card"><div className="panel-head"><div><p className="eyebrow">REVENUE</p><h2>Won by month</h2></div><strong>{formatMoney(analytics.wonRevenueCents, snapshot.workspace.currency)}</strong></div><div className="column-chart">{analytics.revenueByMonth.map((item) => <div key={item.label}><b>{item.amountCents ? formatMoney(item.amountCents, snapshot.workspace.currency) : ''}</b><i style={{ height: `${Math.max(5, item.amountCents / maxRevenue * 100)}%` }} /><span>{item.label}</span></div>)}</div></div>
      <div className="panel chart-card"><div className="panel-head"><div><p className="eyebrow">MOMENTUM</p><h2>Activity volume</h2></div><strong>{analytics.activityByWeek.reduce((sum, item) => sum + item.count, 0)}</strong></div><div className="column-chart activity-chart">{analytics.activityByWeek.map((item) => <div key={item.label}><b>{item.count}</b><i style={{ height: `${Math.max(5, item.count / maxActivity * 100)}%` }} /><span>{item.label}</span></div>)}</div></div>
      <div className="panel report-list"><div className="panel-head"><div><p className="eyebrow">ACQUISITION</p><h2>Lead sources</h2></div></div>{analytics.sources.map((source) => <button key={source.label} onClick={() => go('lead')}><span><strong>{source.label}</strong><small>{source.leads} leads</small></span><span>{source.converted} converted</span><b>{source.leads ? Math.round(source.converted / source.leads * 100) : 0}%</b></button>)}</div>
      <div className="panel report-list"><div className="panel-head"><div><p className="eyebrow">CASH FLOW</p><h2>Invoice aging</h2></div></div>{analytics.invoiceAging.map((bucket) => <button key={bucket.label} onClick={() => go('invoice')}><span><strong>{bucket.label}</strong><small>days overdue</small></span><b>{formatMoney(bucket.amountCents, snapshot.workspace.currency)}</b></button>)}</div>
    </section>
  </>;
}

function Workflows({ snapshot, mutate, busy }: { snapshot: CRMSnapshot; mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; busy: boolean }) {
  return <div className="settings-grid"><section className="panel settings-card wide"><div className="panel-head"><div><p className="eyebrow">AUTOMATION RULES</p><h2>Active logic</h2></div><span className="truth-badge">Audited</span></div>{snapshot.workflows.map((workflow) => <div className="workflow-row" key={workflow.id}><span className="workflow-icon">↯</span><span><strong>{workflow.name}</strong><small>When {titleCase(workflow.triggerType)} · {workflow.actions.length} action{workflow.actions.length === 1 ? '' : 's'}</small></span><span><small>Last run</small><strong>{relativeDate(workflow.lastRunAt)}</strong></span><label className="switch"><input type="checkbox" aria-label={`Enable ${workflow.name}`} checked={workflow.enabled} disabled={busy} onChange={(event) => void mutate('workflow.toggle', { id: workflow.id, enabled: event.target.checked }, `${workflow.name} ${event.target.checked ? 'enabled' : 'paused'}.`)} /><i /></label></div>)}</section><section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow">RUN HISTORY</p><h2>Recent executions</h2></div></div>{snapshot.workflowRuns.length ? snapshot.workflowRuns.map((run) => <div className="audit-row" key={run.id}><span className={run.status === 'succeeded' ? 'success-dot' : 'error-dot'} /><span><strong>{run.status === 'succeeded' ? 'Workflow completed' : run.error}</strong><small>{shortDate(run.startedAt)} · {String((run.output.createdRecordIds as unknown[])?.length ?? 0)} records created</small></span></div>) : <EmptyState title="No runs yet" body="Enabled workflows run when matching records change." />}</section></div>;
}

function Integrations({ snapshot, refresh, notify }: { snapshot: CRMSnapshot; refresh: () => Promise<CRMSnapshot | null>; notify: (message: string, tone?: Toast['tone']) => void }) {
  const [simulatorBusy, setSimulatorBusy] = useState(false);
  const operateSimulator = async (payload: Record<string, unknown>, message: string) => { setSimulatorBusy(true); try { await sendIdempotentOperation('/api/v1/connectors', payload); await refresh(); notify(message); } catch (error) { notify(error instanceof Error ? error.message : 'Connector operation failed.', 'error'); } finally { setSimulatorBusy(false); } };
  return <>
    <div className="integration-intro panel"><span className="integration-lock">⌘</span><div><strong>Working adapters are labeled clearly</strong><p>The local reference simulators, calendar export, and mail composer work now. External OAuth and outbound delivery adapters are not implemented; supplying credentials alone does not enable them.</p></div><a className="secondary-button compact" href="/api/v1/export">Export snapshot</a></div>
    <section className="integration-grid">
      {referenceConnectors.map((definition) => {
        const connection = snapshot.connectorConnections.find((item) => item.connectorKey === definition.key);
        const connected = connection?.status === 'connected';
        const webhookIngressUnavailable = snapshot.runtime.mode === 'authjs' && definition.key === 'webhook-simulator';
        return <article className="integration-card panel" key={definition.key}>
          <header><span className="integration-logo csv">{definition.key === 'csv' ? 'CSV' : '↗'}</span><StatusChip status={webhookIngressUnavailable ? 'unavailable' : connection?.health ?? 'disconnected'} /></header>
          <h2>{definition.name}</h2>
          <p>{definition.key === 'webhook-simulator' ? webhookIngressUnavailable ? 'Native Vercel machine ingress is disabled until a free, rate-limited service-auth boundary exists.' : 'Inbound delivery uses the workspace-specific key you create when connecting; only its SHA-256 hash is stored.' : 'Local, credential-free reference adapter.'} Scopes: {definition.scopes.join(', ')}.</p>
          {definition.key === 'webhook-simulator' && !webhookIngressUnavailable && <p><strong>Endpoint:</strong> <code>{`/api/v1/webhooks/${snapshot.workspace.id}`}</code></p>}
          <dl><div><dt>Cursor</dt><dd>{connection?.syncCursor ?? 'Not started'}</dd></div><div><dt>Auth</dt><dd>{webhookIngressUnavailable ? 'Unavailable on Vercel' : definition.key === 'webhook-simulator' ? 'Workspace key' : 'None'}</dd></div></dl>
          <div className="button-row">{webhookIngressUnavailable
            ? <><button className="secondary-button" disabled>Unavailable on Vercel</button>{connected && <button className="secondary-button" disabled={simulatorBusy} onClick={() => void operateSimulator({ operation: 'disconnect', connectionId: connection.id }, 'Simulator disconnected and credential metadata cleared.')}>Disconnect</button>}</>
            : !connected
            ? <button className="primary-button" disabled={simulatorBusy} onClick={() => {
              const payload: Record<string, unknown> = { operation: 'connect', connectorKey: definition.key };
              if (definition.key === 'webhook-simulator') {
                const suggested = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
                const webhookKey = window.prompt('Copy and store this workspace webhook key now. FREE CRM stores only its SHA-256 hash. Reconnecting rotates it.', suggested);
                if (!webhookKey) return;
                payload.webhookKey = webhookKey;
              }
              void operateSimulator(payload, `${definition.name} simulator connected.`);
            }}>Connect simulator</button>
            : <><button className="primary-button" disabled={simulatorBusy} onClick={() => void operateSimulator({ operation: 'sync', connectionId: connection.id }, 'Simulation completed; no external data was claimed.')}>Run simulation</button><button className="secondary-button" disabled={simulatorBusy} onClick={() => void operateSimulator({ operation: 'disconnect', connectionId: connection.id }, 'Simulator disconnected and credential metadata cleared.')}>Disconnect</button></>}
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
          <header><span className={`integration-logo ${integration.provider}`}>{integration.provider === 'google' ? 'G' : integration.provider === 'microsoft' ? 'M' : integration.provider === 'slack' ? '#' : '↗'}</span><StatusChip status={localHref ? 'available' : 'preview'} /></header>
          <h2>{integration.name}</h2>
          <p>{description}</p>
          <dl><div><dt>Mode</dt><dd>{integration.provider === 'calendar' ? 'One-way export' : integration.provider === 'email' ? 'System composer' : 'Not active'}</dd></div><div><dt>Adapter</dt><dd>{localHref ? 'Built in' : 'Not installed'}</dd></div></dl>
          {localHref && <a className="primary-button" href={localHref}>{integration.provider === 'calendar' ? 'Export calendar' : 'Compose email'}</a>}
          {!localHref && <button className="secondary-button" disabled>Not implemented in this release</button>}
          {integration.lastError && <small className="inline-error">{integration.lastError}</small>}
        </article>;
      })}
    </section>
  </>;
}

function Onboarding({ mutate, busy }: { mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; busy: boolean }) {
  const choose = (profile: WorkspaceProfile) => void mutate('workspace.update', { profile, settings: { onboardingComplete: true } }, 'Your workspace is ready. You can change this profile any time.');
  return <section className="panel onboarding-panel"><div><p className="eyebrow">SET UP YOUR WORKSPACE</p><h2>How will you use FREE CRM?</h2><p>Choose a calm starting point. Profiles only change defaults—your data always stays in the same workspace.</p></div><div className="onboarding-choices"><button disabled={busy} onClick={() => choose('personal')}>Personal / solo<small>Personal and solopreneur essentials</small></button><button disabled={busy} onClick={() => choose('business')}>Business profile<small>Single-owner sales and service defaults</small></button><button disabled={busy} onClick={() => choose('enterprise')}>Enterprise profile<small>Higher limits; policy authoring remains preview-only</small></button></div></section>;
}

async function agentOperation(payload: Record<string, unknown>) {
  if (payload.operation === 'agent.create') return sendIdempotentOperation('/api/v1/agents/actions', payload);
  if (payload.operation === 'action.propose') return sendIdempotentOperation('/api/v1/agents/actions', payload, { keyInBody: 'idempotencyKey' });
  const response = await fetch('/api/v1/agents/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({})) as { data?: Record<string, unknown>; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || 'Agent operation failed.');
  return body.data ?? {};
}

function Agents({ snapshot, refresh, notify }: { snapshot: CRMSnapshot; refresh: () => Promise<CRMSnapshot | null>; notify: (message: string, tone?: Toast['tone']) => void }) {
  const [busy, setBusy] = useState(false);
  const run = async (payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    try {
      const data = await agentOperation(payload);
      await refresh();
      const output = data.output && typeof data.output === 'object' ? data.output as { recordCounts?: Record<string, number> } : null;
      const count = output?.recordCounts ? Object.values(output.recordCounts).reduce((sum, value) => sum + Number(value || 0), 0) : null;
      notify(count === null ? success : `${success} Read ${count} active records.`);
    } catch (error) {
      await refresh().catch(() => undefined);
      notify(error instanceof Error ? error.message : 'Agent operation failed.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const create = () => { const name = window.prompt('Agent name'); if (name) void run({ operation: 'agent.create', name, autonomy: 'approval-required', monthlyBudgetCents: 2500 }, `${name} created paused by default.`); };
  const propose = (agent: CRMSnapshot['agents'][number]) => { const tool = agent.tools.find((item) => item.enabled); const summary = window.prompt('What should the local read simulator prepare?', 'Summarize workspace relationship health'); if (tool && summary) void run({ operation: 'action.propose', agentId: agent.id, toolId: tool.id, summary, requestedScope: tool.scopes[0] ?? 'records:read', estimatedCostCents: 0 }, 'Action proposed. Approval is required before execution.'); };
  return <div className="settings-grid"><section className="panel settings-card wide"><div className="panel-head"><div><p className="eyebrow">AGENT CONTROL PLANE</p><h2>Owned, budgeted, stoppable</h2></div><button className="primary-button" disabled={busy} onClick={create}>＋ New agent</button></div>{snapshot.agents.length ? snapshot.agents.map((agent) => <div className="workflow-row" key={agent.id}><span className="workflow-icon">◈</span><span><strong>{agent.name}</strong><small>{titleCase(agent.autonomy)} · {formatMoney(agent.spentCents, snapshot.workspace.currency)} of {formatMoney(agent.monthlyBudgetCents, snapshot.workspace.currency)} · {agent.tools.length} granted tool{agent.tools.length === 1 ? '' : 's'}</small></span><StatusChip status={agent.emergencyStoppedAt ? 'emergency_stopped' : agent.status} />{agent.status === 'active' && !agent.emergencyStoppedAt && <button disabled={busy || !agent.tools.some((tool) => tool.enabled)} onClick={() => propose(agent)}>Propose action</button>}<button disabled={busy || Boolean(agent.emergencyStoppedAt)} onClick={() => void run({ operation: 'agent.safety', agentId: agent.id, status: agent.status === 'active' ? 'paused' : 'active' }, agent.status === 'active' ? 'Agent paused.' : 'Agent activated.')}>{agent.status === 'active' ? 'Pause' : 'Activate'}</button><button className="danger-button" disabled={busy} onClick={() => void run({ operation: 'agent.safety', agentId: agent.id, emergencyStop: !agent.emergencyStoppedAt }, agent.emergencyStoppedAt ? 'Emergency stop cleared; agent remains paused.' : 'Emergency stop activated.')}>{agent.emergencyStoppedAt ? 'Clear stop' : 'Emergency stop'}</button></div>) : <EmptyState title="No agents yet" body="Create an approval-first agent. It starts paused with only a local read simulator." action="Create agent" onAction={create} />}</section><section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow">APPROVAL QUEUE</p><h2>Human decisions</h2></div></div>{snapshot.approvals.filter((approval) => approval.status === 'pending').map((approval) => <div className="audit-row" key={approval.id}><span className="warning-dot" /><span><strong>{approval.actionSummary}</strong><small>Expires {shortDate(approval.expiresAt)}</small></span><button disabled={busy} onClick={() => void run({ operation: 'approval.decide', approvalId: approval.id, decision: 'approved' }, 'Action approved.')}>Approve</button><button disabled={busy} onClick={() => void run({ operation: 'approval.decide', approvalId: approval.id, decision: 'rejected' }, 'Action rejected.')}>Reject</button></div>)}</section><section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow">RUNS & RECEIPTS</p><h2>Auditable execution</h2></div><span>{snapshot.executionReceipts.length} receipts</span></div>{snapshot.agentRuns.slice(0, 12).map((runItem) => { const receipt = snapshot.executionReceipts.find((item) => item.runId === runItem.id); const outputCounts = receipt?.output ? Object.values(receipt.output.recordCounts).reduce((sum, value) => sum + value, 0) : null; return <div className="audit-row" key={runItem.id}><span className={runItem.status === 'succeeded' ? 'success-dot' : 'warning-dot'} /><span><strong>{receipt?.output?.summary || titleCase(runItem.status)}</strong><small>{runItem.id.slice(0, 8)} · {shortDate(runItem.createdAt)}{receipt ? ` · Receipt ${receipt.id.slice(0, 8)} · ${formatMoney(receipt.costCents, snapshot.workspace.currency)}` : ''}{outputCounts === null ? '' : ` · Read ${outputCounts} active records`}</small></span>{runItem.status === 'authorized' && <button disabled={busy} onClick={() => void run({ operation: 'run.execute', runId: runItem.id }, 'Local simulation executed with a receipt.')}>Execute simulator</button>}</div>; })}</section></div>;
}

function Admin({ snapshot, mutate, refresh, busy }: { snapshot: CRMSnapshot; mutate: (type: string, payload: Record<string, unknown>, message: string, idempotencyKey?: string) => Promise<boolean>; refresh: () => Promise<CRMSnapshot | null>; busy: boolean }) {
  const [workspaceName, setWorkspaceName] = useState(snapshot.workspace.name);
  const [currency, setCurrency] = useState(snapshot.workspace.currency);
  const [profile, setProfile] = useState<WorkspaceProfile>(snapshot.workspace.profile);
  const enabled = resolveCapabilities(snapshot.workspace.profile);
  const resetCanResume = Boolean(snapshot.resetState);
  const reset = async (mode: 'clean' | 'demo', operationId?: string) => {
    const label = operationId ? `resume the ${mode} reset` : mode === 'clean' ? 'start with a clean workspace' : 'restore the product demo';
    if (window.prompt(`Type RESET to ${label}`) !== 'RESET') return;
    try {
      const request = prepareResetRequest(snapshot.workspace.id, mode, operationId);
      const ok = await mutate('demo.reset', { confirm: 'RESET', mode, operationId: request.operationId }, mode === 'clean' ? 'Clean workspace created.' : 'Demo workspace restored.', request.idempotencyKey);
      if (ok) completeResetRequest(snapshot.workspace.id, request.operationId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'The reset could not be prepared.');
    }
  };
  return <div className="settings-grid">
    <section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow">WORKSPACE</p><h2>Profile & defaults</h2></div><StatusChip status={snapshot.workspace.role} /></div><form className="settings-form" onSubmit={(event) => { event.preventDefault(); void mutate('workspace.update', { name: workspaceName, currency, profile }, 'Workspace profile saved without moving your data.'); }}><label>Workspace name<input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} maxLength={120} required /></label><label>How do you work?<select value={profile} onChange={(event) => setProfile(event.target.value as WorkspaceProfile)}>{workspaceProfiles.map((item) => <option key={item} value={item}>{item === 'personal' ? 'Personal / solo' : item === 'business' ? 'Business profile (single owner)' : 'Enterprise profile preview (single owner)'}</option>)}</select></label><label className="profile-agent-option"><input type="checkbox" checked={enabled.agentPlane.enabled} readOnly /> Approval-first agent simulation is available in every profile</label><small>Changing profile only changes capability defaults. Records and relationships are never migrated or deleted. Multi-user memberships and external agent transports are not implemented yet.</small><small>Dates are currently entered and displayed in this browser’s local timezone. Workspace timezone conversion is not implemented yet.</small><label>Currency<input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} required /></label><button className="primary-button" disabled={busy}>Save settings</button></form></section>
    <section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow">CONTROL PLANE</p><h2>Runtime status</h2></div><span className="truth-badge"><i />Workspace loaded</span></div><div className="system-list"><div><span>Runtime</span><b>{snapshot.runtime.label}</b></div><div><span>Data bindings</span><b>{snapshot.runtime.detail}</b></div><div><span>Identity boundary</span><b>{snapshot.runtime.mode === 'device' ? 'Loopback-local single user' : snapshot.runtime.mode === 'authjs' ? 'GitHub OAuth · exact owner' : 'Cloudflare Access JWT'}</b></div><div><span>Reference timezone</span><b>{snapshot.workspace.timezone}</b></div><div><span>Last refresh</span><b>{relativeDate(snapshot.generatedAt)}</b></div><button className="secondary-button" onClick={() => void refresh()}>Refresh workspace status</button>{snapshot.runtime.mode === 'authjs' && <a className="secondary-button" href="/api/auth/signout?callbackUrl=/">Sign out</a>}</div></section>
    <section className="panel settings-card wide"><div className="panel-head"><div><p className="eyebrow">CAPABILITY REGISTRY</p><h2>Modules, navigation, limits, and policy</h2><small>Current complete-workspace envelope: 1,000 total records, active and archived. Profile module limits can be lower.</small></div><span>Profile: {titleCase(snapshot.workspace.profile)}</span></div>{Object.values(snapshot.capabilities).map((capability) => <div className="workflow-row" key={capability.key}><span className="workflow-icon">◇</span><span><strong>{capability.label}</strong><small>{capability.key === 'advancedPolicies' ? 'Architecture preview · no authoring or evaluation UI in this release' : `${capability.limit === null ? 'No configured module limit' : `Module limit ${capability.limit.toLocaleString()}`} · ${capability.navigation ? 'Navigation module' : 'Policy capability'}`}</small></span>{capability.key === 'advancedPolicies' ? <StatusChip status="preview" /> : <label className="switch"><input type="checkbox" aria-label={`Enable ${capability.label}`} checked={capability.enabled} disabled={busy} onChange={(event) => void mutate('capability.update', { key: capability.key, enabled: event.target.checked }, `${capability.label} ${event.target.checked ? 'enabled' : 'disabled'} without deleting data.`)} /><i /></label>}</div>)}</section>
    <section className="panel settings-card wide"><div className="panel-head"><div><p className="eyebrow">AUDIT TRAIL</p><h2>Recent control and data events</h2></div><span>{snapshot.audit.length} retained here</span></div><div className="audit-list">{snapshot.audit.slice(0, 12).map((event) => <div className="audit-row" key={event.id}><span className="success-dot" /><span><strong>{titleCase(event.action)}</strong><small>{titleCase(event.entityType)}{event.entityId ? ` · ${event.entityId.slice(0, 8)}` : ''}</small></span><time>{relativeDate(event.createdAt)}</time></div>)}</div></section>
    <section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow">PORTABILITY</p><h2>Your data, always</h2></div></div><p>The portable snapshot contains CRM application data, but not document bytes or provider-level database backups. Keep your D1/R2 or local state backup as the recovery source of truth.</p><div className="button-stack"><a className="secondary-button" href="/api/v1/export">Download portable JSON snapshot</a><a className="secondary-button" href="/api/v1/export?format=csv">Export CRM records (CSV)</a><a className="secondary-button" href="/api/v1/calendar">Export calendar (.ics)</a><a className="secondary-button" href="/deploy">Deploy with your cloud credentials</a></div></section>
    <section className="panel settings-card danger-card"><div className="panel-head"><div><p className="eyebrow">DATA RESET</p><h2>Demo and clean modes</h2></div></div><p>Reset permanently removes CRM records, links, notes, workflow runs, connector jobs, queued events, and stored document bytes. The append-only security audit, durable reset receipts, minimal retry/delivery receipts, and required agent control-plane identities remain for accountability and replay safety. Interrupted operations use a durable lease and can be resumed safely.</p>{snapshot.resetState && <div className="reset-state"><strong>{snapshot.resetState.status === 'failed' ? 'Interrupted' : 'Running'} {snapshot.resetState.mode} reset</strong><small>Operation {snapshot.resetState.operationId.slice(0, 8)} · {relativeDate(snapshot.resetState.updatedAt)}{snapshot.resetState.lastErrorCode ? ` · ${titleCase(snapshot.resetState.lastErrorCode)}` : ''}{snapshot.resetState.status === 'running' && snapshot.resetState.leaseExpiresAt ? ` · lease ${relativeDate(snapshot.resetState.leaseExpiresAt)}` : ''}</small><button className="secondary-button" disabled={busy || !resetCanResume} onClick={() => void reset(snapshot.resetState!.mode, snapshot.resetState!.operationId)}>Check or resume reset</button></div>}<div className="danger-actions"><button disabled={busy || Boolean(snapshot.resetState)} onClick={() => void reset('clean')}>Start clean</button><button disabled={busy || Boolean(snapshot.resetState)} onClick={() => void reset('demo')}>Restore demo</button></div></section>
  </div>;
}

function Customer360({ record, snapshot, close, edit, mutate, busy }: { record: CRMRecord; snapshot: CRMSnapshot; close: () => void; edit: () => void; mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; busy: boolean }) {
  const dialogRef = useDialogFocus<HTMLElement>(close);
  const related = relatedRecords(record.id, snapshot.records, snapshot.links);
  const notes = snapshot.notes.filter((note) => note.recordId === record.id);
  const payments = snapshot.invoicePayments.filter((payment) => payment.invoiceId === record.id);
  const [note, setNote] = useState('');
  const submitNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    const ok = await mutate('note.create', { recordId: record.id, kind: 'note', body: note }, 'Note added to the customer timeline.');
    if (ok) setNote('');
  };
  const changeArchiveState = async () => {
    const restoring = Boolean(record.archivedAt);
    const ok = await mutate(restoring ? 'record.restore' : 'record.archive', { id: record.id, version: record.version }, `${record.name} ${restoring ? 'restored' : 'archived'}.`);
    if (ok) close();
  };
  return <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <aside ref={dialogRef} tabIndex={-1} className="drawer" role="dialog" aria-modal="true" aria-labelledby="customer-360-title">
      <header><span className={`record-avatar large ${record.objectType}`}>{initials(record.name)}</span><div><p className="eyebrow">CUSTOMER 360 · {moduleByType[record.objectType].singular.toUpperCase()}</p><h2 id="customer-360-title">{record.name}</h2><p>{record.companyName || record.email || titleCase(record.lifecycle)}</p></div><button data-dialog-initial className="close-button" aria-label="Close customer 360" onClick={close}>×</button></header>
      <div className="drawer-actions">{!record.archivedAt && <button className="primary-button" onClick={edit}>Edit record</button>}{!record.archivedAt && record.email && <a className="secondary-button" href={`mailto:${record.email}`}>Send email</a>}<button className="secondary-button" disabled={busy} onClick={() => void changeArchiveState()}>{record.archivedAt ? 'Restore record' : 'Archive'}</button></div>
      <section className="detail-grid"><div><span>Status</span><StatusChip status={record.archivedAt ? 'archived' : record.status} /></div><div><span>Health</span><b className={`health health-${recordHealth(record)}`}><i />{titleCase(recordHealth(record))}</b></div><div><span>Value</span><b>{record.amountCents ? formatMoney(record.amountCents, record.currency) : '—'}</b></div><div><span>Owner</span><b>You</b></div><div><span>Email</span><b>{record.email || '—'}</b></div><div><span>Next date</span><b>{shortDate(record.dueAt)}</b></div></section>
      <section className="drawer-section"><div className="drawer-section-head"><h3>Explicit connected records</h3><span>{related.length}</span></div><div className="related-grid">{related.length ? related.map((item) => <article key={item.id}><span className={`record-avatar ${item.objectType}`}>{initials(item.name)}</span><div><strong>{item.name}</strong><small>{moduleByType[item.objectType].singular} · {titleCase(item.archivedAt ? 'archived' : item.status)}</small></div></article>) : <p className="muted">No explicit record links yet.</p>}</div></section>
      {record.objectType === 'invoice' && <section className="drawer-section"><div className="drawer-section-head"><h3>Payment ledger</h3><span>{payments.length}</span></div><div className="note-list">{payments.length ? payments.map((payment) => <article key={payment.id}><i /><div><strong>{formatMoney(payment.amountCents, record.currency)}</strong><p>Immutable payment receipt {payment.id.slice(0, 8)}</p><small>{shortDate(payment.recordedAt)}</small></div></article>) : <p className="muted">No payments recorded.</p>}</div></section>}
      <section className="drawer-section"><div className="drawer-section-head"><h3>Notes</h3><span>{notes.length}</span></div>{!record.archivedAt && <form className="note-form" onSubmit={submitNote}><label><span className="sr-only">Add a note to {record.name}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a useful note…" maxLength={2000} /></label><button className="primary-button" disabled={busy || !note.trim()}>Add note</button></form>}<div className="note-list">{notes.map((item) => <article key={item.id}><i /><div><strong>{titleCase(item.kind)}</strong><p>{item.body}</p><small>{shortDate(item.occurredAt)} · {titleCase(item.source)}</small></div></article>)}</div></section>
    </aside>
  </div>;
}

function RecordEditor({ state, currency, close, save, busy }: { state: NonNullable<EditorState>; currency: string; close: () => void; save: (payload: Record<string, unknown>) => Promise<void>; busy: boolean }) {
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
  return <div className="overlay modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div ref={dialogRef} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-labelledby="editor-title"><header><div><p className="eyebrow">{record ? 'EDIT' : 'CREATE'} · {moduleDefinition.group.toUpperCase()}</p><h2 id="editor-title">{record ? record.name : `New ${moduleDefinition.singular.toLowerCase()}`}</h2></div><button className="close-button" aria-label="Close editor" onClick={close}>×</button></header><form className="editor-form" onSubmit={submit}><label className="full">Name<input data-dialog-initial value={name} onChange={(event) => setName(event.target.value)} maxLength={240} required placeholder={`${moduleDefinition.singular} name`} /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label><label>Company / context<input value={companyName} onChange={(event) => setCompanyName(event.target.value)} maxLength={240} /></label>{['lead', 'contact'].includes(state.type) && <><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} /></label><label>Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={80} /></label></>}{moneyType && <><label>Amount ({currency})<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>{state.type === 'opportunity' && <label>Probability<input type="number" min="0" max="100" value={probability} onChange={(event) => setProbability(event.target.value)} /></label>}</>}{['task', 'activity', 'opportunity', 'quote', 'invoice', 'campaign', 'ticket'].includes(state.type) && <label>Due / target date (device time)<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>}{['task', 'ticket'].includes(state.type) && <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>}<label>Source<input value={source} onChange={(event) => setSource(event.target.value)} maxLength={120} placeholder="Referral, event, website…" /></label><label className="full">Tags<input value={tags} onChange={(event) => setTags(event.target.value)} maxLength={500} placeholder="Important, SF, Founder" /></label><footer><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : `Save ${moduleDefinition.singular.toLowerCase()}`}</button></footer></form></div></div>;
}

function EmptyState({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span>＋</span><h3>{title}</h3><p>{body}</p>{action && onAction && <button className="secondary-button" onClick={onAction}>{action}</button>}</div>;
}
