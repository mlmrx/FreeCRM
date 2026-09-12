'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { recordTypes } from '@/lib/crm-platform';
import { parseAgentPolicy, type AgentPolicy, type PolicyDecision } from '@/lib/agent-policy';
import { activateAgentPolicy, createPolicyEditorRequests, loadAgentPolicy, policyAfterActivation, policyDraftAfterRefresh, testAgentPolicy, type PolicySettings } from '@/lib/agent-policy-client';
import styles from './agent-policy-editor.module.css';

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function PolicyEditorFields({ draft, settings, disabled, onChange }: { draft: AgentPolicy; settings: PolicySettings; disabled: boolean; onChange: (policy: AgentPolicy) => void }) {
  const fieldId = useId();
  const set = <K extends keyof AgentPolicy>(key: K, value: AgentPolicy[K]) => onChange({ ...draft, [key]: value });
  const unavailable = draft.allowedToolIds.filter((id) => !settings.tools.some((tool) => tool.id === id));
  return <fieldset disabled={disabled} className={styles.fields}>
    <legend>Policy limits</legend>
    <fieldset><legend>Allowed local tools</legend>{settings.tools.length ? settings.tools.map((tool) => <label className={styles.check} key={tool.id}><input type="checkbox" checked={draft.allowedToolIds.includes(tool.id)} disabled={!tool.usable && !draft.allowedToolIds.includes(tool.id)} onChange={(event) => set('allowedToolIds', event.target.checked ? [...draft.allowedToolIds, tool.id] : draft.allowedToolIds.filter((id) => id !== tool.id))} /><span>{tool.name}<small>{tool.usable ? 'Current local read grant' : 'Unavailable or expired — remove or renew the grant'}</small></span></label>) : <p>No granted tools. A policy cannot create or broaden a grant.</p>}</fieldset>
    {unavailable.length > 0 && <fieldset><legend>Previously selected tools with no current grant</legend>{unavailable.map((id) => <label className={styles.check} key={id}><input type="checkbox" checked onChange={() => set('allowedToolIds', draft.allowedToolIds.filter((candidate) => candidate !== id))} /><span>{id}<small>Grant unavailable. Uncheck to remove it from this draft before saving.</small></span></label>)}</fieldset>}
    <fieldset><legend>Record types</legend><div className={styles.typeGrid}>{recordTypes.map((type) => <label className={styles.check} key={type}><input type="checkbox" checked={draft.recordScope.objectTypes.includes(type)} onChange={(event) => set('recordScope', { ...draft.recordScope, objectTypes: event.target.checked ? [...draft.recordScope.objectTypes, type] : draft.recordScope.objectTypes.filter((item) => item !== type) })} />{type}</label>)}</div></fieldset>
    <label className={styles.field}>Optional record IDs<textarea rows={3} value={draft.recordScope.recordIds?.join('\n') ?? ''} onChange={(event) => set('recordScope', { ...draft.recordScope, recordIds: event.target.value ? event.target.value.split('\n') : null })} onBlur={(event) => { const ids = event.target.value.split('\n').map((value) => value.trim()).filter(Boolean); set('recordScope', { ...draft.recordScope, recordIds: ids.length ? ids : null }); }} aria-describedby={`${fieldId}-ids`} /><small id={`${fieldId}-ids`}>One per line, up to 50. Blank means all records of the selected types in this workspace; the read limit still applies.</small></label>
    <div className={styles.grid}>
      <label className={styles.field}>Maximum records per read<input type="number" min={1} max={1000} step={1} value={Number.isFinite(draft.recordScope.maxRecords) ? draft.recordScope.maxRecords : ''} onChange={(event) => set('recordScope', { ...draft.recordScope, maxRecords: event.target.valueAsNumber })} /></label>
      <label className={styles.field}>Policy budget ceiling (cents)<input type="number" min={0} max={settings.budgetCeilingCents} step={1} value={Number.isFinite(draft.budgetCents) ? draft.budgetCents : ''} onChange={(event) => set('budgetCents', event.target.valueAsNumber)} /><small>Agent ceiling: {settings.budgetCeilingCents} cents. Already spent: {settings.spentCents} cents. This does not reset spending.</small></label>
      <label className={styles.field}>Maximum cost per action (cents)<input type="number" min={0} max={Number.isFinite(draft.budgetCents) ? draft.budgetCents : 0} step={1} value={Number.isFinite(draft.maxActionCostCents) ? draft.maxActionCostCents : ''} onChange={(event) => set('maxActionCostCents', event.target.valueAsNumber)} /></label>
      <label className={styles.field}>Require approval above this cost (cents)<input type="number" min={0} max={draft.maxActionCostCents} step={1} value={draft.approvalThresholdCents ?? ''} disabled={draft.requireApproval} onChange={(event) => set('approvalThresholdCents', event.target.value === '' ? null : event.target.valueAsNumber)} /><small>Blank adds no cost threshold. Agent autonomy and destructive-action approval still apply.</small></label>
    </div>
    <label className={styles.check}><input type="checkbox" checked={draft.requireApproval} onChange={(event) => onChange({ ...draft, requireApproval: event.target.checked, approvalThresholdCents: event.target.checked ? null : draft.approvalThresholdCents })} />Require human approval for every permitted action</label>
    <label className={styles.field}>Policy expiry (your local time)<input type="datetime-local" value={localDateTime(draft.expiresAt)} onChange={(event) => set('expiresAt', event.target.value ? new Date(event.target.value).toISOString() : null)} /><small>Blank means no policy expiry. Tool-grant expiry is always enforced separately.</small></label>
    <label className={styles.check}><input type="checkbox" checked={draft.stopped} onChange={(event) => set('stopped', event.target.checked)} />Stop new work through this policy</label>
  </fieldset>;
}

export default function AgentPolicyEditor({ agentId, safetyRevision = '', onPolicySaved }: { agentId: string; safetyRevision?: string; onPolicySaved?: () => void | Promise<void> }) {
  const [loaded, setLoaded] = useState<{ revision: string; settings: PolicySettings } | null>(null);
  const [draft, setDraft] = useState<AgentPolicy | null>(null);
  const draftOwner = useRef(agentId);
  const [pendingRevision, setPendingRevision] = useState<string | null>(null);
  const [messageRevision, setMessageRevision] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [decision, setDecision] = useState<PolicyDecision | null>(null);
  const [toolId, setToolId] = useState('');
  const [cost, setCost] = useState(0);
  const [destructive, setDestructive] = useState(false);
  const [opened, setOpened] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [requests] = useState(createPolicyEditorRequests);
  const policyExpiry = loaded?.settings.active?.policy.expiresAt;
  const draftExpiry = draft?.expiresAt;
  const expired = (value: string | null | undefined) => Boolean(value && Date.parse(value) <= clock);
  const revision = JSON.stringify([agentId, safetyRevision, expired(policyExpiry), expired(draftExpiry)]);
  // Derive visibility during render: stale safety information is never painted
  // for one frame while an effect catches up to a changed parent snapshot.
  const settings = loaded?.revision === revision ? loaded.settings : null;
  const busy = pendingRevision === revision;
  const currentMessages = messageRevision === revision;
  const panelId = useId();
  useLayoutEffect(() => {
    requests.invalidate(revision);
    return () => requests.invalidate('unmounted');
  }, [requests, revision]);
  useEffect(() => {
    const next = [policyExpiry, draftExpiry].flatMap((value) => value && Date.parse(value) > Date.now() ? [Date.parse(value)] : []);
    if (!next.length) return;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.min(Math.max(0, Math.min(...next) - Date.now() + 1), 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [policyExpiry, draftExpiry, clock]);
  const reload = useCallback(async (preserveDraft = true) => {
    const ticket = requests.begin(revision); if (!ticket) return;
    setPendingRevision(revision); setMessageRevision(revision); setError(''); setDecision(null); setNotice('');
    try {
      const current = await loadAgentPolicy(agentId);
      if (!requests.current(ticket)) return;
      const sameAgent = draftOwner.current === agentId;
      draftOwner.current = agentId;
      setLoaded({ revision, settings: current });
      setDraft((previous) => policyDraftAfterRefresh(sameAgent ? previous : null, current.draft, preserveDraft));
      setToolId((previous) => preserveDraft && current.tools.some((tool) => tool.id === previous) ? previous : current.tools[0]?.id ?? '');
    } catch (caught) { if (requests.current(ticket)) setError(caught instanceof Error ? caught.message : 'Policy could not load.'); }
    finally { if (requests.finish(ticket)) setPendingRevision(null); }
  }, [agentId, requests, revision]);
  useEffect(() => {
    let cancelled = false;
    // Defer the asynchronous refresh; visibility already follows the revision.
    void Promise.resolve().then(() => { if (opened && !cancelled) void reload(true); });
    return () => { cancelled = true; };
  }, [opened, reload]);
  async function test() {
    if (!draft || !settings) return;
    const ticket = requests.begin(revision); if (!ticket) return;
    setPendingRevision(revision); setMessageRevision(revision); setError(''); setDecision(null); setNotice('');
    try { const result = await testAgentPolicy(agentId, draft, { toolId, requestedScope: 'records:read', estimatedCostCents: cost, destructive }); if (requests.current(ticket)) setDecision(result.decision); }
    catch (caught) { if (requests.current(ticket)) setError(caught instanceof Error ? caught.message : 'Dry-run failed.'); }
    finally { if (requests.finish(ticket)) setPendingRevision(null); }
  }
  async function activate() {
    if (!draft || !settings || busy) return;
    let valid: AgentPolicy;
    try { valid = parseAgentPolicy(draft); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Invalid policy.'); return; }
    if (!window.confirm('Activate this policy version? Pending and authorized proposals for this agent will be cancelled. The agent emergency stop and autonomy remain unchanged.')) return;
    const ticket = requests.begin(revision); if (!ticket) return;
    setPendingRevision(revision); setMessageRevision(revision); setError(''); setNotice(''); setDecision(null);
    try {
      const saved = await activateAgentPolicy(agentId, valid, settings.active?.version ?? 0);
      if (!requests.current(ticket)) return;
      try {
        const verified = await policyAfterActivation(agentId, saved.active.version);
        if (!requests.current(ticket)) return;
        setLoaded({ revision, settings: verified.current }); setDraft(verified.current.draft); setNotice(verified.notice);
      } catch {
        if (!requests.current(ticket)) return;
        setLoaded(null); setDraft(saved.active.policy);
        setNotice(`Policy version ${saved.active.version} save confirmed, but the current active version could not be verified. Load the current policy before another change.`);
      }
      try { await onPolicySaved?.(); } catch { if (requests.current(ticket)) setError('Policy was saved, but the workspace could not refresh. Reload before another agent action.'); }
    } catch (caught) { if (requests.current(ticket)) setError(`${caught instanceof Error ? caught.message : 'Policy activation failed.'} Your draft has been kept. Retry the same save after an uncertain connection; reload after a version conflict.`); }
    finally { if (requests.finish(ticket)) setPendingRevision(null); }
  }
  return <details className={styles.editor} onToggle={(event) => setOpened(event.currentTarget.open)}>
    <summary>Policy &amp; dry-run</summary>
    <div className={styles.content} aria-busy={busy}>
      <h3>Decide the boundaries before the work.</h3>
      <p>Draft and test limits here. Nothing runs during dry-run. Saving activates a version and cancels earlier proposals. External execution remains disabled.</p>
      {currentMessages && error && <p className={styles.error} role="alert">{error}</p>}
      {currentMessages && notice && <p role="status">{notice}</p>}
      {!settings && draft && <p role="status">Safety information changed or could not be verified. Your draft is kept while current safety information reloads; the earlier preview is no longer valid.</p>}
      {!settings || !draft ? <button type="button" disabled={busy} onClick={() => void reload(true)}>{busy ? 'Loading policy…' : 'Load policy'}</button> : <>
        <div className={styles.heading}><strong>{settings.active ? `Active version ${settings.active.version}` : 'No authored policy yet — platform safeguards apply'}</strong><button type="button" disabled={busy} onClick={() => { if (window.confirm('Reload the latest policy and replace this unsaved draft?')) void reload(false); }}>Reload latest</button></div>
        <p className={styles.hint}>Agent: {settings.agentStatus}{settings.emergencyStopped ? ' · emergency stop active' : ''}. A policy cannot clear an emergency stop, activate an agent, add grants, or raise its budget.</p>
        <PolicyEditorFields draft={draft} settings={settings} disabled={busy} onChange={(value) => { setDraft(value); setDecision(null); setNotice(''); }} />
        <section aria-labelledby={`${panelId}-test`} className={styles.dryRun}><h4 id={`${panelId}-test`}>Try a representative proposal</h4><div className={styles.grid}>
          <label className={styles.field}>Tool<select value={toolId} disabled={busy} onChange={(event) => { setToolId(event.target.value); setDecision(null); }}>{!settings.tools.length && <option value="">No tools granted</option>}{settings.tools.map((tool) => <option value={tool.id} key={tool.id}>{tool.name}</option>)}</select></label>
          <label className={styles.field}>Estimated cost (cents)<input type="number" min={0} max={10000000} step={1} value={Number.isFinite(cost) ? cost : ''} disabled={busy} onChange={(event) => { setCost(event.target.valueAsNumber); setDecision(null); }} /></label>
        </div><label className={styles.check}><input type="checkbox" checked={destructive} disabled={busy} onChange={(event) => { setDestructive(event.target.checked); setDecision(null); }} />Treat proposal as destructive (approval is always required)</label>
          <p>Tests a local read within the draft record scope. It reads policy metadata only; it does not load record contents or execute a tool.</p>
          <button type="button" disabled={busy || !toolId} onClick={() => void test()}>Dry-run — no changes</button>
          {currentMessages && decision && <div className={styles.result} role="status"><strong>{decision.decision.replaceAll('-', ' ')}</strong><p>{decision.reason}</p><small>Matched rule: {decision.matchedRule}. No tool ran and no state was changed. This preview does not authorize a later action.</small></div>}
        </section>
        <button type="button" className={styles.activate} disabled={busy} onClick={() => void activate()}>Save and activate new version</button>
        <details className={styles.history}><summary>Recent policy history ({settings.history.length})</summary>{settings.history.length ? <ol>{settings.history.map((entry) => <li key={entry.version}>Version {entry.version} · <time dateTime={entry.createdAt}>{entry.createdAt}</time></li>)}</ol> : <p>No policy versions have been saved.</p>}<p>History is append-only. Only the latest 20 versions are listed here.</p></details>
      </>}
    </div>
  </details>;
}
