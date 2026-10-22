'use client';

import { useI18n } from '@/app/i18n-provider';
import { T, LocalizedAttributes } from '@/app/localized-text';
import { useEffect, useReducer, useRef, useState } from 'react';
import { initialTourState, searchTourSections, tourAudiences, tourReducer, tourSections, type AudienceId, type TourAction } from '@/lib/tour-model';
import TourScene, { Jump } from './tour-scenes';
import styles from './tour.module.css';

export default function ProductTour() {
  const { text } = useI18n();
  const [audienceId, setAudienceId] = useState<AudienceId>('personal');
  const [sectionId, setSectionId] = useState('overview');
  const [query, setQuery] = useState('');
  const [allFeatures, setAllFeatures] = useState(false);
  const [state, dispatch] = useReducer(tourReducer, initialTourState);
  const [message, setMessage] = useState('');
  const [visited, setVisited] = useState<string[]>(['overview']);
  const [resetVersion, setResetVersion] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);
  const audience = tourAudiences.find((item) => item.id === audienceId)!;
  const section = tourSections.find((item) => item.id === sectionId)!;
  const path: readonly string[] = audience.path;
  const pathIndex = path.indexOf(sectionId);
  const browsingCatalog = allFeatures || query.trim().length > 0;
  const filtered = browsingCatalog ? searchTourSections(query, text) : path.map((id) => tourSections.find((item) => item.id === id)!);

  useEffect(() => {
    const readHash = () => {
      const parts = window.location.hash.slice(1).split('/');
      const selectedAudience = tourAudiences.find((item) => item.id === parts[0]);
      const selectedSection = tourSections.find((item) => item.id === parts[1]);
      if (selectedAudience && selectedSection) {
        moveFocus.current = true;
        setAudienceId(selectedAudience.id); setSectionId(selectedSection.id);
        setVisited((items) => items.includes(selectedSection.id) ? items : [...items, selectedSection.id]);
      }
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, []);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, [sectionId, audienceId]);

  function go(id: string, nextAudience: AudienceId = audienceId) {
    if (!tourSections.some((item) => item.id === id)) return;
    moveFocus.current = true;
    setSectionId(id); setMessage(''); setVisited((items) => items.includes(id) ? items : [...items, id]);
    window.history.replaceState(null, '', `#${nextAudience}/${id}`);
  }
  function act(action: TourAction, announcement: string) { dispatch(action); setMessage(announcement); }
  function chooseAudience(id: AudienceId) {
    const next = tourAudiences.find((item) => item.id === id)!;
    setAudienceId(id); setQuery(''); setAllFeatures(false); go(next.path[0], id);
  }
  const groups = browsingCatalog ? [...new Set(filtered.map((item) => item.group))] : ['Your guided path'];
  const complete = path.filter((id) => visited.includes(id)).length;
  return <LocalizedAttributes names={["aria-label"]}><section className={styles.experience} aria-label="Synthetic workspace explorer">
    <header className={styles.intro}><div><p className={styles.label}><T text="FREE CRM · PUBLIC PRODUCT TOUR" /></p><h1><T text="Make it your kind of work." /></h1><p><T text="Explore a fictional workspace. Try the workflows. See where each path leads." /></p></div><span className={styles.safeBadge}><T text="Synthetic data only" /><br/><small><T text="No sign-in or API key" /></small></span></header>
    <LocalizedAttributes names={["aria-label"]}><div className={styles.audienceBar} aria-label="Choose your audience">{tourAudiences.map((item) => <button type="button" key={item.id} onClick={() => chooseAudience(item.id)} aria-pressed={audienceId === item.id}>{<T text={item.label} />}</button>)}</div></LocalizedAttributes>
    <div className={styles.pathIntro}><div><span className={styles.label}>{<T text={audience.profile} />}</span><h2>{<T text={audience.goal} />}</h2><p>{<T text={audience.detail} />}</p></div><p className={styles.audienceBoundary}>{<T text={audience.boundary} />}</p></div>
    <div className={styles.workspace}>
      <aside className={styles.sidebar}><div className={styles.sidebarTop}><strong><T text="Explore the platform" /></strong><label className={styles.field}><span className="sr-only"><T text="Search all tour features" /></span><LocalizedAttributes names={["placeholder"]}><input type="search" placeholder="Find a feature…" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100}/></LocalizedAttributes></label><button aria-pressed={allFeatures} className={styles.exploreToggle} onClick={() => { setAllFeatures(!allFeatures); setQuery(''); }}>{allFeatures ? <T text="Show my guided path" /> : <T text="Explore all {0} areas" values={{ "0": tourSections.length }} />}</button></div><LocalizedAttributes names={["aria-label"]}><nav aria-label="Tour features">{groups.map((group) => <div key={group} className={styles.navGroup}><p>{<T text={group} />}</p>{filtered.filter((item) => !browsingCatalog || item.group === group).map((item) => <button key={item.id} aria-current={sectionId === item.id ? 'page' : undefined} onClick={() => go(item.id)}><span>{<T text={item.label} />}</span>{visited.includes(item.id) && <LocalizedAttributes names={["aria-label"]}><small aria-label="Visited">✓</small></LocalizedAttributes>}</button>)}</div>)}{!filtered.length && <p className={styles.empty}><T text="No matching features. Try “invoice”, “mobile”, or “SSO”." /></p>}</nav></LocalizedAttributes></aside>
      <div className={styles.canvas}><header className={styles.sceneHeader}><div><span className={styles.label}>{<T text={section.group} />}</span><h3 ref={heading} tabIndex={-1}>{<T text={section.title} />}</h3><p>{<T text={section.summary} />}</p></div><span className={`${styles.status} ${section.status !== 'Available' ? styles.preview : ''}`}>{section.status === 'Available' ? <T text="Available in source" /> : <T text={section.status} />}</span></header>
        <div className={styles.scene} key={`${sectionId}-${resetVersion}`}><TourScene id={sectionId} state={state} act={act} go={go}/></div>
        <div className={styles.announcement} role="status" aria-live="polite"><T text={message || 'Explore freely. Demo actions stay in this page and reset when you reload.'} /></div>
        <div className={styles.sceneGuide}><details className={styles.details}><summary><T text="Try this walkthrough" /></summary><ol>{section.steps.map((step) => <li key={step}>{<T text={step} />}</li>)}</ol></details><details className={styles.details}><summary><T text="What this area covers" /></summary><p>{section.features.map((feature) => text(feature)).join(' · ')}</p></details></div>
        <aside className={styles.boundary}><strong><T text="In this tour & the current release" /></strong><p>{<T text={section.boundary} />}</p></aside>
        <div className={styles.related}><span><T text="Connected work" /></span>{section.related.map((id) => <Jump key={id} go={go} id={id}>{<T text={tourSections.find((item) => item.id === id)!.label} />}</Jump>)}</div>
        <footer className={styles.pathFooter}><span>{complete} / {path.length}<T text=" path areas visited" /></span><div>{pathIndex > 0 && <button onClick={() => go(path[pathIndex - 1])}><T text="← Previous" /></button>}{pathIndex < path.length - 1 ? <button className={styles.primary} onClick={() => go(path[Math.max(0, pathIndex + 1)])}>{pathIndex < 0 ? <T text="Return to my path" /> : <T text="Next: {0}" values={{ "0": text(tourSections.find((item) => item.id === path[pathIndex + 1])!.label) }} />} →</button> : <a className={styles.primary} href="/start"><T text="Choose my own setup →" /></a>}</div></footer>
      </div>
    </div>
    <footer className={styles.resetBar}><p><strong><T text="Fictional studio · nothing is saved." /></strong><T text=" No customer records, provider calls, uploads, or real payments. Reset clears every demo change." /></p><button onClick={() => { dispatch({ type: 'reset' }); setResetVersion((version) => version + 1); setVisited([sectionId]); setQuery(''); setMessage('Tour reset. All sample records and controls are back to their starting state.'); }}><T text="Reset demo" /></button></footer>
  </section></LocalizedAttributes>;
}
