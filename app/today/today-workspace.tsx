'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation keeps private routes out of speculative prefetch. */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AdaptiveClientError, createAdaptiveClient, editableAdaptiveSettings, evidenceHref, followupPayload, localDateTime, proposalMarkdown, safeReleaseUrl, singleFlight, type EditableAdaptiveSettings } from '@/lib/adaptive-client';
import { adaptiveTopics, type AdaptiveAnswer, type AdaptiveEvidence, type AdaptiveSignal, type AdaptiveSnapshot } from '@/lib/adaptive-types';
import styles from './today.module.css';

type View = 'briefing' | 'learning' | 'capabilities';
type Action = Record<string, unknown>;
type TaskReceipt = { recordId: string; created: true };
type RunAction = (payload: Action, success: string, done?: (result: Record<string, unknown>) => void) => Promise<boolean>;
type Retry = { payload: Action; success: string; done?: (result: Record<string, unknown>) => void };
const certaintyLabels: Record<AdaptiveSignal['certainty'], string> = { recorded: 'Recorded fact', possible: 'Possible · verify first', 'vendor-announcement': 'Vendor announcement' };
function message(error: unknown) { return error instanceof Error ? error.message : 'This request could not be completed.'; }
function date(value: string | null, timezone?: string) {
  if (!value) return 'Not scheduled';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', ...(timezone ? { timeZone: timezone } : {}) });
}
function download(text: string, name: string, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function EvidenceList({ evidence }: { evidence: AdaptiveEvidence[] }) {
  return <div className={styles.evidence}>{evidence.map((entry, index) => {
    const href = evidenceHref(entry);
    return <details key={`${entry.kind}-${entry.id}-${index}`}><summary>{entry.kind === 'release' ? 'Announcement' : 'Source'} · {entry.title}</summary><blockquote>{entry.excerpt}</blockquote><div className={styles.evidenceFoot}><span>{entry.kind !== 'release' && `Version ${entry.version} · `}Observed {date(entry.observedAt)}</span>{href ? <a href={href} {...(entry.kind === 'release' ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>Open {entry.kind === 'source' ? 'note' : entry.kind === 'record' ? 'CRM record' : 'official source'} ↗</a> : <span>Source link unavailable</span>}</div></details>;
  })}</div>;
}

export function SignalCard({ signal, disabled, onFeedback, onFollowup }: { signal: AdaptiveSignal; disabled: boolean; onFeedback: (signal: AdaptiveSignal, value: 'useful' | 'dismissed' | 'snoozed' | 'new', snoozeDays?: number) => void; onFollowup: (signal: AdaptiveSignal) => void }) {
  const [snoozing, setSnoozing] = useState(false);
  const [snoozeDays, setSnoozeDays] = useState(3);
  const [correcting, setCorrecting] = useState(false);
  return <article className={`${styles.signal} ${signal.certainty === 'possible' ? styles.possible : ''}`}>
    <div className={styles.signalMeta}><span className={`${styles.certainty} ${signal.certainty === 'possible' ? styles.possibleLabel : ''}`}>{certaintyLabels[signal.certainty]}</span><span>{signal.topic}</span>{signal.state !== 'new' && <span className={styles.state}>{signal.state === 'actioned' ? 'Task created' : signal.state}</span>}</div>
    <h3>{signal.title}</h3><p className={styles.signalDetail}>{signal.detail}</p>
    <p className={styles.why}><span>Why now</span> {signal.why}</p>
    {signal.dueAt && <p className={styles.small}>Recorded date · {date(signal.dueAt)}</p>}
    <EvidenceList evidence={signal.evidence} />
    {signal.certainty === 'possible' && <p className={styles.small}>A possible promise is a suggestion to review. Missing completion in your records does not prove it was missed.</p>}
    {signal.snoozedUntil && <p className={styles.small}>Snoozed until {date(signal.snoozedUntil)}.</p>}
    <div className={styles.signalActions}>
      {signal.suggestedTask && signal.state !== 'actioned' && <button className={styles.primarySmall} disabled={disabled} onClick={() => onFollowup(signal)}>Review follow-up <span aria-hidden="true">↗</span></button>}
      <button disabled={disabled || signal.state === 'useful'} onClick={() => onFeedback(signal, 'useful')}>{signal.state === 'useful' ? '✓ Useful' : 'Useful'}</button>
      <button disabled={disabled || signal.state === 'dismissed'} onClick={() => onFeedback(signal, 'dismissed')}>Dismiss</button>
      <button disabled={disabled} aria-expanded={snoozing} onClick={() => setSnoozing(!snoozing)}>Snooze</button>
      <button disabled={disabled} aria-expanded={correcting} onClick={() => setCorrecting(!correcting)}>Correct</button>
      {['useful', 'dismissed', 'snoozed'].includes(signal.state) && <button disabled={disabled} onClick={() => onFeedback(signal, 'new')}>Reset feedback</button>}
    </div>
    {snoozing && <div className={styles.inlineForm}><label>Snooze for <select value={snoozeDays} onChange={(event) => setSnoozeDays(Number(event.target.value))}>{[1, 3, 7, 14, 30].map((days) => <option key={days} value={days}>{days} {days === 1 ? 'day' : 'days'}</option>)}</select></label><button disabled={disabled} onClick={() => { onFeedback(signal, 'snoozed', snoozeDays); setSnoozing(false); }}>Confirm snooze</button></div>}
    {correcting && <div className={styles.correction}><strong>Keep the source accurate.</strong><p>Open the evidence above to edit the original note or CRM record. The briefing will use the updated source on its next refresh. To remove an inaccurate suggestion now, dismiss it.</p><button disabled={disabled} onClick={() => onFeedback(signal, 'dismissed')}>Dismiss this suggestion</button></div>}
  </article>;
}

export function BriefingAnswer({ result }: { result: AdaptiveAnswer }) {
  return <article className={styles.answer}><p className={styles.eyebrow}>{result.mode === 'local-ai' ? 'LOCAL AI · CHECK THE EVIDENCE' : 'WORKSPACE GUIDE · NO MODEL USED'}</p><p className={styles.plainText}>{result.answer}</p><EvidenceList evidence={result.citations} /></article>;
}

export function LearningPanel({ snapshot, disabled, onAction, onExport }: { snapshot: AdaptiveSnapshot; disabled: boolean; onAction: RunAction; onExport: () => void }) {
  const [draft, setDraft] = useState(() => editableAdaptiveSettings(snapshot.settings));
  const [revision, setRevision] = useState(snapshot.settings.revision);
  const [forget, setForget] = useState(false);
  const [confirm, setConfirm] = useState('');
  const changedElsewhere = revision !== snapshot.settings.revision;
  const edit = (patch: Partial<EditableAdaptiveSettings>) => setDraft((current) => ({ ...current, ...patch }));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    await onAction({ action: 'settings.update', expectedRevision: revision, ...draft }, 'Your preferences were saved.');
  };
  return <section className={styles.panel} aria-labelledby="learning-title">
    <div className={styles.sectionHead}><div><p className={styles.eyebrow}>A LITTLE MORE YOU</p><h2 id="learning-title">Learning you can see.</h2></div><span className={styles.pill}>{snapshot.settings.paused ? 'Paused' : snapshot.settings.learningEnabled ? 'Learning enabled' : 'Learning is off'}</span></div>
    <p className={styles.intro}>You decide what is remembered and what can change. Learning starts off and uses only explicit feedback and accepted follow-up timing.</p>
    <div className={styles.learningSummary}><div><strong>{snapshot.observationCount}</strong><span>retained observations</span></div><div><strong>{snapshot.effectiveFollowUpDays} days</strong><span>current follow-up default</span></div><div><strong>30 days</strong><span>maximum memory · 500 observations</span></div></div>
    <p className={styles.small}>{snapshot.followUpExplanation}</p>
    <details className={styles.inspector} open><summary>Inspect what influences your briefing</summary>
      {snapshot.learning.length ? <div className={styles.learningItems}>{snapshot.learning.map((entry) => <article key={entry.topic}><div><strong>{entry.topic}</strong><span className={styles.pill}>{entry.status}</span></div><p>{entry.explanation}</p><p className={styles.small}>{entry.useful} useful · {entry.dismissed} dismissed · ranking weight {entry.weight.toFixed(2)}</p></article>)}</div> : <p>No learned preferences yet. Recommendations need feedback from at least three distinct signals.</p>}
      <p className={styles.small}>No keystrokes, browsing history, inferred sensitive traits, or global model training. Observations store action metadata, not note or message text. Feedback can still organize your feed while learning is off.</p>
      {snapshot.canExport && <button onClick={onExport} disabled={disabled}>Download private inspection JSON</button>}
    </details>
    <form className={styles.settings} onSubmit={save}>
      <div className={styles.sectionHead}><h3>Your preferences</h3><span className={styles.small}>Revision {revision}</span></div>
      {!snapshot.canManage && <p className={styles.permission}>Only a workspace owner or administrator can change these settings.</p>}
      {changedElsewhere && <div className={styles.correction}><p>Settings have changed. Your draft is still here; reload the current settings before saving again.</p><button type="button" onClick={() => { setDraft(editableAdaptiveSettings(snapshot.settings)); setRevision(snapshot.settings.revision); }}>Reload current settings</button></div>}
      <fieldset disabled={disabled || !snapshot.canManage || changedElsewhere}>
        <label className={styles.toggle}><input type="checkbox" checked={draft.learningEnabled} onChange={(event) => edit({ learningEnabled: event.target.checked })} /><span><strong>Remember my explicit feedback</strong><small>Opt in to retaining useful, dismissed, and accepted follow-up observations.</small></span></label>
        <label className={styles.toggle}><input type="checkbox" checked={draft.autoAdapt} onChange={(event) => edit({ autoAdapt: event.target.checked })} /><span><strong>Apply learned preferences</strong><small>Allow bounded feed ranking and unpinned follow-up defaults. Requires learning; your pinned choices win.</small></span></label>
        <label className={styles.toggle}><input type="checkbox" checked={draft.paused} onChange={(event) => edit({ paused: event.target.checked })} /><span><strong>Pause assistance</strong><small>Stop learning, adaptation, release scans, and new assisted actions. You can still read your private workspace.</small></span></label>
        <div className={styles.formGrid}><label className={styles.field}>Focus<select value={draft.focus} onChange={(event) => edit({ focus: event.target.value as EditableAdaptiveSettings['focus'] })}><option value="balanced">A balanced day</option>{adaptiveTopics.map((topic) => <option key={topic} value={topic}>{topic[0].toUpperCase() + topic.slice(1)}</option>)}</select></label><label className={styles.field}>Briefing size<input type="number" min="3" max="20" required value={draft.digestSize} onChange={(event) => edit({ digestSize: Number(event.target.value) })} /></label></div>
        <label className={styles.field}>What are you working toward?<textarea maxLength={500} rows={3} value={draft.goals} onChange={(event) => edit({ goals: event.target.value })} placeholder="Optional. A few words about what matters this week." /><small>Private goals help select relevant signals. They are never sent to public release providers.</small></label>
        <div className={styles.formGrid}><label className={styles.field}>Default follow-up interval (days)<input type="number" min="1" max="30" required value={draft.followUpDays} onChange={(event) => edit({ followUpDays: Number(event.target.value) })} /></label><label className={styles.toggle}><input type="checkbox" checked={draft.followUpPinned} onChange={(event) => edit({ followUpPinned: event.target.checked })} /><span><strong>Pin this interval</strong><small>Learning cannot change a pinned default.</small></span></label></div>
        <div className={styles.settingsDivider} />
        <label className={styles.toggle}><input type="checkbox" checked={draft.watchEnabled} onChange={(event) => edit({ watchEnabled: event.target.checked })} /><span><strong>Discover public CRM releases</strong><small>Opt in to scanning selected official public repositories, at most every six hours. No private workspace data is sent.</small></span></label>
        <div className={styles.projectList}>{snapshot.projects.map((project) => <label className={styles.project} key={project.id}><input type="checkbox" checked={draft.watchProjects.includes(project.id)} onChange={(event) => edit({ watchProjects: event.target.checked ? [...draft.watchProjects, project.id] : draft.watchProjects.filter((id) => id !== project.id) })} /><span><strong>{project.name}</strong><small>{project.repository}</small></span></label>)}</div>
        <p className={styles.small}>This page refreshes while it is open and visible. Scans with the browser closed require a separately running local watcher or an operator-deployed schedule. This page cannot verify that a runner is active.</p>
        <button className={styles.primary} type="submit">Save preferences</button>
      </fieldset>
    </form>
    <div className={styles.forget}><div><h3>A fresh start, whenever you want.</h3><p>Forget private observation memory and reset learned adaptations. Existing CRM tasks stay in your workspace. Downloaded exports are separate copies.</p></div><button disabled={disabled || !snapshot.canManage} onClick={() => setForget(!forget)} aria-expanded={forget}>Forget learning…</button></div>
    {forget && <form className={styles.correction} onSubmit={(event) => { event.preventDefault(); void onAction({ action: 'learning.forget', expectedRevision: snapshot.settings.revision, confirm }, 'Learning memory was forgotten; existing CRM tasks were kept.', () => { setForget(false); setConfirm(''); }); }}><label className={styles.field}>Type FORGET to confirm this irreversible memory reset<input value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" /></label><button className={styles.danger} disabled={disabled || !snapshot.canManage || confirm !== 'FORGET'}>Confirm forget learning</button></form>}
  </section>;
}

export function CapabilitiesPanel({ snapshot, disabled, onAction }: { snapshot: AdaptiveSnapshot; disabled: boolean; onAction: RunAction }) {
  const [expanded, setExpanded] = useState('');
  return <section aria-labelledby="capabilities-title">
    <div className={styles.sectionHead}><div><p className={styles.eyebrow}>ROOM TO GROW</p><h2 id="capabilities-title">Useful capabilities. Your call.</h2></div><span className={styles.pill}>{snapshot.packs.filter((pack) => pack.enabled).length} active</span></div>
    <p className={styles.intro}>Reviewed packs change how this workspace finds and presents signals. Each lists its effects and permissions; you can turn it off or undo its last change.</p>
    <div className={styles.packGrid}>{snapshot.packs.map((pack) => <article className={styles.pack} key={pack.id}><div className={styles.signalMeta}><span className={styles.packIcon} aria-hidden="true">✦</span><span>{pack.enabled ? 'Active' : 'Available'} · v{pack.version}</span></div><h3>{pack.title}</h3><p>{pack.description}</p><details><summary>Effects & permissions</summary><ul>{pack.effects.map((effect) => <li key={effect}>{effect}</li>)}</ul><p className={styles.small}>Permissions: {pack.permissions.length ? pack.permissions.join(', ') : 'No additional permissions'}. Bundled declarative behavior; no downloaded code executes.</p>{safeReleaseUrl(pack.sourceUrl) && <a href={safeReleaseUrl(pack.sourceUrl)} target="_blank" rel="noreferrer noopener">Review pack source ↗</a>}</details><div className={styles.packActions}><button className={pack.enabled ? styles.secondary : styles.primarySmall} disabled={disabled || !snapshot.canManage || snapshot.settings.paused} onClick={() => void onAction({ action: 'pack.set', id: pack.id, version: pack.version, enabled: !pack.enabled, expectedRevision: snapshot.settings.revision }, `${pack.title} ${pack.enabled ? 'turned off' : 'activated'}.`)}>{pack.enabled ? 'Turn off' : 'Activate pack'}</button>{pack.previousVersion !== null && <button disabled={disabled || !snapshot.canManage || snapshot.settings.paused} onClick={() => void onAction({ action: 'pack.rollback', id: pack.id, expectedRevision: snapshot.settings.revision }, `Previous state restored for ${pack.title}.`)}>Undo last change</button>}</div></article>)}</div>
    {!snapshot.packs.length && <div className={styles.empty}><h3>No bundled packs are available.</h3><p>Pack availability comes from the installed server version.</p></div>}
    <div className={styles.releaseHead}><div><p className={styles.eyebrow}>FROM THE OPEN-SOURCE COMMUNITY</p><h2>Release radar</h2></div><span className={styles.pill}>{snapshot.settings.watchEnabled ? snapshot.settings.paused ? 'Paused' : 'Opted in' : 'Off by default'}</span></div>
    <p className={styles.small}>Vendor announcements are unverified claims. Discovering a feature does not implement it or promise parity. Unmatched ideas become local proposals for a reviewed build.</p>
    {snapshot.settings.lastScanError && <p className={styles.scanWarning}>Last scan: {snapshot.settings.lastScanError}. Existing inventory is kept; check again after the server retry interval.</p>}
    <p className={styles.small}>Last scan: {snapshot.settings.lastScanAt ? date(snapshot.settings.lastScanAt) : 'No scan yet'}.{snapshot.refresh.nextScanAt ? ` Next eligible scan: ${new Date(snapshot.refresh.nextScanAt).toLocaleString()}.` : ''}</p>
    {!snapshot.releases.length && <div className={styles.empty}><span aria-hidden="true">↗</span><h3>{snapshot.settings.watchEnabled ? 'No releases in your inventory yet.' : 'A quiet radar, by choice.'}</h3><p>{snapshot.settings.watchEnabled ? 'Selected official projects will be checked when a scan is due. Nothing is installed automatically.' : 'Enable public release discovery and choose projects in Learning & controls when you want to explore.'}</p></div>}
    <div className={styles.releases}>{snapshot.releases.map((release) => {
      const proposal = snapshot.proposals.find((item) => item.releaseId === release.id && item.status === 'proposed');
      const project = snapshot.projects.find((item) => item.id === release.projectId);
      return <article className={styles.release} key={release.id}><div className={styles.releaseTop}><div><span className={styles.eyebrow}>{project?.name ?? release.projectId} · {release.version}</span><h3>{release.title}</h3><p className={styles.small}>Vendor announcement · {date(release.publishedAt)}</p></div><button aria-label={`${expanded === release.id ? 'Hide' : 'Read'} announcement: ${release.title}`} aria-expanded={expanded === release.id} onClick={() => setExpanded(expanded === release.id ? '' : release.id)}>{expanded === release.id ? 'Close' : 'Read'} <span aria-hidden="true">↗</span></button></div>{expanded === release.id && <div className={styles.releaseBody}><p className={styles.plainText}>{release.body || 'No announcement text supplied.'}</p>{safeReleaseUrl(release.url) && <a href={safeReleaseUrl(release.url)} target="_blank" rel="noreferrer noopener">Open official release ↗</a>}<p className={styles.small}>{release.suggestedPackIds.length ? `Related bundled packs: ${release.suggestedPackIds.map((id) => snapshot.packs.find((pack) => pack.id === id)?.title ?? id).join(', ')}. These are related capabilities, not an equivalence guarantee.` : 'No bundled pack has been matched. A proposal can capture the implementation work.'}</p></div>}<div className={styles.releaseFooter}>{proposal ? <span className={styles.small}>✓ Local proposal prepared</span> : <button disabled={disabled || !snapshot.canWrite || snapshot.settings.paused} onClick={() => void onAction({ action: 'proposal.create', releaseId: release.id }, 'A local implementation proposal was created. Nothing was published remotely.')}>Prepare local proposal</button>}<span className={styles.small}>No code download or installation</span></div></article>;
    })}</div>
    {snapshot.proposals.some((proposal) => proposal.status === 'proposed') && <section className={styles.proposals} aria-label="Local implementation proposals"><h3>Your local proposals</h3>{snapshot.proposals.filter((proposal) => proposal.status === 'proposed').map((proposal) => <article key={proposal.id}><div><h4>{proposal.title}</h4><p>{proposal.problem}</p><p className={styles.small}>Proposed {date(proposal.createdAt)} · Local only, no remote issue or PR</p></div><div className={styles.packActions}><button disabled={!snapshot.canExport} onClick={() => download(proposalMarkdown(proposal, snapshot.releases.find((release) => release.id === proposal.releaseId)), `crm-proposal-${proposal.id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60)}.md`)}>Download proposal</button><button disabled={disabled || !snapshot.canWrite || snapshot.settings.paused} onClick={() => void onAction({ action: 'proposal.dismiss', id: proposal.id }, 'Proposal dismissed.')}>Dismiss</button></div></article>)}</section>}
  </section>;
}

function FollowupReview({ signal, days, disabled, requestError, retrying, onRetry, onCancel, onConfirm }: { signal: AdaptiveSignal; days: number; disabled: boolean; requestError: string; retrying: boolean; onRetry?: () => void; onCancel: () => void; onConfirm: (payload: Action) => void }) {
  const [title, setTitle] = useState(signal.suggestedTask?.title ?? signal.title);
  const [dueAt, setDueAt] = useState(() => localDateTime(signal.suggestedTask?.dueAt ?? new Date(Date.now() + days * 86400000).toISOString()));
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const current = dialog.current; current?.showModal(); return () => current?.close(); }, []);
  return <dialog className={styles.dialog} ref={dialog} aria-labelledby="followup-title" onCancel={(event) => { event.preventDefault(); if (!disabled) onCancel(); }}><form onSubmit={(event) => { event.preventDefault(); try { const interval = Math.max(1, Math.min(30, Math.round((new Date(dueAt).getTime() - Date.now()) / 86400000))); onConfirm(followupPayload(signal.id, signal.fingerprint, title, dueAt, interval)); } catch (cause) { setError(message(cause)); } }}><p className={styles.eyebrow}>REVIEW BEFORE ANY ACTION</p><h2 id="followup-title">Make room for a follow-up.</h2><p>This creates one real task in your CRM. It sends no email or message. Review the evidence, title, and due date before confirming.</p><EvidenceList evidence={signal.evidence} /><fieldset disabled={disabled}><label className={styles.field}>Task title<input autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className={styles.field}>Due date and time<input type="datetime-local" required value={dueAt} onChange={(event) => setDueAt(event.target.value)} /><small>Shown in your browser’s time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Saved as an exact timestamp.</small></label><p className={styles.small}>Choose a date within the next year. When learning is enabled, the confirmed due date may inform your unpinned follow-up default.</p></fieldset>{(error || requestError) && <p className={styles.error} role="alert">{error || requestError}</p>}<div className={styles.dialogActions}><button type="button" disabled={disabled} onClick={onCancel}>Cancel</button>{onRetry ? <button type="button" className={styles.primary} disabled={retrying} onClick={onRetry}>Retry exact task request</button> : <button type="submit" className={styles.primary} disabled={disabled}>Confirm & create CRM task</button>}</div></form></dialog>;
}

export default function TodayWorkspace({ initialSnapshot = null }: { initialSnapshot?: AdaptiveSnapshot | null }) {
  const client = useMemo(() => createAdaptiveClient(), []);
  const [snapshot, setSnapshot] = useState<AdaptiveSnapshot | null>(initialSnapshot);
  const [view, setView] = useState<View>('briefing');
  const [filter, setFilter] = useState<'all' | AdaptiveSignal['topic']>('all');
  const [showFiled, setShowFiled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState<Retry | null>(null);
  const [review, setReview] = useState<AdaptiveSignal | null>(null);
  const [taskReceipt, setTaskReceipt] = useState<TaskReceipt | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AdaptiveAnswer | null>(null);
  const [asked, setAsked] = useState('');
  const [settingsGeneration, setSettingsGeneration] = useState(0);
  const working = useRef(false);
  const unresolved = useRef(false);
  const mounted = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const contextSignature = useRef('');
  const readSnapshot = useMemo(() => singleFlight((signal?: AbortSignal) => client.get<AdaptiveSnapshot>('', signal)), [client]);
  const reader = useCallback(async () => {
    try {
      const data = await readSnapshot(abort.current?.signal);
      if (mounted.current) {
        const signature = JSON.stringify([data.settings.revision, data.localAiEnabled, data.signals.map((signal) => [signal.id, signal.fingerprint, signal.state])]);
        if (contextSignature.current && signature !== contextSignature.current) { setAnswer(null); setAsked(''); }
        contextSignature.current = signature;
        setSnapshot(data); setLoadError('');
        setReview((current) => current && data.signals.some((signal) => signal.id === current.id && signal.fingerprint === current.fingerprint && signal.state !== 'actioned') ? current : null);
      }
      return data;
    } catch (cause) {
      if (mounted.current && cause instanceof AdaptiveClientError && [401, 403].includes(cause.status)) { setSnapshot(null); setAnswer(null); setAsked(''); setQuestion(''); setReview(null); }
      throw cause;
    }
  }, [readSnapshot]);

  const runAction = useCallback<RunAction>(async (payload, success, done) => {
    if (working.current) return false;
    working.current = true; setBusy(true); setError('');
    let completed = false;
    try {
      // Finish an overlapping read first, so the post-action read cannot reuse stale data.
      await reader().catch(() => undefined);
      const result = await client.post<Record<string, unknown>>(payload, abort.current?.signal);
      completed = true; unresolved.current = false;
      if (!mounted.current) return true;
      setRetry(null); setNotice(success); done?.(result);
      try { await reader(); if (payload.action === 'settings.update' || payload.action === 'learning.forget') setSettingsGeneration((value) => value + 1); } catch (cause) { setError(`Action confirmed, but the briefing could not refresh: ${message(cause)} Use Refresh briefing to reload it; the action will not be sent again.`); }
      return true;
    } catch (cause) {
      if (!mounted.current) return false;
      const definitive = cause instanceof AdaptiveClientError && cause.status >= 400 && cause.status < 500;
      if (!completed && !definitive) { unresolved.current = true; setRetry({ payload, success, done }); setError(`${message(cause)} The outcome is unknown. Retry the exact request below before starting another assisted action.`); }
      else { unresolved.current = false; setRetry(null); setError(message(cause)); if (cause instanceof AdaptiveClientError && [401, 403].includes(cause.status)) { setSnapshot(null); setAnswer(null); setAsked(''); setQuestion(''); setReview(null); setLoadError(message(cause)); } else if (cause instanceof AdaptiveClientError && cause.status === 409) void reader().catch(() => undefined); }
      return false;
    } finally { working.current = false; if (mounted.current) setBusy(false); }
  }, [client, reader]);

  const refreshOpenPage = useCallback(async () => {
    if (working.current || document.visibilityState !== 'visible') return;
    try {
      const data = await reader();
      if (!unresolved.current && data.canWrite && data.settings.watchEnabled && !data.settings.paused && data.refresh.scanStatus === 'ready') await runAction({ action: 'refresh' }, 'Release inventory checked.');
    } catch (cause) { if (mounted.current) setLoadError(message(cause)); }
  }, [reader, runAction]);

  useEffect(() => {
    mounted.current = true; abort.current = new AbortController();
    const opening = window.setTimeout(() => void refreshOpenPage(), 0);
    const timer = window.setInterval(() => void refreshOpenPage(), 60_000);
    const visible = () => { if (document.visibilityState === 'visible') void refreshOpenPage(); };
    document.addEventListener('visibilitychange', visible);
    return () => { mounted.current = false; abort.current?.abort(); window.clearTimeout(opening); window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); client.clear(); };
  }, [client, refreshOpenPage]);
  useEffect(() => {
    if (!retry) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [retry]);

  const disabled = busy || Boolean(retry);
  const actionDisabled = disabled || !snapshot?.canWrite || snapshot.settings.paused;
  const signals = snapshot?.signals.filter((signal) => (filter === 'all' || signal.topic === filter) && (showFiled || !['dismissed', 'snoozed', 'actioned'].includes(signal.state))) ?? [];
  const activeCount = snapshot?.signals.filter((signal) => !['dismissed', 'snoozed', 'actioned'].includes(signal.state)).length ?? 0;
  const feedback = (signal: AdaptiveSignal, value: 'useful' | 'dismissed' | 'snoozed' | 'new', snoozeDays?: number) => { void runAction({ action: 'feedback', signalId: signal.id, fingerprint: signal.fingerprint, value, ...(snoozeDays ? { snoozeDays } : {}) }, value === 'new' ? 'Feedback reset.' : value === 'snoozed' ? `Signal snoozed for ${snoozeDays} days.` : value === 'useful' ? 'Marked useful.' : 'Signal dismissed.'); };
  const exportPrivate = async () => {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { const data = await client.get<Record<string, unknown>>('?export=json', abort.current?.signal); download(JSON.stringify(data, null, 2), 'free-crm-private-adaptive-export.json', 'application/json'); setNotice('Private inspection JSON downloaded. Keep this copy somewhere you control.'); } catch (cause) { setError(message(cause)); } finally { working.current = false; setBusy(false); }
  };
  const ask = (event: FormEvent) => {
    event.preventDefault(); if (!question.trim()) return;
    const submitted = question.trim();
    void runAction({ action: 'ask', question: submitted }, 'Your briefing answer is ready.', (result) => { setAnswer(result as AdaptiveAnswer); setAsked(submitted); setQuestion(''); });
  };

  return <div className={styles.shell}>
    <a className={styles.skip} href="#today-main">Skip to daily briefing</a>
    <header className={styles.header}><a href="/" className={styles.brand} aria-label="FREE CRM home"><span className={styles.brandMark} aria-hidden="true">F<span>★</span></span><span>FREE <b>CRM</b><small>YOUR WORK. YOUR WORLD.</small></span></a><nav aria-label="Workspace navigation"><a href="/today" aria-current="page">Today</a><a href="/workspace">Workspace</a><a href="/brain">Second brain</a></nav><div className={styles.privateBadge}><span aria-hidden="true">●</span> Private workspace</div></header>
    <main id="today-main" className={styles.main}>
      <div className={styles.topline}><p className={styles.eyebrow}>{snapshot ? `${snapshot.workspaceName} / YOUR DAILY BRIEFING` : 'YOUR DAILY BRIEFING'}</p><span>{snapshot ? date(snapshot.refresh.generatedAt, snapshot.timezone) : 'PRIVATE BY DESIGN'}</span></div>
      <section className={styles.hero}><div><p className={styles.heroKicker}><span aria-hidden="true">✦</span> A little clarity goes a long way.</p><h1>A good day starts<br />with <em>what matters.</em></h1><p>Your relationships, your knowledge, your next move.<br className={styles.desktopBreak} /> A living briefing, with the evidence always close by.</p></div><div className={styles.heroNote}><div className={styles.noteHeading}><span aria-hidden="true">✳</span><span>ON YOUR RADAR</span></div><strong>{snapshot ? String(activeCount).padStart(2, '0') : '—'}</strong><p>{snapshot ? activeCount === 1 ? 'signal worth a look' : 'signals worth a look' : 'Gathering your private context'}</p><div className={styles.noteRule} /><span>Small steps. Stronger connections.</span></div></section>
      <div className={styles.tabRow}><nav className={styles.tabs} aria-label="Today views">{([['briefing', 'Daily briefing'], ['learning', 'Learning & controls'], ['capabilities', 'Capability library']] as const).map(([id, label]) => <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>{label}{id === 'briefing' && snapshot && <span>{activeCount}</span>}</button>)}</nav><button className={styles.refresh} disabled={busy} onClick={() => void refreshOpenPage()}>{busy ? 'Working…' : '↻ Refresh briefing'}</button></div>
      {!snapshot && !loadError && <div className={styles.loading} role="status"><span className={styles.loadingDot} /><h2>Finding the threads worth following.</h2><p>Loading your private workspace. No learning or release discovery is enabled by opening this page.</p></div>}
      {loadError && <div className={styles.error} role="alert"><strong>{snapshot ? 'The latest briefing could not load.' : 'Your private briefing is unavailable.'}</strong><p>{loadError}</p>{!snapshot && <p>Open this page from your configured private workspace. Your data will appear after authentication and database setup are available.</p>}<button onClick={() => void refreshOpenPage()} disabled={busy}>Try loading again</button><a href="/workspace">Open workspace</a></div>}
      {error && <div className={styles.error} role="alert">{error}</div>}
      {retry && <div className={styles.retry}><p>The exact request is kept only in this page’s memory. Reloading loses its retry identity; verify the workspace before repeating an uncertain action.</p><button disabled={busy} onClick={() => void runAction(retry.payload, retry.success, retry.done)}>Retry exact request</button></div>}
      {notice && <div className={styles.notice} role="status"><span>{notice}{taskReceipt && <> <a href={`/workspace?record=${encodeURIComponent(taskReceipt.recordId)}`}>Open created task ↗</a></>}</span><button aria-label="Dismiss status message" onClick={() => { setNotice(''); setTaskReceipt(null); }}>×</button></div>}
      {snapshot && <>
        {snapshot.settings.paused && <div className={styles.pauseBanner}><strong>Assistance is paused.</strong><span>Learning, adaptation, scans, and assisted actions are stopped. Your private records remain readable.</span><button disabled={disabled || !snapshot.canManage} onClick={() => void runAction({ action: 'settings.update', expectedRevision: snapshot.settings.revision, ...editableAdaptiveSettings(snapshot.settings), paused: false }, 'Assistance resumed using your saved preferences.')}>Resume</button></div>}
        {view === 'briefing' && <div className={styles.briefingGrid}>
          <section className={styles.feed} aria-labelledby="feed-title">
            <div className={styles.sectionHead}><div><p className={styles.eyebrow}>THE THREADS TO PICK UP</p><h2 id="feed-title">Your next good move.</h2></div><span className={styles.pill}>{signals.length} shown</span></div>
            <div className={styles.filters}>
              <label className={styles.filterLabel}>Focus<select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">All signals</option>{adaptiveTopics.map((topic) => <option value={topic} key={topic}>{topic[0].toUpperCase() + topic.slice(1)}</option>)}</select></label>
              <label className={styles.filed}><input type="checkbox" checked={showFiled} onChange={(event) => setShowFiled(event.target.checked)} /> Include handled signals</label>
            </div>
            {!snapshot.canWrite && <p className={styles.permission}>You have read access. Feedback and task creation require workspace write permission.</p>}
            {signals.length ? <div className={styles.signals}>{signals.map((signal) => <SignalCard key={`${signal.id}-${signal.fingerprint}`} signal={signal} disabled={actionDisabled} onFeedback={feedback} onFollowup={setReview} />)}</div> : <div className={styles.empty}>
              <span aria-hidden="true">✳</span><h3>{filter !== 'all' || showFiled ? 'No signals in this view.' : 'Some breathing room.'}</h3>
              <p>{filter !== 'all' ? 'Choose All signals to see the rest of your briefing.' : 'There are no active signals to surface. Add a note, connect a relationship, or record a task. The next refresh will look for useful threads.'}</p>
              <div className={styles.emptyLinks}><a href="/brain">Capture a thought ↗</a><a href="/workspace">Open your CRM ↗</a></div>
            </div>}
            <p className={styles.feedFoot}>Built from the current records you can access. Signals are suggestions, not proof of missed work. Last read {new Date(snapshot.refresh.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p>
          </section>
          <aside className={styles.sidebar}>
            <section className={styles.askCard} aria-labelledby="ask-title">
              <p className={styles.eyebrow}>THINK IT THROUGH</p><h2 id="ask-title">A briefing you can<br />talk to.</h2><p>Ask what needs attention, or where a signal came from.</p>
              <span className={styles.answerMode}>{snapshot.device && snapshot.localAiEnabled && !snapshot.settings.paused ? 'Local AI available · evidence included' : 'Workspace guide · no model used'}</span>
              <form onSubmit={ask}>
                <label className={styles.field}>Your question<textarea rows={4} maxLength={2000} required placeholder="What should I focus on today?" value={question} onChange={(event) => setQuestion(event.target.value)} disabled={disabled} /></label>
                <button className={styles.primary} disabled={disabled || !question.trim()}>Ask your briefing <span aria-hidden="true">↗</span></button>
              </form>
              <p className={styles.small}>Answers are read-only. Asking never creates a task or sends a message. This conversation lasts only while the page is open.</p>
              {answer && <div className={styles.conversation}><p className={styles.userQuestion}>{asked}</p><BriefingAnswer result={answer} /><button className={styles.textButton} onClick={() => { setAnswer(null); setAsked(''); }}>Clear answer</button></div>}
            </section>
            <section className={styles.controlCard}>
              <div className={styles.cardStar} aria-hidden="true">✦</div><p className={styles.eyebrow}>YOU SET THE PACE</p>
              <h3>{snapshot.settings.paused ? 'Paused means paused.' : snapshot.settings.learningEnabled ? 'A little more familiar.' : 'Your habits stay yours.'}</h3>
              <p>{snapshot.settings.learningEnabled ? 'Only feedback you deliberately give can become a remembered preference.' : 'Learning is off. Your notes, clicks, and browsing do not silently become training data.'}</p>
              <button onClick={() => setView('learning')}>Inspect learning & controls <span aria-hidden="true">↗</span></button>
              <div className={styles.controlStats}><span>{snapshot.observationCount} observations</span><span>{snapshot.settings.autoAdapt && snapshot.settings.learningEnabled && !snapshot.settings.paused ? 'Adaptation allowed' : 'Manual preferences'}</span></div>
            </section>
          </aside>
        </div>}
        {view === 'learning' && <LearningPanel key={settingsGeneration} snapshot={snapshot} disabled={disabled} onAction={runAction} onExport={() => void exportPrivate()} />}
        {view === 'capabilities' && <CapabilitiesPanel snapshot={snapshot} disabled={disabled} onAction={runAction} />}
        <footer className={styles.footer}><span>FREE CRM <span aria-hidden="true">★</span> Open source. Yours to keep.</span><span>Updates while this page is visible · no background runner status assumed</span></footer>
      </>}
    </main>
    {review && snapshot && <FollowupReview signal={review} days={snapshot.effectiveFollowUpDays} disabled={disabled || !snapshot.canWrite || snapshot.settings.paused} requestError={error} retrying={busy} onRetry={retry ? () => void runAction(retry.payload, retry.success, retry.done) : undefined} onCancel={() => { setReview(null); setError(''); }} onConfirm={(payload) => void runAction(payload, 'Your follow-up task was created in the CRM.', (result) => { setTaskReceipt(result as TaskReceipt); setReview(null); })} />}
  </div>;
}
