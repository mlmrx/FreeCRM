'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation avoids Vinext prefetch and keeps private routes network-only. */

import { useI18n } from '@/app/i18n-provider';
import { T, LocalizedAttributes } from '@/app/localized-text';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { appendBrainMessages, createBrainClient, downloadFilename, normalizedBrainDraft, safeSourceUrl, sourceMarkdown, sourceToDraft } from '@/lib/brain-client';
import type { BrainConversation, BrainMessage, BrainPassage, BrainSaveInput, BrainSnapshot, BrainSource } from '@/lib/brain-types';
import styles from './brain.module.css';

type View = 'source' | 'graph' | 'settings';
type MobilePane = 'library' | 'desk' | 'chat';
export const brainSourceContextNotice = 'Saved conversations that used this source as context will be permanently removed, even if the answer did not cite it. Copies in other notes and downloaded exports are not removed.';
export function brainSourceChangePrompt(action: 'save' | 'delete', title = '', text: (source: string, values?: Record<string, string | number>) => string = (source, values = {}) => source.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match))) {
  const change = action === 'save' ? text('Save this source revision?') : text('Delete “{title}”? Its search index and links will also be removed.', { title });
  return [change, text(brainSourceContextNotice), text('Export first if you need a copy. This cannot be undone.')].join(' ');
}
function date(value: string, locale?: string) { return new Date(value).toLocaleDateString(locale, { month: 'short', day: 'numeric' }); }
function message(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Your draft is still here.'; }
function newDraft(kind: BrainSaveInput['kind'] = 'note'): BrainSaveInput { return { id: crypto.randomUUID(), title: '', body: '', kind, tags: [], pinned: false, recordIds: [], relatedSourceIds: [] }; }
function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function KnowledgeGraph({ snapshot, onSource }: { snapshot: BrainSnapshot; onSource: (id: string) => void }) {
  const { text } = useI18n();
  const [focusId, setFocusId] = useState('');
  const focused = snapshot.sources.find((source) => source.id === focusId);
  const linkedIds = new Set(snapshot.links.filter((link) => link.sourceId === focusId || link.targetId === focusId).flatMap((link) => [link.sourceId, link.targetId]));
  const sources = focusId ? snapshot.sources.filter((source) => source.id === focusId || linkedIds.has(source.id)).slice(0, 30) : snapshot.sources.slice(0, 30);
  const records = snapshot.records.filter((record) => snapshot.links.some((link) => link.kind === 'record' && link.targetId === record.id && sources.some((source) => source.id === link.sourceId))).slice(0, 12);
  const items = [...sources.map((source) => ({ ...source, record: false })), ...records.map((record) => ({ ...record, record: true }))];
  const positions = items.map((item, index) => ({ ...item, x: 350 + Math.cos(index * 2.39996) * (items.length < 2 ? 0 : 65 + Math.sqrt(index / Math.max(1, items.length - 1)) * 155), y: 220 + Math.sin(index * 2.39996) * (items.length < 2 ? 0 : 45 + Math.sqrt(index / Math.max(1, items.length - 1)) * 115) }));
  return <LocalizedAttributes names={["aria-label"]}><section className={styles.graph} aria-label="Knowledge connections">
    <div className={styles.sectionHead}><div><p className={styles.eyebrow}><T text="THE BIGGER PICTURE" /></p><h2><T text="Everything is connected." /></h2></div><span className={styles.badge}>{snapshot.links.length}<T text=" links" /></span></div>
    <p className={styles.muted}><T text="Connections you make between knowledge and CRM records. No inferred relationships or invented facts." /></p>
    <label className={styles.field}><T text="Explore around a source" /><select value={focusId} onChange={(event) => setFocusId(event.target.value)}><option value=""><T text="All connections" /></option>{snapshot.sources.map((source) => <option value={source.id} key={source.id}>{source.title}</option>)}</select></label>
    {items.length === 0 ? <div className={styles.empty}><h3><T text="A thought becomes a thread." /></h3><p><T text="Capture your first note, then connect it to another source or a person in your CRM." /></p></div> : <>
      <svg viewBox="0 0 700 440" className={styles.graphCanvas} role="img" aria-label={text("Knowledge graph, {value0} sources and {value1} CRM records. Use the accessible list below to open a source.", { value0: sources.length, value1: records.length })}>
        {snapshot.links.map((link) => { const from = positions.find((node) => node.id === link.sourceId); const to = positions.find((node) => node.id === link.targetId); return from && to ? <line key={`${link.sourceId}-${link.targetId}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={link.kind === 'record' ? '#bd6d7e' : '#c6cedb'} strokeWidth="1.5" strokeDasharray={link.kind === 'record' ? '4 5' : undefined} /> : null; })}
        {positions.map((node) => <g key={node.id} className={node.record ? undefined : styles.graphNode} onClick={node.record ? undefined : () => onSource(node.id)}><title>{node.title}{node.record ? ' (CRM record)' : ''}</title><circle cx={node.x} cy={node.y} r={node.id === focusId ? 13 : 9} fill={node.record ? '#b70b32' : '#163c6a'} stroke="#fffefa" strokeWidth="4" /><text x={node.x} y={node.y + 25} textAnchor="middle" fontSize="11" fill="#23364d">{node.title.length > 23 ? `${node.title.slice(0, 22)}…` : node.title}</text></g>)}
      </svg>
      <div className={styles.graphLegend}><span><T text="● Knowledge" /></span><span><T text="● CRM records" /></span><span><T text="— Your explicit links" /></span></div>
      <p className={styles.small}><T text="Showing " />{sources.length}<T text=" sources and " />{records.length}<T text=" records" />{focused ? text(" around “{value0}”", { value0: focused.title }) : <T text="; choose a source above to explore its neighborhood" />}<T text=". Graph capped at 30 sources and 12 records for readability." /></p>
      <details className={styles.details} open><summary><T text="Connections · accessible list" /></summary><ul className={styles.connectionList}>{sources.map((source) => <li key={source.id}><button onClick={() => onSource(source.id)}>{source.title}</button><ul>{snapshot.links.filter((link) => link.sourceId === source.id).map((link) => <li key={link.targetId}>{link.kind === 'source' ? <button onClick={() => onSource(link.targetId)}>{snapshot.sources.find((item) => item.id === link.targetId)?.title ?? text('Source')}</button> : <span><T text="CRM · " />{snapshot.records.find((record) => record.id === link.targetId)?.title ?? text('Record')}</span>}</li>)}</ul></li>)}</ul></details>
    </>}
  </section></LocalizedAttributes>;
}

export function BrainMessageCard({ entry, onSource }: { entry: BrainMessage; onSource: (id: string) => void }) {
  return <article className={`${styles.message} ${entry.role === 'user' ? styles.userMessage : ''}`}>
    <div className={styles.messageLabel}>{entry.role === 'user' ? <T text="YOU" /> : entry.mode === 'ollama' ? <T text="LOCAL AI · CHECK THE SOURCES" /> : <T text="SOURCE SEARCH · NOT AN AI-GENERATED ANSWER" />}</div>
    <p className={styles.plainText}>{entry.content}</p>
    {entry.citations.length > 0 && <div className={styles.citations}><span><T text="Open the evidence" /></span>{entry.citations.map((citation, index) => <details key={citation.id}><summary>[{index + 1}] {citation.title}</summary><blockquote>{citation.text}</blockquote><button onClick={() => onSource(citation.sourceId)}><T text="Open source · version " />{citation.version} ↗</button></details>)}</div>}
  </article>;
}

export default function BrainWorkspace() {
  const { text, locale } = useI18n();
  const client = useMemo(() => createBrainClient(), []);
  const [snapshot, setSnapshot] = useState<BrainSnapshot | null>(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [draft, setDraft] = useState<BrainSaveInput | null>(null);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<View>('source');
  const [mobilePane, setMobilePane] = useState<MobilePane>('desk');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [passages, setPassages] = useState<BrainPassage[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<BrainMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<'search' | 'ollama'>('search');
  const [asking, setAsking] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [status, setStatus] = useState('');
  const sourceSequence = useRef(0);
  const conversationSequence = useRef(0);
  const searchSequence = useRef(0);
  const chatAbort = useRef<AbortController | null>(null);
  const pendingConversation = useRef<{ id: string; title: string } | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const data = await client.get<BrainSnapshot>(); setSnapshot(data); setLoadError('');
    if (conversationId && !data.conversations.some((conversation) => conversation.id === conversationId)) { ++conversationSequence.current; setConversationId(''); setMessages([]); }
    return data;
  }, [client, conversationId]);
  useEffect(() => {
    let live = true;
    client.get<BrainSnapshot>().then(async (data) => {
      if (!live) return;
      setSnapshot(data);
      const sourceId = new URL(window.location.href).searchParams.get('source');
      if (!sourceId) return;
      if (!data.sources.some((source) => source.id === sourceId)) { setError('That source is no longer available in this workspace.'); return; }
      const sequence = ++sourceSequence.current; setSourceLoading(true);
      try {
        const source = await client.get<BrainSource>(`?sourceId=${encodeURIComponent(sourceId)}`);
        if (live && sequence === sourceSequence.current) { setDraft(sourceToDraft(source)); setDirty(false); setView('source'); setMobilePane('desk'); }
      } catch (cause) { if (live && sequence === sourceSequence.current) setError(message(cause)); }
      finally { if (live && sequence === sourceSequence.current) setSourceLoading(false); }
    }).catch((cause) => { if (live) setLoadError(message(cause)); });
    return () => { live = false; chatAbort.current?.abort(); client.clear(); };
  }, [client]);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  useEffect(() => { messagesEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }, [messages, asking]);

  const canLeave = () => !dirty || window.confirm(text('Discard your unsaved note changes? Download Markdown first if you want to keep a copy.'));
  const openSource = async (id: string) => {
    if (busy) return;
    if (!canLeave()) return;
    const sequence = ++sourceSequence.current; setSourceLoading(true); setError('');
    try { const source = await client.get<BrainSource>(`?sourceId=${encodeURIComponent(id)}`); if (sequence === sourceSequence.current) { setDraft(sourceToDraft(source)); setDirty(false); setView('source'); setMobilePane('desk'); } }
    catch (cause) { if (sequence === sourceSequence.current) setError(message(cause)); }
    finally { if (sequence === sourceSequence.current) setSourceLoading(false); }
  };
  const capture = (kind: BrainSaveInput['kind'] = 'note') => {
    if (!canLeave()) return; ++sourceSequence.current; setSourceLoading(false); setDraft(newDraft(kind)); setDirty(false); setView('source'); setMobilePane('desk'); setError('');
  };
  const updateDraft = (change: Partial<BrainSaveInput>) => { if (busy || sourceLoading || !snapshot?.canWrite) return; setDraft((current) => current ? { ...current, ...change } : null); setDirty(true); };
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file || !canLeave()) return;
    setBusy(true);
    try {
      if (!/\.(md|txt)$/i.test(file.name)) throw new Error(text('Choose a Markdown (.md) or plain text (.txt) file.'));
      const limit = snapshot?.limits.bodyCharacters ?? 40000;
      if (file.size > limit * 4) throw new Error(text("This file is too large. Import at most {value0} characters per source.", { value0: limit.toLocaleString(locale) }));
      const body = await file.text(); if (body.length > limit || body.includes('\0')) throw new Error(text("Use a plain text file with at most {value0} characters.", { value0: limit.toLocaleString(locale) }));
      ++sourceSequence.current; setSourceLoading(false); setDraft({ ...newDraft('import'), title: file.name.replace(/\.(md|txt)$/i, '').slice(0, 200), body }); setDirty(true); setView('source'); setMobilePane('desk'); setError(''); setNotice(text('File read locally. Review your source and choose Save to add it to your private library.'));
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft || busy || asking || sourceLoading) return;
    if (draft.expectedVersion && !window.confirm(brainSourceChangePrompt('save', '', text))) return;
    setBusy(true); setError('');
    try { const source = await client.post<BrainSource>({ action: 'source.save', ...normalizedBrainDraft(draft) }); setDraft(sourceToDraft(source)); setDirty(false); setNotice(text('Saved to your private knowledge library.')); try { await refresh(); } catch { setError(text('Your source was saved, but the library could not refresh. Reload the library to see the latest list.')); } }
    catch (cause) { setError(text("{value0} Your draft has been kept. If another session changed this source, download your draft before reloading the source.", { value0: message(cause) })); }
    finally { setBusy(false); }
  };
  const removeSource = async () => {
    if (asking || sourceLoading || !draft?.expectedVersion || !window.confirm(brainSourceChangePrompt('delete', draft.title, text))) return;
    setBusy(true); setError('');
    try { await client.post({ action: 'source.delete', id: draft.id, expectedVersion: draft.expectedVersion }); setDraft(null); setDirty(false); setNotice(text('Source deleted.')); await refresh(); } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  };
  const search = async (event: FormEvent) => {
    event.preventDefault(); const sequence = ++searchSequence.current;
    if (!query.trim()) { setPassages(null); return; } setSearching(true); setError('');
    try { const result = await client.get<{ passages: BrainPassage[] }>(`?search=${encodeURIComponent(query.trim())}`); if (sequence === searchSequence.current) setPassages(result.passages); } catch (cause) { if (sequence === searchSequence.current) setError(message(cause)); } finally { if (sequence === searchSequence.current) setSearching(false); }
  };
  const selectConversation = async (id: string) => {
    if (asking) return; const sequence = ++conversationSequence.current; pendingConversation.current = null; setConversationId(id); setMessages([]); setChatLoading(Boolean(id)); setError('');
    if (!id) return;
    try { const result = await client.get<{ messages: BrainMessage[] }>(`?conversationId=${encodeURIComponent(id)}`); if (sequence === conversationSequence.current) setMessages(result.messages); } catch (cause) { if (sequence === conversationSequence.current) setError(message(cause)); } finally { if (sequence === conversationSequence.current) setChatLoading(false); }
  };
  const ask = async (event: FormEvent) => {
    event.preventDefault(); if (!question.trim() || asking || chatLoading || busy) return; setAsking(true); setError(''); const controller = new AbortController(); chatAbort.current = controller;
    try {
      let id = conversationId;
      if (!id) {
        pendingConversation.current ??= { id: crypto.randomUUID(), title: question.trim().slice(0, 100) };
        const conversation = await client.post<BrainConversation>({ action: 'conversation.create', ...pendingConversation.current }, controller.signal);
        setConversationId(conversation.id); id = conversation.id; pendingConversation.current = null;
      }
      const result = await client.post<{ messages: BrainMessage[] }>({ action: 'ask', conversationId: id, question: question.trim(), mode }, controller.signal);
      setMessages((current) => appendBrainMessages(current, result.messages)); setQuestion('');
      try { await refresh(); } catch { setError(text('Your answer was saved, but the conversation list could not refresh. Your question was not sent again.')); }
    } catch (cause) { setError(cause instanceof Error && cause.name === 'AbortError' ? text('Request stopped in this browser. The server may still finish. Your question is kept; retrying the same question reuses its operation ID.') : message(cause)); }
    finally { setAsking(false); chatAbort.current = null; }
  };
  const deleteConversation = async () => {
    if (!conversationId || asking || !window.confirm(text('Delete this conversation and its saved messages? Your source library will not change.'))) return;
    setChatLoading(true); setError(''); try { await client.post({ action: 'conversation.delete', id: conversationId }); ++conversationSequence.current; setConversationId(''); setMessages([]); await refresh(); setNotice(text('Conversation deleted.')); } catch (cause) { setError(message(cause)); } finally { setChatLoading(false); }
  };
  const runSetting = async (action: string, fields: Record<string, unknown> = {}) => {
    setBusy(true); setError(''); try { const result = await client.post<{ detail?: string; indexedChunks?: number }>({ action, ...fields }); if (result.detail) setStatus(result.detail); if (typeof result.indexedChunks === 'number') setNotice(text("Indexed {value0} passages with your local embedding model.", { value0: result.indexedChunks })); await refresh(); } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  };
  const toggleAi = async () => {
    if (!snapshot || aiBusy) return; setAiBusy(true); setError('');
    try { await client.post({ action: 'settings.update', enabled: !snapshot.ai.enabled }); if (snapshot.ai.enabled) setMode('search'); await refresh(); setNotice(snapshot.ai.enabled ? text('Local AI disabled. Source search remains available.') : text('Local AI permission enabled. Choose Local AI explicitly when you ask.')); }
    catch (cause) { setError(message(cause)); } finally { setAiBusy(false); }
  };

  const allTags = [...new Set(snapshot?.sources.flatMap((source) => source.tags) ?? [])].sort();
  const filtered = snapshot?.sources.filter((source) => (!onlyPinned || source.pinned) && (!tag || source.tags.includes(tag))).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)) ?? [];
  const filteredPassages = passages?.filter((passage) => filtered.some((source) => source.id === passage.sourceId));
  const selected = snapshot?.sources.find((source) => source.id === draft?.id);
  const backlinks = snapshot?.links.filter((link) => link.kind === 'source' && link.targetId === draft?.id) ?? [];

  if (!snapshot) return <main className={styles.loading}><a className={styles.brand} href="/">FREE <span>CRM</span></a><p className={styles.eyebrow}><T text="YOUR PRIVATE KNOWLEDGE WORKSPACE" /></p><h1>{loadError ? <T text="Let’s open your workspace." /> : <T text="Making room for your thoughts." />}</h1><p role={loadError ? 'alert' : 'status'}>{loadError ? text(loadError) : text('Loading your private library and conversations…')}</p>{loadError && <div className={styles.actions}><button onClick={() => refresh().catch((cause) => setLoadError(message(cause)))}><T text="Try again" /></button><a href="/api/auth/signin?callbackUrl=/brain"><T text="Owner sign in" /></a><a href="/deploy"><T text="Set up your own workspace" /></a><a href="/brain/help"><T text="How second brain works" /></a></div>}</main>;

  return <div className={styles.shell}>
    <a href="#brain-desk" className={styles.skip}><T text="Skip to notebook" /></a>
    <header className={styles.topbar}><a href="/" className={styles.brand}>FREE <span>CRM</span></a><span className={styles.divider} /><span className={styles.workspaceName}>{snapshot.workspaceName}</span><LocalizedAttributes names={["aria-label"]}><nav aria-label="Workspace navigation"><a href="/today"><T text="Today ↗" /></a><a href="/workspace"><T text="CRM workspace ↗" /></a><a href="/brain/help"><T text="Guide" /></a><a href="https://github.com/mlmrx/FreeCRM" target="_blank" rel="noreferrer"><T text="Open source ↗" /></a></nav></LocalizedAttributes></header>
    <div className={styles.heading}><div><p className={styles.eyebrow}><T text="A LITTLE LESS REMEMBERING. A LITTLE MORE THINKING." /></p><h1><T text="Your second brain" /><span>.</span></h1><p><T text="Thoughts become knowledge. Knowledge becomes connection." /></p></div><div className={styles.ownership}><span className={styles.ownershipDot} /><span><T text="Your workspace. Your knowledge." /><small><T text="No required AI subscription." /></small></span></div></div>
    <div className={styles.noticeArea} aria-live="polite">{notice && <div className={styles.notice}><T text={notice} /><LocalizedAttributes names={["aria-label"]}><button aria-label="Dismiss notice" onClick={() => setNotice('')}>×</button></LocalizedAttributes></div>}{error && <div className={styles.error} role="alert"><T text={error} /><LocalizedAttributes names={["aria-label"]}><button aria-label="Dismiss error" onClick={() => setError('')}>×</button></LocalizedAttributes></div>}</div>
    <LocalizedAttributes names={["aria-label"]}><nav className={styles.mobileTabs} aria-label="Second brain panels">{(['library', 'desk', 'chat'] as const).map((pane) => <button key={pane} aria-current={mobilePane === pane ? 'page' : undefined} onClick={() => setMobilePane(pane)}>{pane === 'library' ? <T text="Library" /> : pane === 'desk' ? <T text="Notebook" /> : <T text="Conversation" />}</button>)}</nav></LocalizedAttributes>
    <div className={styles.layout}>
      <LocalizedAttributes names={["aria-label"]}><aside className={`${styles.library} ${mobilePane !== 'library' ? styles.mobileHidden : ''}`} aria-label="Knowledge library">
        <div className={styles.sectionHead}><h2><T text="Library" /></h2><span className={styles.counter}>{snapshot.sources.length}</span></div>
        <button className={styles.capture} onClick={() => capture()} disabled={!snapshot.canWrite || busy}><T text="＋ Capture a thought" /></button>
        <div className={styles.importActions}><button onClick={() => capture('clip')} disabled={!snapshot.canWrite || busy}><T text="Add a clip" /></button><button onClick={() => fileInput.current?.click()} disabled={!snapshot.canWrite || busy}><T text="Import text" /></button><LocalizedAttributes names={["aria-label"]}><input className={styles.hidden} ref={fileInput} type="file" accept=".txt,.md,text/plain,text/markdown" aria-label="Import Markdown or text file" onChange={importFile} /></LocalizedAttributes></div>
        <form onSubmit={search} className={styles.search}><label htmlFor="brain-search" className={styles.srOnly}><T text="Search source contents" /></label><LocalizedAttributes names={["placeholder"]}><input id="brain-search" value={query} onChange={(event) => { setQuery(event.target.value); ++searchSequence.current; setPassages(null); setSearching(false); }} placeholder="Find a thought…" maxLength={500} /></LocalizedAttributes><LocalizedAttributes names={["aria-label"]}><button aria-label="Search library" disabled={searching}>{searching ? '…' : '↗'}</button></LocalizedAttributes></form>
        <div className={styles.filters}><button aria-pressed={onlyPinned} onClick={() => setOnlyPinned(!onlyPinned)}><T text="Pinned " />{onlyPinned ? '✓' : '◇'}</button><label className={styles.srOnly} htmlFor="brain-tag"><T text="Filter by tag" /></label><select id="brain-tag" value={tag} onChange={(event) => setTag(event.target.value)}><option value=""><T text="All tags" /></option>{allTags.map((value) => <option value={value} key={value}>{value}</option>)}</select></div>
        <div className={styles.sourceList}>{filteredPassages ? <><div className={styles.searchCaption}><T text="Matching passages " /><button onClick={() => { ++searchSequence.current; setPassages(null); setQuery(''); }}><T text="Clear" /></button></div>{filteredPassages.length === 0 && <p className={styles.small}><T text="No matching passages. Try a specific name or phrase, or clear the filters." /></p>}{filteredPassages.map((passage) => <button key={passage.id} className={styles.sourceItem} onClick={() => openSource(passage.sourceId)} disabled={busy}><strong>{passage.title}</strong><p>{passage.text.slice(0, 160)}</p><small><T text="Open matching source ↗" /></small></button>)}</> : filtered.length > 0 ? filtered.map((source) => <button key={source.id} className={`${styles.sourceItem} ${draft?.id === source.id ? styles.selectedSource : ''}`} aria-current={draft?.id === source.id ? 'true' : undefined} onClick={() => openSource(source.id)} disabled={busy}><div><small>{source.kind === 'clip' ? <T text="WEB CLIP" /> : source.kind === 'import' ? <T text="IMPORTED" /> : <T text="NOTE" />}</small>{source.pinned && <LocalizedAttributes names={["aria-label"]}><span aria-label="Pinned">◇</span></LocalizedAttributes>}</div><strong>{source.title}</strong><p>{source.excerpt || text('A little room for a thought.')}</p><small>{date(source.updatedAt, locale)}{source.tags[0] ? ` · ${source.tags[0]}` : ''}</small></button>) : <div className={styles.libraryEmpty}><p>{snapshot.sources.length ? <T text="No sources match these filters." /> : <T text="A place for the things worth keeping." />}</p><small>{snapshot.sources.length ? <T text="Try all tags or remove the pinned filter." /> : <T text="Notes, meeting context, ideas, and passages you want to return to." />}</small></div>}</div>
        <div className={styles.libraryFooter}><button onClick={() => { setView('graph'); setMobilePane('desk'); }}><T text="◉ Explore connections" /></button><button onClick={() => { setView('settings'); setMobilePane('desk'); }}><T text="Local AI & ownership" /></button>{snapshot.canExport && <a href="/api/v1/brain?export=json"><T text="Export library & conversations ↓" /></a>}<button onClick={() => refresh().then(() => setNotice(text('Library refreshed. Unsaved draft kept.'))).catch((cause) => setError(message(cause)))}><T text="Refresh library" /></button></div>
      </aside></LocalizedAttributes>
      <main id="brain-desk" className={`${styles.desk} ${mobilePane !== 'desk' ? styles.mobileHidden : ''}`}>
        <div className={styles.deskTabs}><button aria-pressed={view === 'source'} onClick={() => setView('source')}><T text="Notebook" /></button><button aria-pressed={view === 'graph'} onClick={() => setView('graph')}><T text="Connections" /></button><span>{dirty ? <T text="Unsaved changes" /> : <T text="Private by design" />}</span></div>
        {sourceLoading && <p className={styles.inlineStatus} role="status"><T text="Opening source…" /></p>}
        {view === 'graph' ? <KnowledgeGraph snapshot={snapshot} onSource={openSource} /> : view === 'settings' ? <section className={styles.settings}>
          <p className={styles.eyebrow}><T text="OWN YOUR THINKING" /></p><h2><T text="A brain without a walled garden." /></h2>
          <p><T text="Your notes, links, and conversations live in your workspace database. Source search needs no model, API key, or subscription." /></p>
          <div className={styles.settingCard}>
            <h3><T text="Local AI with Ollama" /></h3><p><T text={snapshot.ai.detail} /></p>
            <dl><div><dt><T text="Chat model" /></dt><dd>{snapshot.ai.chatModel}</dd></div><div><dt><T text="Embedding model" /></dt><dd>{snapshot.ai.embeddingModel}</dd></div><div><dt><T text="Workspace AI permission" /></dt><dd>{snapshot.ai.enabled ? <T text="Enabled" /> : <T text="Off" />}</dd></div></dl>
            <p className={styles.small}><T text="When you choose Local AI, selected source excerpts and your question are sent to the operator-configured local Ollama service. AI has no tools, cannot change records, and can be wrong. Do not expose Ollama to the public internet." /></p>
            <div className={styles.actions}>
              {snapshot.canManage && <button disabled={aiBusy || !snapshot.ai.device} onClick={toggleAi}>{snapshot.ai.enabled ? <T text="Turn off local AI" /> : <T text="Enable local AI" />}</button>}
              <button disabled={busy || !snapshot.ai.device} onClick={() => runSetting('status')}><T text="Check local model service" /></button>
              <a href="/brain/help"><T text="Local setup instructions ↗" /></a>
            </div>
            {status && <p role="status"><T text={status} /></p>}
          </div>
          <div className={styles.settingCard}><h3><T text="Take your knowledge with you" /></h3><p><T text="Export your sources, explicit links, and saved conversations as JSON. Each open source can also be downloaded as Markdown. Keep exports private: they contain your knowledge and conversation history." /></p>{snapshot.canExport ? <a className={styles.textLink} href="/api/v1/brain?export=json"><T text="Download your knowledge archive ↓" /></a> : <p className={styles.small}><T text="An owner or administrator can grant export permission." /></p>}</div>
          <div className={styles.settingCard}><h3><T text="Intentionally bounded" /></h3><p><T text="Text and Markdown capture are supported. Clips store the text you supply, never fetch the URL. There is no background inbox access, PDF extraction, autonomous action, or cloud AI transmission in this experience." /></p><p className={styles.small}><T text="Workspace limits: " />{snapshot.limits.sources}<T text=" sources · " />{snapshot.limits.bodyCharacters.toLocaleString(locale)}<T text=" characters/source · " />{snapshot.limits.conversations}<T text=" conversations · " />{snapshot.limits.messagesPerConversation}<T text=" messages/conversation. Total source text and metadata: " />{snapshot.limits.sourceBytes / 1048576}<T text=" MiB. Total saved messages and citations: " />{snapshot.limits.messageBytes / 1048576}<T text=" MiB. The first limit reached applies." /></p></div>
        </section> : draft ? <form className={styles.editor} onSubmit={save}>
          <div className={styles.editorMeta}><span>{draft.expectedVersion ? text("VERSION {value0}", { value0: draft.expectedVersion }) : <T text="NEW SOURCE" />} · <T text={draft.kind.toUpperCase()} /></span><button type="button" aria-pressed={draft.pinned} onClick={() => updateDraft({ pinned: !draft.pinned })} disabled={!snapshot.canWrite || busy}>{draft.pinned ? <T text="◇ Pinned" /> : <T text="◇ Pin note" />}</button></div>
          <label htmlFor="source-title" className={styles.srOnly}><T text="Source title" /></label><LocalizedAttributes names={["placeholder"]}><input id="source-title" className={styles.titleInput} placeholder="Give this thought a home." value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} maxLength={200} required readOnly={!snapshot.canWrite || busy || sourceLoading} /></LocalizedAttributes>
          {draft.kind === 'clip' && <label className={styles.field}><T text="Original URL " /><LocalizedAttributes names={["placeholder"]}><input type="url" placeholder="https://…" value={draft.sourceUrl ?? ''} onChange={(event) => updateDraft({ sourceUrl: event.target.value })} maxLength={2048} readOnly={!snapshot.canWrite || busy || sourceLoading} /></LocalizedAttributes><small><T text="Paste the useful text below. We do not fetch this page." /></small></label>}
          {draft.sourceUrl && safeSourceUrl(draft.sourceUrl) && <a className={styles.textLink} href={safeSourceUrl(draft.sourceUrl)} target="_blank" rel="noreferrer"><T text="Visit original source ↗" /></a>}
          <label className={styles.srOnly} htmlFor="source-body"><T text="Source text" /></label><textarea id="source-body" className={styles.bodyInput} placeholder={'A passing idea. A conversation worth remembering.\nWhat would you like your future self to know?'} value={draft.body} onChange={(event) => updateDraft({ body: event.target.value })} maxLength={snapshot.limits.bodyCharacters} required readOnly={!snapshot.canWrite || busy || sourceLoading} />
          <div className={styles.bodyFooter}><span><T text="Plain text / Markdown · rendered as text" /></span><span>{draft.body.length.toLocaleString(locale)} / {snapshot.limits.bodyCharacters.toLocaleString(locale)}</span></div>
          <label className={styles.field}><T text="Tags " /><LocalizedAttributes names={["placeholder"]}><input value={draft.tags.join(', ')} onChange={(event) => updateDraft({ tags: event.target.value.split(',').map((value) => value.trimStart()) })} placeholder="Ideas, people, research" maxLength={500} readOnly={!snapshot.canWrite || busy || sourceLoading} /></LocalizedAttributes><small><T text="Separate tags with commas. Up to 12 tags, 40 characters each." /></small></label>
          <details className={styles.details}><summary><T text="Connect this thought " /><span>{draft.recordIds.length + draft.relatedSourceIds.length}<T text=" links" /></span></summary><p className={styles.small}><T text="Choose up to 12 sources and 12 CRM records. These links make your graph navigable without changing CRM records." /></p><div className={styles.linkPickers}><fieldset disabled={!snapshot.canWrite || busy}><legend><T text="Knowledge sources" /></legend>{snapshot.sources.filter((source) => source.id !== draft.id).map((source) => <label key={source.id}><input type="checkbox" disabled={!draft.relatedSourceIds.includes(source.id) && draft.relatedSourceIds.length >= 12} checked={draft.relatedSourceIds.includes(source.id)} onChange={(event) => updateDraft({ relatedSourceIds: event.target.checked ? [...draft.relatedSourceIds, source.id] : draft.relatedSourceIds.filter((id) => id !== source.id) })} />{source.title}</label>)}{snapshot.sources.length < 2 && <p className={styles.small}><T text="Other saved sources appear here." /></p>}</fieldset><fieldset disabled={!snapshot.canWrite || busy}><legend><T text="CRM relationships" /></legend>{snapshot.records.map((record) => <label key={record.id}><input type="checkbox" disabled={!draft.recordIds.includes(record.id) && draft.recordIds.length >= 12} checked={draft.recordIds.includes(record.id)} onChange={(event) => updateDraft({ recordIds: event.target.checked ? [...draft.recordIds, record.id] : draft.recordIds.filter((id) => id !== record.id) })} /><span>{record.title}<small><T text={record.objectType} /></small></span></label>)}{snapshot.records.length === 0 && <p className={styles.small}><T text="Create records in your CRM to connect them here." /></p>}</fieldset></div></details>
          {backlinks.length > 0 && <div className={styles.backlinks}><span><T text="Referenced by" /></span>{backlinks.map((link) => <button key={link.sourceId} type="button" onClick={() => openSource(link.sourceId)} disabled={busy}>{snapshot.sources.find((source) => source.id === link.sourceId)?.title ?? text('Source')} ↗</button>)}</div>}
          {draft.expectedVersion && <p className={styles.small}><T text="When you save a revision or delete this source: " /><T text={brainSourceContextNotice} /><T text=" Export first if you need a copy." /></p>}
          <div className={styles.editorActions}><button className={styles.primary} type="submit" disabled={!snapshot.canWrite || busy || asking || sourceLoading || !draft.title.trim() || !draft.body.trim()}>{busy ? <T text="Working…" /> : <T text="Save source" />}</button>{snapshot.canExport && <button type="button" onClick={() => downloadText(sourceMarkdown(draft), downloadFilename(draft.title))}><T text="Markdown ↓" /></button>}{draft.expectedVersion && <button type="button" onClick={() => openSource(draft.id)} disabled={busy}><T text="Reload source" /></button>}{draft.expectedVersion && snapshot.canWrite && <button type="button" className={styles.danger} onClick={removeSource} disabled={busy || asking || sourceLoading}><T text="Delete" /></button>}</div>
          {selected && <div className={styles.indexRow}><span><T text="Updated " />{date(selected.updatedAt, locale)} · {selected.chunkCount}<T text=" searchable passages · " />{selected.indexedChunks}<T text=" embedded" /></span>{snapshot.canWrite && snapshot.ai.enabled && snapshot.ai.device && <button type="button" onClick={() => runSetting('source.index', { id: draft.id })} disabled={busy || dirty}><T text="Index for local AI" /></button>}</div>}
        </form> : <section className={styles.welcome}><span className={styles.chapter}><T text="01 / YOUR KNOWLEDGE, CONNECTED" /></span><h2><T text="Make space for" /><br /><em><T text="your next thought." /></em></h2><p><T text="A quiet place to collect what matters, connect the dots, and return to the source." /></p><div className={styles.welcomeSteps}><div><span>01</span><h3><T text="Keep a thought" /></h3><p><T text="Capture a note, paste a clip, or bring a text file." /></p></div><div><span>02</span><h3><T text="Make a connection" /></h3><p><T text="Link it to another idea, a person, or your work." /></p></div><div><span>03</span><h3><T text="Ask your knowledge" /></h3><p><T text="Find the passage. See the evidence. Think further." /></p></div></div><button className={styles.primary} disabled={!snapshot.canWrite} onClick={() => capture()}><T text="Capture your first thought ＋" /></button><a className={styles.textLink} href="/brain/help"><T text="How this second brain works ↗" /></a>{!snapshot.canWrite && <p className={styles.small}><T text="You have read-only access. Select a source in the library to explore." /></p>}</section>}
      </main>
      <LocalizedAttributes names={["aria-label"]}><aside className={`${styles.chat} ${mobilePane !== 'chat' ? styles.mobileHidden : ''}`} aria-label="Conversation with your knowledge">
        <div className={styles.chatHead}><div><p className={styles.eyebrow}><T text="THINK TOGETHER" /></p><h2><T text="Ask your knowledge." /></h2></div><LocalizedAttributes names={["aria-label","title"]}><button aria-label="Start a new conversation" title="New conversation" onClick={() => selectConversation('')} disabled={asking || chatLoading}>＋</button></LocalizedAttributes></div>
        <div className={styles.conversationPicker}><label className={styles.srOnly} htmlFor="brain-conversation"><T text="Saved conversation" /></label><select id="brain-conversation" value={conversationId} onChange={(event) => selectConversation(event.target.value)} disabled={asking || chatLoading}><option value=""><T text="New conversation" /></option>{snapshot.conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}{conversationId && !snapshot.conversations.some((item) => item.id === conversationId) && <option value={conversationId}><T text="Current conversation" /></option>}</select><LocalizedAttributes names={["aria-label"]}><button aria-label="Delete selected conversation" onClick={deleteConversation} disabled={!conversationId || asking || chatLoading || !snapshot.canWrite}>×</button></LocalizedAttributes></div>
        <div className={styles.chatMessages} aria-live="polite" aria-busy={asking || chatLoading}>{chatLoading ? <p className={styles.small}><T text="Opening conversation…" /></p> : messages.length ? messages.map((entry) => <BrainMessageCard key={entry.id} entry={entry} onSource={openSource} />) : <div className={styles.chatWelcome}><span className={styles.quoteMark}>“</span><h3><T text="Start with a question." /><br /><T text="Stay close to the source." /></h3><p><T text="Search finds passages in your saved notes. Local AI can help synthesize them once you enable Ollama." /></p><button onClick={() => setQuestion(text('What did I learn about my next steps?'))}><T text="What did I learn about my next steps? ↗" /></button><button onClick={() => setQuestion(text('Find the context behind this relationship.'))}><T text="Find the context behind this relationship. ↗" /></button><small><T text="Only your saved source text is searched. CRM links provide context, not automatic access to CRM record contents." /></small></div>}{asking && <p className={styles.inlineStatus} role="status">{mode === 'ollama' ? <T text="Consulting your local model…" /> : <T text="Looking through your sources…" />}</p>}<div ref={messagesEnd} /></div>
        <form className={styles.composer} onSubmit={ask}><label htmlFor="brain-mode"><T text="Answer with" /><select id="brain-mode" value={mode} onChange={(event) => setMode(event.target.value as 'search' | 'ollama')} disabled={asking}><option value="search"><T text="Source search · no AI" /></option><option value="ollama" disabled={!snapshot.ai.enabled || !snapshot.ai.device}><T text="Local AI · Ollama" />{!snapshot.ai.enabled ? <T text=" (set up first)" /> : ''}</option></select></label><label className={styles.srOnly} htmlFor="brain-question"><T text="Ask a question" /></label><LocalizedAttributes names={["placeholder"]}><textarea id="brain-question" placeholder="What would you like to remember?" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} required disabled={asking || !snapshot.canWrite} rows={3} /></LocalizedAttributes><div><span>{mode === 'search' ? <T text="Passages, not generated answers." /> : <T text="Local inference. No tools or writes." />}</span>{asking ? <button type="button" onClick={() => chatAbort.current?.abort()}><T text="Stop" /></button> : <button className={styles.primary} type="submit" disabled={!snapshot.canWrite || !question.trim() || chatLoading || busy || aiBusy}><T text="Ask ↗" /></button>}</div>{!snapshot.canWrite && <p className={styles.small}><T text="Write permission is required to save a conversation." /></p>}<button className={styles.localSetup} type="button" onClick={() => { setView('settings'); setMobilePane('desk'); }}><T text="Your local AI settings ↗" /></button></form>
      </aside></LocalizedAttributes>
    </div>
    <footer className={styles.footer}><span><T text="Celebrate open knowledge. Keep ownership." /></span><span><T text="FREE CRM · Open source, not a walled garden." /></span></footer>
  </div>;
}
