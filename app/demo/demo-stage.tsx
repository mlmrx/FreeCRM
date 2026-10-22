'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Presentation links intentionally open separate full-navigation tabs. */
import { useI18n } from '@/app/i18n-provider';
import { T, LocalizedAttributes } from '@/app/localized-text';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { chapterFromHash, demoChapters, demoFeatures, demoHref, demoKeyboardAction, filterDemoFeatures, normalizeDemoOrigin } from '@/lib/demo-content';
import styles from './demo.module.css';

export function DemoVisual({ chapter, onChapter }: { chapter: number; onChapter: (index: number) => void }) {
  if (chapter === 0) return <div className={styles.systemMap}>
    <div className={styles.visualEyebrow}><T text="ONE SHARED PLATFORM" /></div>
    <div className={styles.orbit} aria-hidden="true"><i /><i /><i /></div>
    <div className={styles.mapCore}><span>FREE</span><strong>CRM</strong><small><T text="YOURS TO KEEP." /></small></div>
    {[[1, 'Relationships', 'The people'], [3, 'Second brain', 'The knowledge'], [4, 'Adaptive CRM', 'The next move'], [2, 'Operations', 'The business'], [5, 'Agent plane', 'The guardrails'], [7, 'Ownership', 'The foundation']].map(([index, title, label], position) => <button key={index} className={`${styles.mapNode} ${styles[`node${position}`]}`} onClick={() => onChapter(Number(index))}><span>{<T text={String(label)} />}</span><strong>{<T text={String(title)} />}</strong><b aria-hidden="true">↗</b></button>)}
    <div className={styles.mapLegend}><span><T text="12 CRM modules" /></span><i /><span><T text="One second brain" /></span><i /><span><T text="Your infrastructure" /></span></div>
  </div>;
  if (chapter === 1) return <div className={styles.customerVisual}><div className={styles.visualEyebrow}><T text="RELATIONSHIP, IN CONTEXT" /></div><div className={styles.person}><span><T text="AL" /></span><div><h3><T text="Alex Lee" /></h3><p><T text="Northstar Studio · Founder" /></p></div><b><T text="Customer" /></b></div><div className={styles.customerGrid}><div><small><T text="OPPORTUNITY" /></small><strong><T text="Studio launch" /></strong><span><T text="Proposal under review" /></span></div><div><small><T text="NEXT STEP" /></small><strong><T text="Share the outline" /></strong><span><T text="Explicitly reviewed follow-up" /></span></div></div><div className={styles.timeline}>{[['A conversation', 'A note captures what matters to Alex.'], ['A connection', 'The note links to the launch opportunity.'], ['A commitment', 'A task preserves the next agreed step.']].map(([title, text], index) => <div key={title}><b>0{index + 1}</b><p><strong>{<T text={title} />}</strong><span>{<T text={text} />}</span></p></div>)}</div><p className={styles.visualCaption}><T text="Illustrative relationship · synthetic data" /></p></div>;
  if (chapter === 2) return <div className={styles.businessVisual}><div className={styles.visualEyebrow}><T text="THE RELATIONSHIP LIFECYCLE" /></div><div className={styles.lifecycle}>{['Lead', 'Opportunity', 'Quote', 'Invoice'].map((title, index) => <div key={title}><span>0{index + 1}</span><strong>{<T text={title} />}</strong>{index < 3 && <b aria-hidden="true">→</b>}</div>)}</div><div className={styles.moduleBoard}>{['Leads', 'Contacts', 'Companies', 'Opportunities', 'Activities', 'Tasks', 'Campaigns', 'Products', 'Quotes', 'Invoices', 'Tickets', 'Documents'].map((title, index) => <div key={title}><span>{String(index + 1).padStart(2, '0')}</span>{<T text={title} />}</div>)}</div><div className={styles.visualBottom}><strong><T text="One operational picture." /></strong><span><T text="Pipeline · revenue · aging · service" /></span></div></div>;
  if (chapter === 3) return <div className={styles.brainVisual}><div className={styles.visualEyebrow}><T text="YOUR KNOWLEDGE, CONNECTED" /></div><div className={styles.knowledgeGraph}><svg viewBox="0 0 600 260" aria-hidden="true"><path d="M300 130L110 48M300 130L480 48M300 130L105 205M300 130L490 205M110 48L105 205M480 48L490 205" /></svg><span className={styles.graphCenter}><T text="Launch idea" /><small><T text="Saved source" /></small></span><span className={styles.graphA}><T text="Meeting notes" /><small><T text="What we discussed" /></small></span><span className={styles.graphB}><T text="Alex Lee" /><small><T text="CRM contact" /></small></span><span className={styles.graphC}><T text="Research" /><small><T text="Supporting context" /></small></span><span className={styles.graphD}><T text="Opportunity" /><small><T text="Connected work" /></small></span></div><div className={styles.answerExample}><p><T text="“What did I promise Alex?”" /></p><div><b>01</b><span><T text="Review the launch outline together." /><small><T text="Source: meeting notes · inspect the evidence" /></small></span></div></div><p className={styles.visualCaption}><T text="Illustrative graph and answer · connections are explicit" /></p></div>;
  if (chapter === 4) return <div className={styles.adaptiveVisual}><div className={styles.visualEyebrow}><T text="A DAILY BRIEFING WITH RECEIPTS" /></div><div className={styles.signalExample}><span><T text="POSSIBLE COMMITMENT · VERIFY FIRST" /></span><h3><T text="A small promise." /><br /><T text="A useful next step." /></h3><p><T text="“I will share the launch outline.”" /></p><div><b><T text="Why this appears" /></b><span><T text="Explicit future language in your saved note." /></span></div></div><div className={styles.learningLoop}>{['Evidence', 'Your feedback', 'Bounded adaptation'].map((label, index) => <div key={label}><i>{String(index + 1).padStart(2, '0')}</i><span>{<T text={label} />}</span></div>)}</div><div className={styles.controlChips}><span><T text="Inspect" /></span><span><T text="Pin" /></span><span><T text="Pause" /></span><span><T text="Forget" /></span></div><p className={styles.visualCaption}><T text="Illustrative signal · learning starts off" /></p></div>;
  if (chapter === 5) return <div className={styles.agentVisual}><div className={styles.visualEyebrow}><T text="AUTHORITY IS NEVER IMPLIED" /></div><div className={styles.agentFlow}>{[['Propose', 'An agent prepares a bounded action.'], ['Evaluate', 'Scope, grants, expiry, and budget.'], ['Approve', 'A human decision, where required.'], ['Execute & record', 'Local simulation, with a durable receipt.']].map(([title, text], index) => <div key={title}><span>{index === 2 ? '✓' : `0${index + 1}`}</span><p><strong>{<T text={title} />}</strong><small>{<T text={text} />}</small></p>{index === 2 && <b><T text="HUMAN GATE" /></b>}</div>)}</div><div className={styles.stopRule}><span aria-hidden="true">■</span><strong><T text="Emergency stop" /></strong><p><T text="Revoke executable work." /></p></div></div>;
  if (chapter === 6) return <div className={styles.connectionsVisual}><div className={styles.visualEyebrow}><T text="PORTABILITY IS A PRODUCT FEATURE" /></div><div className={styles.transfer}><div><small><T text="BRING IN" /></small><strong>CSV</strong><p><T text="Preview → validate → commit" /></p></div><span aria-hidden="true">⇄</span><div><small><T text="TAKE OUT" /></small><strong><T text="Your data" /></strong><p><T text="CSV · JSON · calendar ICS" /></p></div></div><div className={styles.connectionRows}><div><span><T text="Reference connector" /></span><b><T text="Cursor + replay protection" /></b></div><div><span><T text="Authenticated webhooks" /></span><b><T text="Device / Cloudflare" /></b></div><div><span><T text="Email & calendar OAuth" /></span><b className={styles.mutedBadge}><T text="Roadmap—not connected" /></b></div></div><p className={styles.visualCaption}><T text="Connection states are explicit. No pretend sync." /></p></div>;
  if (chapter === 7) return <div className={styles.ownershipVisual}><div className={styles.visualEyebrow}><T text="CHOOSE WHERE YOUR WORK LIVES" /></div><div className={styles.hostingChoices}>{[['01', 'Your device', 'Local SQLite + files', 'No cloud account'], ['02', 'Your container', 'Docker deployment', 'Portable runtime'], ['03', 'Your cloud', 'Own identity + storage', 'Own credentials']].map(([number, title, detail, foot]) => <div key={number}><span>{number}</span><h3>{<T text={title} />}</h3><p>{<T text={detail} />}</p><small>{<T text={foot} />}</small></div>)}</div><div className={styles.planes}>{['Control plane', 'Data plane', 'Integration plane', 'Agent plane'].map((plane) => <span key={plane}>{<T text={plane} />}</span>)}</div><p className={styles.visualCaption}><T text="Open-source software. Infrastructure costs depend on your choices." /></p></div>;
  if (chapter === 8) return <div className={styles.profilesVisual}><div className={styles.visualEyebrow}><T text="A SHARED FOUNDATION" /></div>{[['Personal / solo', 'Operating focus'], ['SMB / business', 'Foundation available'], ['Enterprise', 'Architecture preview']].map(([title, state], index) => <div className={styles.profileRow} key={title}><span>0{index + 1}</span><strong>{<T text={title} />}</strong><small>{<T text={state} />}</small></div>)}<div className={styles.profileLayer}><strong><T text="Agentic capability layer" /></strong><span><T text="Across profiles · guarded local preview" /></span></div><div className={styles.profileFuture}><span><T text="CRM for Agents" /></span><small><T text="Actor + API research path" /></small></div><p className={styles.visualCaption}><T text="One repository. Current release is single-owner." /></p></div>;
  return <div className={styles.openVisual}><div className={styles.visualEyebrow}><T text="A DIFFERENT KIND OF DEFAULT" /></div><div className={styles.openType}>FREE<span><T text="as in freedom." /></span></div><div className={styles.openPillars}>{[['Read it.', 'Source you can inspect.'], ['Run it.', 'Infrastructure you control.'], ['Improve it.', 'A community you can join.']].map(([title, detail]) => <div key={title}><strong>{<T text={title} />}</strong><span>{<T text={detail} />}</span></div>)}</div><p className={styles.openFooter}><T text="MIT LICENSED " /><i /><T text=" OPEN SOURCE " /><i /><T text=" YOURS TO KEEP" /></p></div>;
}

export default function DemoStage() {
  const { locale, text } = useI18n();
  const [active, setActive] = useState(0);
  const [notes, setNotes] = useState(false);
  const [atlas, setAtlas] = useState(false);
  const [setup, setSetup] = useState(false);
  const [origin, setOrigin] = useState('');
  const [draftOrigin, setDraftOrigin] = useState('');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');
  const [notice, setNotice] = useState('');
  const [originError, setOriginError] = useState('');
  const [full, setFull] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const chapter = demoChapters[active];
  const choose = useCallback((index: number) => {
    const next = Math.max(0, Math.min(demoChapters.length - 1, index));
    setActive(next); window.history.replaceState(null, '', `#${demoChapters[next].id}`);
  }, []);
  useEffect(() => {
    const sync = () => setActive(chapterFromHash(window.location.hash));
    const opening = window.setTimeout(sync, 0);
    window.addEventListener('hashchange', sync);
    return () => { window.clearTimeout(opening); window.removeEventListener('hashchange', sync); };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (atlas || setup || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))) return;
      const action = demoKeyboardAction(event.key);
      if (action) event.preventDefault();
      if (action === 'next') choose(active + 1);
      if (action === 'previous') choose(active - 1);
      if (action === 'notes') setNotes((value) => !value);
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [active, atlas, setup, choose]);
  useEffect(() => {
    if (atlas || setup) dialog.current?.showModal();
    else dialog.current?.close();
  }, [atlas, setup]);
  useEffect(() => {
    const changed = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', changed); return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const present = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else setNotice('Fullscreen is unavailable here. Use your browser’s fullscreen or presentation controls.'); }
    catch { setNotice('Fullscreen was not allowed. The presentation still works in this tab.'); }
  };
  const filtered = filterDemoFeatures(query, group, text);
  const close = () => { setAtlas(false); setSetup(false); };
  const saveOrigin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const safe = normalizeDemoOrigin(draftOrigin);
    if (safe === null) {
      setOriginError('Use an HTTPS installation origin or a literal loopback HTTP address, without paths or credentials.');
      return;
    }
    setOrigin(safe); setOriginError(''); close();
    setNotice(safe ? text('Live product links now open {origin}.', {origin: safe}) : text('Live links now open this installation.'));
  };
  return <div className={styles.shell} style={{ '--chapter-progress': `${(active + 1) / demoChapters.length * 100}%` } as CSSProperties}>
    <a href="#demo-stage" className={styles.skip}><T text="Skip to presentation" /></a>
    <header className={styles.header}>
      <a href="/" className={styles.brand}><b>FREE</b> CRM<span><T text="THE OPEN PLATFORM" /></span></a>
      <div className={styles.edition}><span><T text="THE PLATFORM DEMO" /></span><i /><T text=" TEN CHAPTERS. ONE CONNECTED WORLD." /></div>
      <LocalizedAttributes names={["aria-label"]}><nav aria-label="Presentation controls"><button onClick={() => { setAtlas(true); setSetup(false); }}><T text="Feature atlas " /><span>↗</span></button><button className={styles.present} onClick={() => void present()}>{full ? <T text="Exit full screen" /> : <T text="Present" />} <span aria-hidden="true">⛶</span></button></nav></LocalizedAttributes>
    </header>
    <main id="demo-stage" className={styles.stage} tabIndex={-1}>
      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">{text('Chapter {number} of {count}: {title}', { number: (active + 1).toLocaleString(locale), count: demoChapters.length.toLocaleString(locale), title: text(chapter.label) })}</p>
      <div className={styles.sceneTop}><span><T text="FREE CRM / " /><b>{<T text={chapter.eyebrow} />}</b></span><span className={styles.sceneNumber}>{(active + 1).toLocaleString(locale, { minimumIntegerDigits: 2 })} <i>/</i> {demoChapters.length.toLocaleString(locale)}</span></div>
      <section className={styles.scene} aria-label={text('Chapter {number}: {title}', {number: active + 1, title: text(chapter.label)})} key={chapter.id}>
        <div className={styles.story}>
          <div className={styles.chapterTag}><span />{<T text={chapter.label} />}</div>
          <h1>{<T text={chapter.title} />}<br /><em>{<T text={chapter.accent} />}</em></h1>
          <p className={styles.description}>{<T text={chapter.description} />}</p>
          <ol className={styles.points}>{chapter.points.map((point, index) => <li key={point}><span>{String(index + 1).padStart(2, '0')}</span>{<T text={point} />}</li>)}</ol>
          <div className={styles.launchRow}><a className={styles.launch} href={demoHref(chapter.route, origin)} target="_blank" rel="noopener noreferrer">{<T text={chapter.launch} />}<span aria-hidden="true">↗</span><span className={styles.srOnly}><T text=" (opens in a new tab)" /></span></a><span><T text="New tab." /><br /><T text="Your story stays here." /></span></div>
        </div>
        <div className={styles.visual}><DemoVisual chapter={active} onChapter={choose} /></div>
      </section>
      <div className={styles.truth}><span><T text="GOOD TO KNOW" /></span><p>{<T text={chapter.boundary} />}</p></div>
      {notes && <LocalizedAttributes names={["aria-label"]}><aside className={styles.presenterNotes} aria-label="Presenter notes"><div><span><T text="SAY IT LIKE THIS" /></span><p>{<T text={chapter.note} />}</p></div><ol>{chapter.steps.map((step) => <li key={step}>{<T text={step} />}</li>)}</ol><small><T text="These notes are visible to everyone seeing this screen. Press N to hide." /></small></aside></LocalizedAttributes>}
    </main>
    <footer className={styles.footer}>
      <div className={styles.chapterTrack}><LocalizedAttributes names={["aria-label"]}><button className={styles.arrow} disabled={active === 0} onClick={() => choose(active - 1)} aria-label="Previous chapter">←</button></LocalizedAttributes><LocalizedAttributes names={["aria-label"]}><nav aria-label="Demo chapters">{demoChapters.map((item, index) => <button key={item.id} onClick={() => choose(index)} aria-current={active === index ? 'step' : undefined}><span>{String(index + 1).padStart(2, '0')}</span><b>{<T text={item.label} />}</b></button>)}</nav></LocalizedAttributes><LocalizedAttributes names={["aria-label"]}><button className={styles.arrow} disabled={active === 9} onClick={() => choose(active + 1)} aria-label="Next chapter">→</button></LocalizedAttributes></div>
      <div className={styles.utility}><div><span className={styles.openSourceMark}>★</span><a href="https://github.com/mlmrx/FreeCRM" target="_blank" rel="noopener noreferrer"><T text="OPEN SOURCE. YOURS TO KEEP. ↗" /></a></div><div><button aria-pressed={notes} onClick={() => setNotes(!notes)}><T text="Presenter notes " /><kbd>N</kbd></button><button onClick={() => { setSetup(true); setAtlas(false); setDraftOrigin(origin); setOriginError(''); }}><T text="Live links " /><span>⚙</span></button><span className={styles.keyboardHint}><T text="Navigate " /><kbd>←</kbd> <kbd>→</kbd></span></div></div>
    </footer>
    {notice && <div className={styles.notice} role="status"><T text={notice} /><LocalizedAttributes names={["aria-label"]}><button onClick={() => setNotice('')} aria-label="Dismiss notification">×</button></LocalizedAttributes></div>}
    <dialog ref={dialog} className={styles.dialog} onCancel={close} onClose={close} aria-labelledby="demo-dialog-title">
      {setup && originError && <p className={styles.formError} id="demo-origin-error" role="alert"><T text={originError} /></p>}
      <header><div><span><T text="YOUR DEMO COMPANION" /></span><h2 id="demo-dialog-title">{atlas ? <T text="The complete feature atlas." /> : <T text="Set the stage." />}</h2></div><LocalizedAttributes names={["aria-label"]}><button onClick={close} aria-label="Close dialog">×</button></LocalizedAttributes></header>
      {atlas ? <>
        <p className={styles.dialogIntro}><T text="The entire platform, with honest delivery labels. Every link opens a new tab. Private destinations use that installation’s normal sign-in." /></p>
        <div className={styles.atlasFilters}>
          <label><T text="Find a feature" /><LocalizedAttributes names={["placeholder"]}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try invoices, knowledge, agents…" maxLength={100} /></LocalizedAttributes></label>
          <label><T text="Category" /><select value={group} onChange={(event) => setGroup(event.target.value)}>{['All', ...new Set(demoFeatures.map((feature) => feature.group))].map((item) => <option key={item} value={item}>{<T text={item} />}</option>)}</select></label>
          <span role="status">{text(filtered.length === 1 ? '{count} feature' : '{count} features', { count: filtered.length.toLocaleString(locale) })}</span>
        </div>
        <div className={styles.featureGrid}>{filtered.map((feature) => <article key={feature.name}>
          <div><span>{<T text={feature.group} />}</span><b data-status={feature.status}>{<T text={feature.status} />}</b></div>
          <h3>{<T text={feature.name} />}</h3><p>{<T text={feature.description} />}</p>
          <a href={demoHref(feature.route, origin)} target="_blank" rel="noopener noreferrer">{feature.status === 'Roadmap' ? <T text="See current boundaries" /> : <T text="Explore feature" />} ↗<span className={styles.srOnly}><T text=" (opens in a new tab)" /></span></a>
        </article>)}</div>
        {!filtered.length && <p className={styles.noResults}><T text="No matching features. Try another word or choose All." /></p>}
      </> : <form onSubmit={saveOrigin}>
        <p className={styles.dialogIntro}><T text="Keep this page on your shared screen. Open the product in separate tabs, demonstrate a feature, then return to the same chapter." /></p>
        <label className={styles.originField}><T text="Live installation URL" /><LocalizedAttributes names={["placeholder"]}><input type="text" inputMode="url" value={draftOrigin} onChange={(event) => { setDraftOrigin(event.target.value); setOriginError(''); }} aria-invalid={Boolean(originError)} aria-describedby={originError ? 'demo-origin-error' : undefined} placeholder="Leave blank to use this installation" maxLength={300} /></LocalizedAttributes>
          <small><T text="Examples: http://127.0.0.1:3485 or your HTTPS cloud domain. This changes links only; no credentials are sent or stored." /></small>
        </label>
        <div className={styles.setupChecks}>
          <h3><T text="Before you share" /></h3>
          <p><T text="01 &nbsp; Use synthetic records in the live workspace. This deck never loads private data." /></p>
          <p><T text="02 &nbsp; Sign in to the target installation in another tab. Check that Brain and Today are installed." /></p>
          <p><T text="03 &nbsp; Test Ollama separately if you want a local-AI demo. The source-search path needs no model." /></p>
          <p><T text="04 &nbsp; Hide presenter notes and desktop notifications. Nothing is reset or seeded by this page." /></p>
        </div>
        <button type="submit" className={styles.save}><T text="Save live links " /><span>↗</span></button>
        <p className={styles.sessionOnly}><T text="This setting lasts only in this tab. Reloading resets it. Public GitHub links always keep their original destination." /></p>
      </form>}
    </dialog>
  </div>;
}
