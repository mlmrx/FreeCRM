'use client';

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { legacyWorkspaceRecords, loadCloudSnapshot, sendCommand } from '@/lib/cloud-client';
import {
  formatMoney,
  moduleByType,
  moduleCatalog,
  nextStatus,
  recordHealth,
  relatedRecords,
  type CRMRecord,
  type CRMSnapshot,
  type Integration,
  type RecordType,
} from '@/lib/crm-platform';
import { loadWorkspace } from '@/lib/storage';

type AppView = 'dashboard' | RecordType | 'reports' | 'workflows' | 'integrations' | 'admin';
type EditorState = { type: RecordType; record?: CRMRecord } | null;
type Toast = { id: number; message: string; tone?: 'success' | 'error' };

const viewTitles: Record<'dashboard' | 'reports' | 'workflows' | 'integrations' | 'admin', { title: string; subtitle: string }> = {
  dashboard: { title: 'Good work starts here', subtitle: 'Your relationships, revenue, and promises in one place.' },
  reports: { title: 'Reports & analytics', subtitle: 'Live answers from the same records that power your day.' },
  workflows: { title: 'Workflows', subtitle: 'Small, dependable automations with a complete run history.' },
  integrations: { title: 'Apps & integrations', subtitle: 'Connect deliberately. Nothing is shown as connected until it really is.' },
  admin: { title: 'Settings & system', subtitle: 'Workspace controls, audit history, exports, and platform health.' },
};

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <main className="state-screen"><div className="brand-mark large">!</div><h1>Workspace unavailable</h1><p>{message}</p><button className="primary-button" onClick={onRetry}>Try again</button></main>;
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

  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    setToast({ id: Date.now(), message, tone });
    window.setTimeout(() => setToast((current) => current?.message === message ? null : current), 3200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await loadCloudSnapshot();
      setSnapshot(data);
      setSelected((current) => current ? data.records.find((record) => record.id === current.id) ?? null : null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load the workspace.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadCloudSnapshot().then((data) => {
      if (!cancelled) setSnapshot(data);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load the workspace.');
    });
    loadWorkspace().then((workspace) => setLegacyCount(workspace?.people?.length ?? 0)).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const mutate = useCallback(async (type: string, payload: Record<string, unknown>, message: string) => {
    setBusy(true);
    try {
      await sendCommand(type, payload);
      await refresh();
      notify(message);
      return true;
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'That change could not be saved.', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }, [notify, refresh]);

  const go = useCallback((target: AppView) => {
    setView(target);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!snapshot || normalized.length < 2) return [];
    return snapshot.records.filter((record) => [record.name, record.email, record.companyName, record.status, ...record.tags].some((value) => String(value ?? '').toLowerCase().includes(normalized))).slice(0, 8);
  }, [query, snapshot]);

  if (!snapshot && !error) return <LoadingScreen />;
  if (!snapshot || error) return <ErrorScreen message={error ?? 'Unknown error'} onRetry={() => void refresh()} />;

  const currentModule = view in moduleByType ? moduleByType[view as RecordType] : null;
  const heading = currentModule
    ? { title: currentModule.label, subtitle: `Manage every ${currentModule.singular.toLowerCase()} from first touch to the full customer history.` }
    : viewTitles[view as keyof typeof viewTitles];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="CRM navigation">
        <div className="brand"><span className="brand-mark">F</span><span>FREE CRM</span></div>
        <button className={`nav-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => go('dashboard')}><span>⌂</span>Home</button>
        {(['Relationships', 'Sales', 'Work', 'Growth', 'Service'] as const).map((group) => (
          <div className="nav-group" key={group}>
            <p>{group}</p>
            {moduleCatalog.filter((module) => module.group === group && snapshot.modules.find((item) => item.moduleKey === module.key)?.enabled !== false).map((module) => {
              const count = snapshot.records.filter((record) => record.objectType === module.key && !record.archivedAt).length;
              return <button key={module.key} className={`nav-item ${view === module.key ? 'active' : ''}`} onClick={() => go(module.key)}><span>{module.glyph}</span>{module.label}<b>{count}</b></button>;
            })}
          </div>
        ))}
        <div className="nav-group nav-tools">
          <p>Operate</p>
          <button className={`nav-item ${view === 'reports' ? 'active' : ''}`} onClick={() => go('reports')}><span>⌁</span>Reports</button>
          <button className={`nav-item ${view === 'workflows' ? 'active' : ''}`} onClick={() => go('workflows')}><span>↯</span>Workflows</button>
          <button className={`nav-item ${view === 'integrations' ? 'active' : ''}`} onClick={() => go('integrations')}><span>⌘</span>Integrations</button>
          <button className={`nav-item ${view === 'admin' ? 'active' : ''}`} onClick={() => go('admin')}><span>⚙</span>Settings</button>
        </div>
        <div className="sidebar-health"><i /><div><strong>Cloud workspace</strong><small>D1 + R2 · protected</small></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen((open) => !open)}>☰</button>
          <div className="search-box">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search every customer, deal, invoice…" aria-label="Search CRM" />
            <kbd>⌘ K</kbd>
            {query.trim().length >= 2 && <div className="search-results">
              {searchResults.length ? searchResults.map((record) => <button key={record.id} onClick={() => { setSelected(record); setQuery(''); }}><span className="mini-avatar">{initials(record.name)}</span><span><strong>{record.name}</strong><small>{moduleByType[record.objectType].singular} · {record.companyName || titleCase(record.status)}</small></span></button>) : <p>No matching records</p>}
            </div>}
          </div>
          <div className="top-actions"><span className="sync-pill"><i />Synced</span><button className="avatar-button" title={snapshot.workspace.ownerEmail}>{initials(snapshot.workspace.ownerName)}</button></div>
        </header>

        <main className="content">
          {snapshot.demo && <div className="demo-banner"><span><b>Demo workspace</b> — a complete lead-to-cash story is loaded so every module is useful.</span><button onClick={() => go('admin')}>Start clean</button></div>}
          {legacyCount > 0 && <div className="legacy-banner"><span><b>Your earlier on-device CRM is safe.</b> Import {legacyCount} contact{legacyCount === 1 ? '' : 's'} into this cloud workspace.</span><button disabled={busy} onClick={async () => {
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
          {view === 'integrations' && <Integrations snapshot={snapshot} mutate={mutate} busy={busy} />}
          {view === 'admin' && <Admin snapshot={snapshot} mutate={mutate} refresh={refresh} busy={busy} />}
        </main>
      </section>

      {selected && <Customer360 record={selected} snapshot={snapshot} close={() => setSelected(null)} edit={() => setEditor({ type: selected.objectType, record: selected })} mutate={mutate} busy={busy} />}
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
      <MetricCard label="Open pipeline" value={formatMoney(analytics.openPipelineCents, snapshot.workspace.currency)} note={`${analytics.weightedForecastCents ? formatMoney(analytics.weightedForecastCents, snapshot.workspace.currency) : '$0'} weighted`} onClick={() => go('opportunity')} />
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
      <aside className="panel focus-panel"><p className="eyebrow">SOLO FOCUS</p><h2>One calm system</h2><p>Every customer, dollar, task, and support promise is linked. Open any record for Customer 360.</p><div className="focus-score"><strong>{analytics.taskCompletionRate}%</strong><span>task completion</span></div><div className="focus-score"><strong>{analytics.leadConversionRate}%</strong><span>lead conversion</span></div><button className="secondary-button" onClick={() => go('reports')}>Explore insights</button></aside>
    </section>
  </>;
}

function RecordsView({ type, snapshot, open, edit, create, mutate, busy, refresh, notify }: { type: RecordType; snapshot: CRMSnapshot; open: (record: CRMRecord) => void; edit: (record: CRMRecord) => void; create: () => void; mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; busy: boolean; refresh: () => Promise<void>; notify: (message: string, tone?: Toast['tone']) => void }) {
  const records = snapshot.records.filter((record) => record.objectType === type && !record.archivedAt);
  const moduleDefinition = moduleByType[type];
  const [status, setStatus] = useState('all');
  const filtered = status === 'all' ? records : records.filter((record) => record.status === status);

  if (type === 'opportunity') return <PipelineBoard records={records} currency={snapshot.workspace.currency} open={open} edit={edit} mutate={mutate} busy={busy} create={create} />;

  const uploadDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await fetch('/api/v1/files', { method: 'POST', body: form });
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || `Upload failed (${response.status})`);
      await refresh();
      notify(`${file.name} uploaded securely.`);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Upload failed.', 'error');
    } finally {
      event.target.value = '';
    }
  };

  const removeDocument = async (record: CRMRecord) => {
    if (!window.confirm(`Permanently delete ${record.name}? This also removes the stored file.`)) return;
    try {
      const response = await fetch(`/api/v1/files?id=${encodeURIComponent(record.id)}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || `Delete failed (${response.status})`);
      await refresh();
      notify(`${record.name} permanently deleted.`);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Delete failed.', 'error');
    }
  };

  return <section className="module-panel panel">
    <div className="module-toolbar">
      <div className="filter-tabs"><button className={status === 'all' ? 'active' : ''} onClick={() => setStatus('all')}>All <b>{records.length}</b></button>{moduleDefinition.statuses.map((item) => <button key={item} className={status === item ? 'active' : ''} onClick={() => setStatus(item)}>{titleCase(item)}</button>)}</div>
      {type === 'task' && <a className="secondary-button compact" href="/api/v1/calendar">Export calendar</a>}
      {type === 'document' && <label className="secondary-button compact upload-button">Upload file<input type="file" onChange={uploadDocument} disabled={busy} accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.json,.docx,.xlsx" /></label>}
    </div>
    {filtered.length ? <div className="record-table-wrap"><table className="record-table"><thead><tr><th>{moduleDefinition.singular}</th><th>Status</th><th>{['opportunity', 'quote', 'invoice', 'product'].includes(type) ? 'Value' : 'Company / context'}</th><th>{['task', 'activity', 'invoice'].includes(type) ? 'Date' : 'Updated'}</th><th>Health</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((record) => <RecordRow key={record.id} record={record} open={open} edit={edit} mutate={mutate} busy={busy} removeDocument={removeDocument} />)}</tbody></table></div> : <EmptyState title={`No ${status === 'all' ? moduleDefinition.label.toLowerCase() : titleCase(status).toLowerCase()} yet`} body={`Create your first ${moduleDefinition.singular.toLowerCase()} to put this module to work.`} action={`New ${moduleDefinition.singular.toLowerCase()}`} onAction={create} />}
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
    <td><div className="row-actions"><button onClick={() => edit(record)}>Edit</button>{record.objectType === 'lead' && record.status !== 'converted' && <button disabled={busy} onClick={() => void mutate('lead.convert', { id: record.id, version: record.version, createOpportunity: true, amountCents: record.amountCents }, `${record.name} converted to a contact and opportunity.`)}>Convert</button>}{record.objectType === 'quote' && record.status !== 'accepted' && <button disabled={busy} onClick={() => void mutate('quote.accept', { id: record.id, version: record.version }, 'Quote accepted and invoice created.')}>Accept</button>}{record.objectType === 'invoice' && record.status !== 'paid' && <button disabled={busy} onClick={() => {
      const raw = window.prompt('Payment amount', String(Math.max(0, record.amountCents - Number(record.fields.paidCents ?? 0)) / 100));
      if (raw) void mutate('invoice.record_payment', { id: record.id, version: record.version, paymentCents: Math.round(Number(raw) * 100) }, 'Payment recorded.');
    }}>Pay</button>}{record.objectType === 'ticket' && !['resolved', 'closed'].includes(record.status) && <button disabled={busy} onClick={() => {
      const resolution = window.prompt('Resolution summary');
      if (resolution) void mutate('ticket.resolve', { id: record.id, version: record.version, resolution }, 'Ticket resolved.');
    }}>Resolve</button>}{record.objectType === 'document' && typeof record.fields.objectKey === 'string' && <><a href={`/api/v1/files?id=${encodeURIComponent(record.id)}`}>Download</a><button disabled={busy} onClick={() => void removeDocument(record)}>Delete</button></>}</div></td>
  </tr>;
}

function PipelineBoard({ records, currency, open, edit, mutate, busy, create }: { records: CRMRecord[]; currency: string; open: (record: CRMRecord) => void; edit: (record: CRMRecord) => void; mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; busy: boolean; create: () => void }) {
  const stages = moduleByType.opportunity.statuses;
  return <div className="pipeline-board">{stages.map((stage) => {
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
  return <div className="settings-grid"><section className="panel settings-card wide"><div className="panel-head"><div><p className="eyebrow">AUTOMATION RULES</p><h2>Active logic</h2></div><span className="truth-badge">Audited</span></div>{snapshot.workflows.map((workflow) => <div className="workflow-row" key={workflow.id}><span className="workflow-icon">↯</span><span><strong>{workflow.name}</strong><small>When {titleCase(workflow.triggerType)} · {workflow.actions.length} action{workflow.actions.length === 1 ? '' : 's'}</small></span><span><small>Last run</small><strong>{relativeDate(workflow.lastRunAt)}</strong></span><label className="switch"><input type="checkbox" checked={workflow.enabled} disabled={busy} onChange={(event) => void mutate('workflow.toggle', { id: workflow.id, enabled: event.target.checked }, `${workflow.name} ${event.target.checked ? 'enabled' : 'paused'}.`)} /><i /></label></div>)}</section><section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow">RUN HISTORY</p><h2>Recent executions</h2></div></div>{snapshot.workflowRuns.length ? snapshot.workflowRuns.map((run) => <div className="audit-row" key={run.id}><span className={run.status === 'succeeded' ? 'success-dot' : 'error-dot'} /><span><strong>{run.status === 'succeeded' ? 'Workflow completed' : run.error}</strong><small>{shortDate(run.startedAt)} · {String((run.output.createdRecordIds as unknown[])?.length ?? 0)} records created</small></span></div>) : <EmptyState title="No runs yet" body="Enabled workflows run when matching records change." />}</section></div>;
}

function Integrations({ snapshot, mutate, busy }: { snapshot: CRMSnapshot; mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; busy: boolean }) {
  const connect = (integration: Integration) => {
    if (!['webhook', 'zapier'].includes(integration.provider)) {
      window.alert(`${integration.name} needs an OAuth application registration. It is intentionally not shown as connected.`);
      return;
    }
    const webhookUrl = window.prompt(`HTTPS destination for ${integration.name}`, String(integration.config.webhookUrl ?? ''));
    if (webhookUrl) void mutate('integration.update', { id: integration.id, webhookUrl }, `${integration.name} configured.`);
  };
  return <><div className="integration-intro panel"><span className="integration-lock">⌘</span><div><strong>Truthful connections by design</strong><p>Built-in import/export works now. External providers stay disconnected until you configure their real OAuth app or webhook endpoint.</p></div><a className="secondary-button compact" href="/api/v1/export">Export backup</a></div><section className="integration-grid">{snapshot.integrations.map((integration) => <article className="integration-card panel" key={integration.id}><header><span className={`integration-logo ${integration.provider}`}>{integration.provider === 'google' ? 'G' : integration.provider === 'microsoft' ? 'M' : integration.provider === 'slack' ? '#' : integration.provider === 'csv' ? 'CSV' : '↗'}</span><StatusChip status={integration.status} /></header><h2>{integration.name}</h2><p>{String(integration.config.description ?? `${titleCase(integration.syncDirection)} sync adapter`)}</p><dl><div><dt>Direction</dt><dd>{titleCase(integration.syncDirection)}</dd></div><div><dt>Last sync</dt><dd>{relativeDate(integration.lastSyncAt)}</dd></div><div><dt>Auth</dt><dd>{titleCase(integration.authType)}</dd></div></dl><button className={integration.status === 'connected' ? 'secondary-button' : 'primary-button'} disabled={busy || integration.status === 'connected'} onClick={() => connect(integration)}>{integration.status === 'connected' ? 'Connected' : integration.status === 'configured' ? 'Update endpoint' : 'Configure'}</button>{integration.lastError && <small className="inline-error">{integration.lastError}</small>}</article>)}</section></>;
}

function Admin({ snapshot, mutate, refresh, busy }: { snapshot: CRMSnapshot; mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; refresh: () => Promise<void>; busy: boolean }) {
  const [workspaceName, setWorkspaceName] = useState(snapshot.workspace.name);
  const [timezone, setTimezone] = useState(snapshot.workspace.timezone);
  const [currency, setCurrency] = useState(snapshot.workspace.currency);
  return <div className="settings-grid">
    <section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow">WORKSPACE</p><h2>Business defaults</h2></div><StatusChip status={snapshot.workspace.role} /></div><form className="settings-form" onSubmit={(event) => { event.preventDefault(); void mutate('workspace.update', { name: workspaceName, timezone, currency }, 'Workspace settings saved.'); }}><label>Workspace name<input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} maxLength={120} required /></label><label>Timezone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} maxLength={80} required /></label><label>Currency<input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} required /></label><button className="primary-button" disabled={busy}>Save settings</button></form></section>
    <section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow">CONTROL PLANE</p><h2>System health</h2></div><span className="truth-badge"><i />Healthy</span></div><div className="system-list"><div><span>D1 relational store</span><b>Available</b></div><div><span>R2 document store</span><b>Available</b></div><div><span>Identity boundary</span><b>Authenticated</b></div><div><span>Data mode</span><b>{titleCase(String(snapshot.workspace.settings.dataMode ?? 'cloud'))}</b></div><div><span>Last snapshot</span><b>{relativeDate(snapshot.generatedAt)}</b></div><button className="secondary-button" onClick={() => void refresh()}>Run health refresh</button></div></section>
    <section className="panel settings-card wide"><div className="panel-head"><div><p className="eyebrow">AUDIT TRAIL</p><h2>Recent control and data events</h2></div><span>{snapshot.audit.length} retained here</span></div><div className="audit-list">{snapshot.audit.slice(0, 12).map((event) => <div className="audit-row" key={event.id}><span className="success-dot" /><span><strong>{titleCase(event.action)}</strong><small>{titleCase(event.entityType)}{event.entityId ? ` · ${event.entityId.slice(0, 8)}` : ''}</small></span><time>{relativeDate(event.createdAt)}</time></div>)}</div></section>
    <section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow">PORTABILITY</p><h2>Your data, always</h2></div></div><div className="button-stack"><a className="secondary-button" href="/api/v1/export">Download full JSON backup</a><a className="secondary-button" href="/api/v1/export?format=csv">Export workspace</a><a className="secondary-button" href="/api/v1/calendar">Export calendar (.ics)</a><a className="secondary-button" href="/deploy">Deploy with your cloud credentials</a></div></section>
    <section className="panel settings-card danger-card"><div className="panel-head"><div><p className="eyebrow">DATA RESET</p><h2>Demo and clean modes</h2></div></div><p>Reset replaces all CRM records, links, notes, workflow history, and audit events in this workspace. Download a backup first.</p><div className="danger-actions"><button disabled={busy} onClick={() => {
      if (window.prompt('Type RESET to start with a clean workspace') === 'RESET') void mutate('demo.reset', { confirm: 'RESET', mode: 'clean' }, 'Clean workspace created.');
    }}>Start clean</button><button disabled={busy} onClick={() => {
      if (window.prompt('Type RESET to restore the product demo') === 'RESET') void mutate('demo.reset', { confirm: 'RESET', mode: 'demo' }, 'Demo workspace restored.');
    }}>Restore demo</button></div></section>
  </div>;
}

function Customer360({ record, snapshot, close, edit, mutate, busy }: { record: CRMRecord; snapshot: CRMSnapshot; close: () => void; edit: () => void; mutate: (type: string, payload: Record<string, unknown>, message: string) => Promise<boolean>; busy: boolean }) {
  const related = relatedRecords(record.id, snapshot.records, snapshot.links);
  const notes = snapshot.notes.filter((note) => note.recordId === record.id);
  const [note, setNote] = useState('');
  const submitNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    const ok = await mutate('note.create', { recordId: record.id, kind: 'note', body: note }, 'Note added to the customer timeline.');
    if (ok) setNote('');
  };
  return <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="customer-360-title"><header><span className={`record-avatar large ${record.objectType}`}>{initials(record.name)}</span><div><p className="eyebrow">CUSTOMER 360 · {moduleByType[record.objectType].singular.toUpperCase()}</p><h2 id="customer-360-title">{record.name}</h2><p>{record.companyName || record.email || titleCase(record.lifecycle)}</p></div><button className="close-button" aria-label="Close customer 360" onClick={close}>×</button></header><div className="drawer-actions"><button className="primary-button" onClick={edit}>Edit record</button>{record.email && <a className="secondary-button" href={`mailto:${record.email}`}>Send email</a>}<button className="secondary-button" onClick={() => void mutate('record.archive', { id: record.id, version: record.version }, `${record.name} archived.`)}>Archive</button></div><section className="detail-grid"><div><span>Status</span><StatusChip status={record.status} /></div><div><span>Health</span><b className={`health health-${recordHealth(record)}`}><i />{titleCase(recordHealth(record))}</b></div><div><span>Value</span><b>{record.amountCents ? formatMoney(record.amountCents, record.currency) : '—'}</b></div><div><span>Owner</span><b>You</b></div><div><span>Email</span><b>{record.email || '—'}</b></div><div><span>Next date</span><b>{shortDate(record.dueAt)}</b></div></section><section className="drawer-section"><div className="drawer-section-head"><h3>Connected records</h3><span>{related.length}</span></div><div className="related-grid">{related.length ? related.map((item) => <article key={item.id}><span className={`record-avatar ${item.objectType}`}>{initials(item.name)}</span><div><strong>{item.name}</strong><small>{moduleByType[item.objectType].singular} · {titleCase(item.status)}</small></div></article>) : <p className="muted">No linked records yet.</p>}</div></section><section className="drawer-section"><div className="drawer-section-head"><h3>Timeline</h3><span>{notes.length}</span></div><form className="note-form" onSubmit={submitNote}><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a useful note…" maxLength={10000} /><button className="primary-button" disabled={busy || !note.trim()}>Add note</button></form><div className="note-list">{notes.map((item) => <article key={item.id}><i /><div><strong>{titleCase(item.kind)}</strong><p>{item.body}</p><small>{shortDate(item.occurredAt)} · {titleCase(item.source)}</small></div></article>)}</div></section></aside></div>;
}

function RecordEditor({ state, currency, close, save, busy }: { state: NonNullable<EditorState>; currency: string; close: () => void; save: (payload: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const record = state.record;
  const moduleDefinition = moduleByType[state.type];
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
  return <div className="overlay modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="editor-title"><header><div><p className="eyebrow">{record ? 'EDIT' : 'CREATE'} · {moduleDefinition.group.toUpperCase()}</p><h2 id="editor-title">{record ? record.name : `New ${moduleDefinition.singular.toLowerCase()}`}</h2></div><button className="close-button" aria-label="Close editor" onClick={close}>×</button></header><form className="editor-form" onSubmit={submit}><label className="full">Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={240} required placeholder={`${moduleDefinition.singular} name`} /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{moduleDefinition.statuses.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label><label>Company / context<input value={companyName} onChange={(event) => setCompanyName(event.target.value)} maxLength={240} /></label>{['lead', 'contact'].includes(state.type) && <><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} /></label><label>Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={80} /></label></>}{moneyType && <><label>Amount ({currency})<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>{state.type === 'opportunity' && <label>Probability<input type="number" min="0" max="100" value={probability} onChange={(event) => setProbability(event.target.value)} /></label>}</>}{['task', 'activity', 'opportunity', 'quote', 'invoice', 'campaign', 'ticket'].includes(state.type) && <label>Due / target date<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>}{['task', 'ticket'].includes(state.type) && <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>}<label>Source<input value={source} onChange={(event) => setSource(event.target.value)} maxLength={120} placeholder="Referral, event, website…" /></label><label className="full">Tags<input value={tags} onChange={(event) => setTags(event.target.value)} maxLength={500} placeholder="Important, SF, Founder" /></label><footer><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : `Save ${moduleDefinition.singular.toLowerCase()}`}</button></footer></form></div></div>;
}

function EmptyState({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span>＋</span><h3>{title}</h3><p>{body}</p>{action && onAction && <button className="secondary-button" onClick={onAction}>{action}</button>}</div>;
}
