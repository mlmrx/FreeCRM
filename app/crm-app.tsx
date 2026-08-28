'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CRMWorkspace,
  type OpportunityStage,
  type Person,
  initials,
  makeSeedWorkspace,
  relationshipState,
  uid,
} from '@/lib/crm';
import { deleteWorkspace, loadWorkspace, saveWorkspace } from '@/lib/storage';

type View = 'today' | 'people' | 'companies' | 'opportunities' | 'followups' | 'import' | 'activity';
type AddMode = 'person' | 'followup' | 'note';
type Toast = { id: number; message: string };
type AskAnswer = { headline: string; body: string; personIds: string[]; evidence: string[] };

const nav: { view: View; label: string; glyph: string }[] = [
  { view: 'today', label: 'Today', glyph: '⌂' },
  { view: 'people', label: 'People', glyph: '◎' },
  { view: 'companies', label: 'Companies', glyph: '▦' },
  { view: 'opportunities', label: 'Opportunities', glyph: '◇' },
  { view: 'followups', label: 'Follow-ups', glyph: '✓' },
];

const stages: OpportunityStage[] = ['Exploring', 'Qualified', 'Proposal', 'Won'];
const suggestedQuestions = [
  'Who should I reconnect with this week?',
  'Who do I know in climate?',
  'What promises have I left open?',
];

function dateLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((target - start) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < -1) return `${Math.abs(diff)} days overdue`;
  if (diff < 7) return `In ${diff} days`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function relativeDate(value: string) {
  const days = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(value.trim()); value = ''; }
    else value += char;
  }
  values.push(value.trim());
  return values;
}

function personCompany(person: Person, workspace: CRMWorkspace) {
  return workspace.companies.find((company) => company.id === person.companyId);
}

export default function CRMApp() {
  const [workspace, setWorkspace] = useState<CRMWorkspace>(() => makeSeedWorkspace());
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('today');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<AddMode | null>(null);
  const [prefillPerson, setPrefillPerson] = useState<string>('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [ask, setAsk] = useState('');
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [installEvent, setInstallEvent] = useState<Event | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const notify = (message: string) => {
    const id = Date.now();
    setToasts((current) => [...current, { id, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3200);
  };

  useEffect(() => {
    let active = true;
    loadWorkspace()
      .then((saved) => {
        if (!active) return;
        if (saved?.version === 1) setWorkspace(saved);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setReady(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => saveWorkspace({ ...workspace, updatedAt: new Date().toISOString() }), 180);
    return () => window.clearTimeout(timer);
  }, [workspace, ready]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 20);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setAddMode(null);
        setSelectedPersonId(null);
      }
    };
    const onInstall = (event: Event) => { event.preventDefault(); setInstallEvent(event); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeinstallprompt', onInstall);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeinstallprompt', onInstall);
    };
  }, []);

  const pending = useMemo(() => workspace.followUps.filter((task) => !task.completed).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [workspace.followUps]);
  const drifting = useMemo(() => workspace.people.filter((person) => relationshipState(person) === 'drifting'), [workspace.people]);
  const selectedPerson = workspace.people.find((person) => person.id === selectedPersonId) ?? null;

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return workspace.people.slice(0, 5);
    return workspace.people.filter((person) => {
      const company = personCompany(person, workspace)?.name ?? '';
      return [person.name, person.role, company, person.email, person.notes, ...person.tags].join(' ').toLowerCase().includes(query);
    }).slice(0, 8);
  }, [search, workspace]);

  const openPerson = (id: string) => {
    setSelectedPersonId(id);
    setSearchOpen(false);
    setView('people');
  };

  const toggleTask = (id: string) => {
    const task = workspace.followUps.find((item) => item.id === id);
    setWorkspace((current) => ({
      ...current,
      followUps: current.followUps.map((item) => item.id === id ? { ...item, completed: !item.completed } : item),
      events: [{ id: uid('event'), label: task?.completed ? 'Follow-up reopened' : 'Follow-up completed', detail: task?.title ?? 'Task updated', occurredAt: new Date().toISOString(), kind: 'task' }, ...current.events],
    }));
    notify(task?.completed ? 'Follow-up reopened' : 'Nice — loop closed');
  };

  const moveOpportunity = (id: string) => {
    setWorkspace((current) => ({
      ...current,
      opportunities: current.opportunities.map((item) => {
        if (item.id !== id) return item;
        const next = stages[Math.min(stages.length - 1, stages.indexOf(item.stage) + 1)];
        return { ...item, stage: next };
      }),
      events: [{ id: uid('event'), label: 'Opportunity advanced', detail: current.opportunities.find((item) => item.id === id)?.name ?? 'Opportunity updated', occurredAt: new Date().toISOString(), kind: 'deal' }, ...current.events],
    }));
    notify('Opportunity moved forward');
  };

  const runAsk = (question = ask) => {
    const query = question.trim();
    if (!query) return;
    setAsk(query);
    setAsking(true);
    setAnswer(null);
    window.setTimeout(() => {
      const lower = query.toLowerCase();
      let matches: Person[] = [];
      if (/reconnect|drift|attention|haven.t talked/.test(lower)) {
        matches = [...workspace.people].filter((person) => relationshipState(person) !== 'strong').sort((a, b) => new Date(a.lastContact).getTime() - new Date(b.lastContact).getTime()).slice(0, 3);
      } else if (/open loop|promise|follow.?up|owe/.test(lower)) {
        matches = pending.map((task) => workspace.people.find((person) => person.id === task.personId)).filter(Boolean).slice(0, 4) as Person[];
      } else {
        const stop = new Set(['who', 'what', 'when', 'where', 'which', 'with', 'have', 'know', 'about', 'should', 'from', 'that', 'this']);
        const terms = lower.replace(/[^a-z0-9@.\s-]/g, '').split(/\s+/).filter((term) => term.length > 2 && !stop.has(term));
        matches = workspace.people.filter((person) => {
          const company = personCompany(person, workspace);
          const haystack = [person.name, person.role, person.email, person.location, person.notes, ...person.tags, company?.name ?? '', company?.industry ?? '', company?.description ?? ''].join(' ').toLowerCase();
          return terms.some((term) => haystack.includes(term));
        }).slice(0, 4);
      }
      if (!matches.length) matches = drifting.slice(0, 3);
      const names = matches.map((person) => person.name);
      const isLoop = /open loop|promise|follow.?up|owe/.test(lower);
      const body = isLoop
        ? `You have ${pending.length} open follow-ups. The most time-sensitive ones involve ${names.join(', ')}.`
        : `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} the strongest match in your private workspace. I ranked these using your notes, recency, tags, and company context.`;
      setAnswer({
        headline: matches.length ? `${matches.length} relevant relationship${matches.length === 1 ? '' : 's'}` : 'No exact match yet',
        body,
        personIds: matches.map((person) => person.id),
        evidence: matches.map((person) => `${person.name}: ${person.notes} — ${person.source}`),
      });
      setAsking(false);
    }, 520);
  };

  const submitAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (addMode === 'person') {
      const name = String(data.get('name') ?? '').trim();
      const email = String(data.get('email') ?? '').trim();
      const companyName = String(data.get('company') ?? '').trim() || 'Independent';
      if (!name || !email) return;
      let company = workspace.companies.find((item) => item.name.toLowerCase() === companyName.toLowerCase());
      const newCompany = company ?? { id: uid('company'), name: companyName, domain: email.split('@')[1] ?? '', industry: 'Not yet categorized', description: 'Added with a contact.' };
      company = newCompany;
      const person: Person = {
        id: uid('person'), name, email, companyId: company.id, role: String(data.get('role') ?? 'Contact'), location: String(data.get('location') ?? ''), tags: String(data.get('tags') ?? '').split(',').map((tag) => tag.trim()).filter(Boolean), strength: 70, lastContact: new Date().toISOString(), cadenceDays: 30, notes: String(data.get('notes') ?? ''), source: 'Added manually · today', color: 'sky',
      };
      setWorkspace((current) => ({ ...current, companies: current.companies.some((item) => item.id === company!.id) ? current.companies : [...current.companies, company!], people: [person, ...current.people], events: [{ id: uid('event'), label: 'New person added', detail: `${name} at ${companyName}`, occurredAt: new Date().toISOString(), kind: 'person' }, ...current.events] }));
      notify(`${name} is now in your network`);
    } else if (addMode === 'followup') {
      const title = String(data.get('title') ?? '').trim();
      if (!title) return;
      setWorkspace((current) => ({ ...current, followUps: [{ id: uid('task'), title, personId: String(data.get('personId') || '') || undefined, dueDate: new Date(String(data.get('dueDate') || new Date().toISOString())).toISOString(), completed: false, reason: String(data.get('reason') ?? 'Added by you') }, ...current.followUps], events: [{ id: uid('event'), label: 'Follow-up created', detail: title, occurredAt: new Date().toISOString(), kind: 'task' }, ...current.events] }));
      notify('Follow-up added');
    } else if (addMode === 'note') {
      const personId = String(data.get('personId') ?? '');
      const summary = String(data.get('summary') ?? '').trim();
      if (!personId || !summary) return;
      setWorkspace((current) => ({ ...current, interactions: [{ id: uid('interaction'), personId, type: 'Note', summary, occurredAt: new Date().toISOString(), source: 'Manual note' }, ...current.interactions], people: current.people.map((person) => person.id === personId ? { ...person, lastContact: new Date().toISOString(), strength: Math.min(100, person.strength + 3) } : person), events: [{ id: uid('event'), label: 'Context captured', detail: summary, occurredAt: new Date().toISOString(), kind: 'note' }, ...current.events] }));
      notify('Note saved and relationship refreshed');
    }
    setAddMode(null);
    setPrefillPerson('');
  };

  const exportData = () => {
    download(`free-crm-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(workspace, null, 2), 'application/json');
    notify('Full workspace backup exported');
  };

  const exportCsv = () => {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = workspace.people.map((person) => [person.name, person.email, person.role, personCompany(person, workspace)?.name ?? '', person.location, person.tags.join('; '), person.notes].map(escape).join(','));
    download('free-crm-people.csv', ['name,email,role,company,location,tags,notes', ...rows].join('\n'), 'text/csv');
    notify('People exported as CSV');
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.json')) {
        const incoming = JSON.parse(text) as CRMWorkspace;
        if (incoming.version !== 1 || !Array.isArray(incoming.people)) throw new Error('Invalid FREE CRM backup');
        setWorkspace(incoming);
        notify(`Restored ${incoming.people.length} people`);
      } else {
        const lines = text.split(/\r?\n/).filter(Boolean);
        const headers = parseCsvLine(lines.shift() ?? '').map((header) => header.toLowerCase());
        const records = lines.map((line) => Object.fromEntries(parseCsvLine(line).map((value, index) => [headers[index], value])));
        let added = 0;
        setWorkspace((current) => {
          const next = structuredClone(current);
          for (const record of records) {
            const name = record.name || [record.first_name, record.last_name].filter(Boolean).join(' ');
            const email = record.email || '';
            if (!name || next.people.some((person) => email && person.email.toLowerCase() === email.toLowerCase())) continue;
            const companyName = record.company || 'Independent';
            let company = next.companies.find((item) => item.name.toLowerCase() === companyName.toLowerCase());
            if (!company) {
              company = { id: uid('company'), name: companyName, domain: email.split('@')[1] ?? '', industry: 'Imported', description: 'Created during CSV import.' };
              next.companies.push(company);
            }
            next.people.push({ id: uid('person'), name, email, role: record.role || record.title || 'Contact', companyId: company.id, location: record.location || '', tags: (record.tags || '').split(/[;,]/).map((tag) => tag.trim()).filter(Boolean), strength: 65, lastContact: new Date().toISOString(), cadenceDays: 45, notes: record.notes || '', source: `CSV import · ${file.name}`, color: 'sky' });
            added += 1;
          }
          next.events.unshift({ id: uid('event'), label: 'CSV imported', detail: `${added} new people from ${file.name}`, occurredAt: new Date().toISOString(), kind: 'import' });
          return next;
        });
        notify(`${added} new people imported`);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'That file could not be imported');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const installApp = async () => {
    if (installEvent && 'prompt' in installEvent) {
      await (installEvent as Event & { prompt: () => Promise<void> }).prompt();
      setInstallEvent(null);
    } else {
      notify('Use your browser menu → Install FREE CRM');
    }
  };

  const openAdd = (mode: AddMode, personId = '') => { setAddMode(mode); setPrefillPerson(personId); };

  return (
    <main className="app-frame">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView('today')}><span className="brand-mark">F</span><span>FREE CRM</span><em>local</em></button>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <button className={`nav-item ${view === item.view ? 'active' : ''}`} key={item.view} onClick={() => setView(item.view)}>
              <span>{item.glyph}</span>{item.label}
              {item.view === 'people' && <b>{workspace.people.length}</b>}
              {item.view === 'followups' && <b>{pending.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-label">Workspace</div>
        <nav>
          <button className={`nav-item ${view === 'import' ? 'active' : ''}`} onClick={() => setView('import')}><span>↗</span>Import & backup</button>
          <button className={`nav-item ${view === 'activity' ? 'active' : ''}`} onClick={() => setView('activity')}><span>◌</span>Activity</button>
        </nav>
        <div className="sidebar-foot"><div className="privacy-dot"/><div><strong>Private by design</strong><small>{ready ? 'Saved on this device' : 'Opening your workspace…'}</small></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setView('today')}><span className="brand-mark">F</span>FREE CRM</button>
          <button className="search-trigger" onClick={() => { setSearchOpen(true); window.setTimeout(() => searchRef.current?.focus(), 20); }}><span>⌕</span><span>Search people, companies, notes…</span><kbd>⌘ K</kbd></button>
          <div className="top-actions"><button className="privacy-button" onClick={() => setView('import')}><i/>On-device</button><button className="icon-button" onClick={() => notify('FREE CRM is open source, local-first, and yours')}>?</button><span className="avatar">{initials(workspace.userName)}</span></div>
        </header>

        <div className={`content ${view !== 'today' ? 'content-page' : ''}`}>
          {view === 'today' && (
            <TodayView workspace={workspace} pending={pending} drifting={drifting} ask={ask} setAsk={setAsk} answer={answer} asking={asking} runAsk={runAsk} openPerson={openPerson} openAdd={openAdd} toggleTask={toggleTask} setView={setView}/>
          )}
          {view === 'people' && <PeopleView workspace={workspace} openPerson={openPerson} openAdd={openAdd}/>}
          {view === 'companies' && <CompaniesView workspace={workspace} openPerson={openPerson}/>}
          {view === 'opportunities' && <OpportunitiesView workspace={workspace} moveOpportunity={moveOpportunity}/>}
          {view === 'followups' && <FollowUpsView workspace={workspace} toggleTask={toggleTask} openPerson={openPerson} openAdd={openAdd}/>}
          {view === 'import' && <ImportView workspace={workspace} importRef={importRef} exportData={exportData} exportCsv={exportCsv} installApp={installApp} setConfirmClear={setConfirmClear}/>}
          {view === 'activity' && <ActivityView workspace={workspace}/>}
        </div>
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.slice(0, 4).map((item) => <button key={item.view} className={view === item.view ? 'active' : ''} onClick={() => setView(item.view)}><span>{item.glyph}</span>{item.label}</button>)}
      </nav>

      {searchOpen && <SearchPalette search={search} setSearch={setSearch} results={searchResults} workspace={workspace} openPerson={openPerson} close={() => setSearchOpen(false)} setView={setView}/>}
      {selectedPerson && <PersonDrawer person={selectedPerson} workspace={workspace} close={() => setSelectedPersonId(null)} openAdd={openAdd} notify={notify}/>}
      {addMode && <AddModal mode={addMode} setMode={setAddMode} workspace={workspace} prefillPerson={prefillPerson} close={() => { setAddMode(null); setPrefillPerson(''); }} submit={submitAdd}/>}
      {confirmClear && <ConfirmClear close={() => setConfirmClear(false)} confirm={async () => { await deleteWorkspace(); setWorkspace(makeSeedWorkspace()); setConfirmClear(false); notify('Local workspace reset to the demo'); }}/>}
      <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div className="toast" key={toast.id}><span>✓</span>{toast.message}</div>)}</div>
      <input ref={importRef} className="sr-only" type="file" accept=".json,.csv,text/csv,application/json" onChange={(event) => importFile(event.target.files?.[0])}/>
    </main>
  );
}

function TodayView({ workspace, pending, drifting, ask, setAsk, answer, asking, runAsk, openPerson, openAdd, toggleTask, setView }: { workspace: CRMWorkspace; pending: CRMWorkspace['followUps']; drifting: Person[]; ask: string; setAsk: (value: string) => void; answer: AskAnswer | null; asking: boolean; runAsk: (question?: string) => void; openPerson: (id: string) => void; openAdd: (mode: AddMode, personId?: string) => void; toggleTask: (id: string) => void; setView: (view: View) => void }) {
  const score = Math.round(workspace.people.reduce((sum, person) => sum + person.strength, 0) / Math.max(1, workspace.people.length));
  const dueToday = pending.filter((task) => dateLabel(task.dueDate) === 'Today' || dateLabel(task.dueDate).includes('overdue')).length;
  return <>
    <div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</div>
    <div className="hero-row"><div><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {workspace.userName}.</h1><p>Your network has {Math.min(3, pending.length)} things worth your attention.</p></div><button className="primary-button" onClick={() => openAdd('person')}><span>＋</span>Add anything</button></div>
    <section className={`ask-card ${answer || asking ? 'expanded' : ''}`}>
      <div className="ask-row"><div className="ask-icon">✦</div><label className="ask-copy"><strong>Ask your network anything</strong><input value={ask} onChange={(event) => setAsk(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') runAsk(); }} placeholder="Who should I reconnect with this week?"/></label><button aria-label="Ask" onClick={() => runAsk()}>↑</button></div>
      {!answer && !asking && <div className="prompt-chips">{suggestedQuestions.map((question) => <button key={question} onClick={() => runAsk(question)}>{question}</button>)}</div>}
      {asking && <div className="thinking"><i/><span>FREE CRM is tracing your notes, companies, and open loops…</span></div>}
      {answer && <div className="answer-card"><div className="answer-heading"><span>ANSWER</span><strong>{answer.headline}</strong></div><p>{answer.body}</p><div className="answer-people">{answer.personIds.map((id) => { const person = workspace.people.find((item) => item.id === id); return person ? <button key={id} onClick={() => openPerson(id)}><PersonAvatar person={person}/><span><b>{person.name}</b><small>{personCompany(person, workspace)?.name} · last contact {relativeDate(person.lastContact)}</small></span><em>View context →</em></button> : null; })}</div><details><summary>{answer.evidence.length} evidence notes</summary>{answer.evidence.map((item) => <p key={item}>{item}</p>)}</details></div>}
    </section>
    <div className="stats-grid"><article><span>People you know</span><strong>{workspace.people.length}</strong><small><i className="up">↑ Your private graph</i></small></article><article><span>Relationships drifting</span><strong>{drifting.length}</strong><small>Based on your own cadence</small></article><article><span>Open loops</span><strong>{pending.length}</strong><small><i className="warn">{dueToday} due now</i></small></article><article><span>Network pulse</span><strong>{score}<i>/100</i></strong><small><i className="up">Healthy</i> and yours</small></article></div>
    <div className="dashboard-grid"><section className="panel followups"><div className="panel-head"><div><span className="section-kicker">YOUR NEXT MOVES</span><h2>Thoughtful follow-ups</h2></div><button onClick={() => setView('followups')}>View all <span>→</span></button></div>{pending.slice(0, 4).map((task) => { const person = workspace.people.find((item) => item.id === task.personId); return <article className="person-row" key={task.id}>{person ? <button className="avatar-button" onClick={() => openPerson(person.id)}><PersonAvatar person={person}/></button> : <span className="person-avatar sand">✓</span>}<div className="person-main"><strong>{person?.name ?? 'Personal follow-up'}</strong><small>{person ? `${person.role} · ${personCompany(person, workspace)?.name}` : dateLabel(task.dueDate)}</small></div><div className="person-note"><span>{task.title}</span><small>{task.reason}</small></div><button className="quiet-button" onClick={() => toggleTask(task.id)}>Done</button></article>; })}</section><aside className="panel pulse-panel"><div className="panel-head"><div><span className="section-kicker">RELATIONSHIP PULSE</span><h2>Stay meaningfully close</h2></div></div><div className="ring-wrap"><div className="ring" style={{ '--score': `${score}%` } as React.CSSProperties}><span>{score}</span><small>strong</small></div><p>Most relationships are warm.<br/>{drifting.length} {drifting.length === 1 ? 'person is' : 'people are'} drifting.</p></div><div className="pulse-legend"><span><i className="dot strong"/>Strong <b>{workspace.people.filter((person) => relationshipState(person) === 'strong').length}</b></span><span><i className="dot warm"/>Warm <b>{workspace.people.filter((person) => relationshipState(person) === 'warm').length}</b></span><span><i className="dot drift"/>Drifting <b>{drifting.length}</b></span></div><button className="full-button" onClick={() => setView('people')}>See everyone <span>→</span></button></aside></div>
  </>;
}

function PageHead({ kicker, title, copy, action }: { kicker: string; title: string; copy: string; action?: React.ReactNode }) {
  return <div className="page-head"><div><span className="eyebrow">{kicker}</span><h1>{title}</h1><p>{copy}</p></div>{action}</div>;
}

function PeopleView({ workspace, openPerson, openAdd }: { workspace: CRMWorkspace; openPerson: (id: string) => void; openAdd: (mode: AddMode) => void }) {
  const [filter, setFilter] = useState<'all' | 'strong' | 'warm' | 'drifting'>('all');
  const people = workspace.people.filter((person) => filter === 'all' || relationshipState(person) === filter);
  return <><PageHead kicker="YOUR RELATIONSHIP GRAPH" title="People" copy="Context, commitments, and the shape of every relationship." action={<button className="primary-button" onClick={() => openAdd('person')}><span>＋</span>Add person</button>}/><div className="toolbar"><div className="segmented">{(['all', 'strong', 'warm', 'drifting'] as const).map((state) => <button className={filter === state ? 'active' : ''} key={state} onClick={() => setFilter(state)}>{state[0].toUpperCase() + state.slice(1)} <span>{state === 'all' ? workspace.people.length : workspace.people.filter((person) => relationshipState(person) === state).length}</span></button>)}</div><span className="storage-note"><i/>Stored on this device</span></div><section className="people-table panel"><div className="table-head"><span>Person</span><span>Relationship</span><span>Last contact</span><span>Context</span><span/></div>{people.map((person) => { const state = relationshipState(person); return <button className="people-row" key={person.id} onClick={() => openPerson(person.id)}><span className="person-cell"><PersonAvatar person={person}/><span><b>{person.name}</b><small>{person.role} · {personCompany(person, workspace)?.name}</small></span></span><span><i className={`state-pill ${state}`}>{state}</i><small>{person.strength}/100</small></span><span>{relativeDate(person.lastContact)}</span><span className="tag-list">{person.tags.slice(0, 2).map((tag) => <i key={tag}>{tag}</i>)}</span><em>→</em></button>; })}</section></>;
}

function CompaniesView({ workspace, openPerson }: { workspace: CRMWorkspace; openPerson: (id: string) => void }) {
  return <><PageHead kicker="ORGANIZATIONS IN YOUR ORBIT" title="Companies" copy="A living roll-up of who you know and why each company matters."/><div className="company-grid">{workspace.companies.map((company) => { const people = workspace.people.filter((person) => person.companyId === company.id); const opportunities = workspace.opportunities.filter((item) => item.companyId === company.id); return <article className="company-card panel" key={company.id}><div className="company-top"><span className="company-mark">{initials(company.name)}</span><span><h2>{company.name}</h2><a href={`https://${company.domain}`} target="_blank" rel="noreferrer">{company.domain}</a></span><i>{company.industry}</i></div><p>{company.description}</p><div className="company-metrics"><span><b>{people.length}</b> people</span><span><b>${opportunities.reduce((sum, item) => sum + item.value, 0).toLocaleString()}</b> pipeline</span></div><div className="company-people">{people.map((person) => <button key={person.id} onClick={() => openPerson(person.id)} title={person.name}><PersonAvatar person={person}/></button>)}{people.length === 0 && <small>No people linked yet</small>}</div></article>; })}</div></>;
}

function OpportunitiesView({ workspace, moveOpportunity }: { workspace: CRMWorkspace; moveOpportunity: (id: string) => void }) {
  const total = workspace.opportunities.filter((item) => item.stage !== 'Won').reduce((sum, item) => sum + item.value, 0);
  return <><PageHead kicker="LIGHTWEIGHT PIPELINE" title="Opportunities" copy="Keep momentum visible without turning relationships into rows of admin." action={<div className="headline-stat"><span>OPEN PIPELINE</span><b>${total.toLocaleString()}</b></div>}/><div className="kanban">{stages.map((stage) => { const cards = workspace.opportunities.filter((item) => item.stage === stage); return <section className="kanban-column" key={stage}><header><span>{stage}</span><b>{cards.length}</b></header>{cards.map((item) => { const person = workspace.people.find((candidate) => candidate.id === item.personId); const company = workspace.companies.find((candidate) => candidate.id === item.companyId); return <article className="deal-card" key={item.id}><div className="deal-value">${item.value.toLocaleString()}</div><h3>{item.name}</h3><p>{company?.name}</p><div className="deal-contact">{person && <PersonAvatar person={person}/>}<span>{person?.name}<small>{item.nextStep}</small></span></div>{stage !== 'Won' && <button onClick={() => moveOpportunity(item.id)}>Move forward <span>→</span></button>}</article>; })}<button className="add-deal" onClick={() => alert('Add opportunity is next on the roadmap. For now, import or edit the open data model.')}>＋ Add opportunity</button></section>; })}</div></>;
}

function FollowUpsView({ workspace, toggleTask, openPerson, openAdd }: { workspace: CRMWorkspace; toggleTask: (id: string) => void; openPerson: (id: string) => void; openAdd: (mode: AddMode) => void }) {
  const sorted = [...workspace.followUps].sort((a, b) => Number(a.completed) - Number(b.completed) || a.dueDate.localeCompare(b.dueDate));
  return <><PageHead kicker="OPEN LOOPS" title="Follow-ups" copy="Promises and thoughtful moments, surfaced before they slip away." action={<button className="primary-button" onClick={() => openAdd('followup')}><span>＋</span>Add follow-up</button>}/><section className="task-list panel">{sorted.map((task) => { const person = workspace.people.find((candidate) => candidate.id === task.personId); const late = !task.completed && new Date(task.dueDate) < new Date(); return <article className={`task-row ${task.completed ? 'complete' : ''}`} key={task.id}><button className="task-check" onClick={() => toggleTask(task.id)} aria-label={task.completed ? 'Reopen task' : 'Complete task'}>{task.completed ? '✓' : ''}</button><div className="task-copy"><strong>{task.title}</strong><span>{task.reason}</span></div>{person && <button className="task-person" onClick={() => openPerson(person.id)}><PersonAvatar person={person}/>{person.name}</button>}<time className={late ? 'late' : ''}>{dateLabel(task.dueDate)}</time></article>; })}</section></>;
}

function ImportView({ workspace, importRef, exportData, exportCsv, installApp, setConfirmClear }: { workspace: CRMWorkspace; importRef: React.RefObject<HTMLInputElement | null>; exportData: () => void; exportCsv: () => void; installApp: () => void; setConfirmClear: (value: boolean) => void }) {
  return <><PageHead kicker="PORTABLE BY DEFAULT" title="Your data stays yours" copy="Install FREE CRM, bring your existing context, and leave whenever you want."/><section className="privacy-hero"><div className="privacy-lock">⌁</div><div><span>LOCAL-FIRST WORKSPACE</span><h2>No account. No tracking. No hostage data.</h2><p>Your CRM is stored in this browser’s private database. Cloud hosting delivers the app; your relationship data remains on your device unless you export it.</p></div><div className="privacy-status"><i/><b>Device storage active</b><small>Last saved {relativeDate(workspace.updatedAt)}</small></div></section><div className="data-grid"><article className="data-card panel"><span className="data-icon">↗</span><h2>Bring your people</h2><p>Import a FREE CRM backup or a CSV with name, email, company, role, tags, and notes.</p><button className="primary-button" onClick={() => importRef.current?.click()}>Choose a file</button><button className="text-button" onClick={() => download('free-crm-import-template.csv', 'name,email,role,company,location,tags,notes\nAlex Kim,alex@example.com,Founder,Acme,San Francisco,"Founder; AI",Met at demo day', 'text/csv')}>Download CSV template</button></article><article className="data-card panel"><span className="data-icon">⇣</span><h2>Take everything</h2><p>Back up the complete workspace as JSON, or export a portable people spreadsheet.</p><button className="secondary-button" onClick={exportData}>Export full backup</button><button className="text-button" onClick={exportCsv}>Export people CSV</button></article><article className="data-card panel"><span className="data-icon">▣</span><h2>Install on this device</h2><p>Pin FREE CRM like an app. The interface keeps working offline after the first visit.</p><button className="secondary-button" onClick={installApp}>Install FREE CRM</button><small>Chrome, Edge, Safari, or any modern PWA browser</small></article></div><section className="workspace-summary panel"><div><span>WORKSPACE CONTENTS</span><b>{workspace.people.length} people · {workspace.companies.length} companies · {workspace.interactions.length} notes · {workspace.followUps.length} follow-ups</b></div><button className="danger-button" onClick={() => setConfirmClear(true)}>Delete local data</button></section></>;
}

function ActivityView({ workspace }: { workspace: CRMWorkspace }) {
  return <><PageHead kicker="PROVENANCE LOG" title="Activity" copy="A clear record of what FREE CRM learned, changed, and where it came from."/><section className="activity-list panel">{workspace.events.map((event, index) => <article key={event.id}><div className={`event-icon ${event.kind}`}>{event.kind === 'task' ? '✓' : event.kind === 'person' ? '◎' : event.kind === 'deal' ? '◇' : event.kind === 'import' ? '↗' : '◌'}</div><div><strong>{event.label}</strong><p>{event.detail}</p><span>{relativeDate(event.occurredAt)}</span></div>{index < workspace.events.length - 1 && <i/>}</article>)}</section></>;
}

function PersonAvatar({ person }: { person: Person }) {
  return <span className={`person-avatar ${person.color}`}>{initials(person.name)}</span>;
}

function SearchPalette({ search, setSearch, results, workspace, openPerson, close, setView }: { search: string; setSearch: (value: string) => void; results: Person[]; workspace: CRMWorkspace; openPerson: (id: string) => void; close: () => void; setView: (view: View) => void }) {
  return <div className="modal-backdrop palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="search-palette"><label><span>⌕</span><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your entire relationship graph…"/><kbd>ESC</kbd></label><div className="palette-label">{search ? 'MATCHING PEOPLE' : 'PEOPLE YOU MAY NEED'}</div><div className="palette-results">{results.map((person) => <button key={person.id} onClick={() => openPerson(person.id)}><PersonAvatar person={person}/><span><b>{person.name}</b><small>{person.role} · {personCompany(person, workspace)?.name}</small></span><em>{relativeDate(person.lastContact)} →</em></button>)}{results.length === 0 && <p>No match yet. Try a name, company, tag, or phrase from your notes.</p>}</div><footer><button onClick={() => { setView('people'); close(); }}>◎ Browse all people</button><button onClick={() => { setView('import'); close(); }}>↗ Import contacts</button><span>Local search · nothing leaves this device</span></footer></section></div>;
}

function PersonDrawer({ person, workspace, close, openAdd, notify }: { person: Person; workspace: CRMWorkspace; close: () => void; openAdd: (mode: AddMode, personId?: string) => void; notify: (message: string) => void }) {
  const company = personCompany(person, workspace);
  const interactions = workspace.interactions.filter((item) => item.personId === person.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const tasks = workspace.followUps.filter((item) => item.personId === person.id && !item.completed);
  const state = relationshipState(person);
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="person-drawer"><header><button onClick={close}>×</button><span>PERSON CONTEXT</span><button onClick={() => { navigator.clipboard.writeText(person.email); notify('Email copied'); }}>Copy email</button></header><section className="drawer-identity"><PersonAvatar person={person}/><div><h2>{person.name}</h2><p>{person.role} · {company?.name}</p><span>{person.location}</span></div></section><div className="drawer-score"><div><span>Relationship</span><b className={state}>{state}</b></div><div><span>Strength</span><b>{person.strength}/100</b></div><div><span>Last contact</span><b>{relativeDate(person.lastContact)}</b></div></div><div className="drawer-actions"><button onClick={() => openAdd('note', person.id)}>＋ Log context</button><button onClick={() => openAdd('followup', person.id)}>✓ Add follow-up</button></div><section className="context-box"><span>WHAT YOU KNOW</span><p>{person.notes || 'No notes yet.'}</p><small>Source: {person.source}</small></section><section className="contact-box"><a href={`mailto:${person.email}`}>{person.email}</a>{person.phone && <a href={`tel:${person.phone}`}>{person.phone}</a>}<span>{person.tags.map((tag) => <i key={tag}>{tag}</i>)}</span></section>{tasks.length > 0 && <section className="drawer-section"><h3>Open loops</h3>{tasks.map((task) => <div className="mini-task" key={task.id}><span>○</span><p>{task.title}<small>{dateLabel(task.dueDate)}</small></p></div>)}</section>}<section className="drawer-section timeline"><h3>Relationship timeline</h3>{interactions.map((item) => <article key={item.id}><i/><div><b>{item.type} · {relativeDate(item.occurredAt)}</b><p>{item.summary}</p><small>{item.source}</small></div></article>)}{!interactions.length && <p className="empty-copy">Log the first note to start this relationship timeline.</p>}</section></aside></div>;
}

function AddModal({ mode, setMode, workspace, prefillPerson, close, submit }: { mode: AddMode; setMode: (mode: AddMode) => void; workspace: CRMWorkspace; prefillPerson: string; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="add-modal"><header><div><span>CAPTURE WITHOUT THE ADMIN</span><h2>Add anything</h2></div><button onClick={close}>×</button></header><div className="modal-tabs"><button className={mode === 'person' ? 'active' : ''} onClick={() => setMode('person')}>◎ Person</button><button className={mode === 'followup' ? 'active' : ''} onClick={() => setMode('followup')}>✓ Follow-up</button><button className={mode === 'note' ? 'active' : ''} onClick={() => setMode('note')}>◌ Note</button></div><form onSubmit={submit}>{mode === 'person' && <><label><span>Name *</span><input name="name" required autoFocus placeholder="Ada Lovelace"/></label><div className="form-grid"><label><span>Email *</span><input name="email" required type="email" placeholder="ada@example.com"/></label><label><span>Role</span><input name="role" placeholder="Founder"/></label></div><div className="form-grid"><label><span>Company</span><input name="company" placeholder="Analytical Engines"/></label><label><span>Location</span><input name="location" placeholder="San Francisco"/></label></div><label><span>Tags</span><input name="tags" placeholder="Founder, AI, Friend"/></label><label><span>What should you remember?</span><textarea name="notes" rows={4} placeholder="Where you met, what they care about, what you promised…"/></label></>}{mode === 'followup' && <><label><span>Follow-up *</span><input name="title" required autoFocus placeholder="Send the customer research deck"/></label><label><span>Person</span><select name="personId" defaultValue={prefillPerson}><option value="">Personal / no person</option>{workspace.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label><span>Due date</span><input name="dueDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)}/></label><label><span>Why this matters</span><input name="reason" placeholder="Promised in our last meeting"/></label></>}{mode === 'note' && <><label><span>Person *</span><select name="personId" required defaultValue={prefillPerson}><option value="">Choose someone</option>{workspace.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label><span>Context *</span><textarea name="summary" rows={6} required autoFocus placeholder="What happened? What matters next?"/></label></>}<footer><button type="button" onClick={close}>Cancel</button><button className="primary-button" type="submit">Save to FREE CRM</button></footer></form></section></div>;
}

function ConfirmClear({ close, confirm }: { close: () => void; confirm: () => void }) {
  return <div className="modal-backdrop"><section className="confirm-modal"><span>DELETE LOCAL WORKSPACE?</span><h2>This clears this browser only.</h2><p>Export a backup first if you want to keep your data. This action cannot be undone.</p><div><button onClick={close}>Keep my data</button><button className="danger-button" onClick={confirm}>Delete and reset demo</button></div></section></div>;
}
