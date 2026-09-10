'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { initialTourState, searchTourSections, tourAudiences, tourReducer, tourSections, type AudienceId, type TourAction } from '@/lib/tour-model';
import TourScene, { Jump } from './tour-scenes';
import styles from './tour.module.css';

export default function ProductTour() {
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
  const filtered = browsingCatalog ? searchTourSections(query) : path.map((id) => tourSections.find((item) => item.id === id)!);

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
  return <section className={styles.experience} aria-label="Synthetic workspace explorer">
    <header className={styles.intro}><div><p className={styles.label}>FREE CRM · PUBLIC PRODUCT TOUR</p><h1>Make it your kind of work.</h1><p>Explore a fictional workspace. Try the workflows. See where each path leads.</p></div><span className={styles.safeBadge}>Synthetic data only<br/><small>No sign-in or API key</small></span></header>
    <div className={styles.audienceBar} aria-label="Choose your audience">{tourAudiences.map((item) => <button type="button" key={item.id} onClick={() => chooseAudience(item.id)} aria-pressed={audienceId === item.id}>{item.label}</button>)}</div>
    <div className={styles.pathIntro}><div><span className={styles.label}>{audience.profile}</span><h2>{audience.goal}</h2><p>{audience.detail}</p></div><p className={styles.audienceBoundary}>{audience.boundary}</p></div>
    <div className={styles.workspace}>
      <aside className={styles.sidebar}><div className={styles.sidebarTop}><strong>Explore the platform</strong><label className={styles.field}><span className="sr-only">Search all tour features</span><input type="search" placeholder="Find a feature…" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100}/></label><button aria-pressed={allFeatures} className={styles.exploreToggle} onClick={() => { setAllFeatures(!allFeatures); setQuery(''); }}>{allFeatures ? 'Show my guided path' : `Explore all ${tourSections.length} areas`}</button></div><nav aria-label="Tour features">{groups.map((group) => <div key={group} className={styles.navGroup}><p>{group}</p>{filtered.filter((item) => !browsingCatalog || item.group === group).map((item) => <button key={item.id} aria-current={sectionId === item.id ? 'page' : undefined} onClick={() => go(item.id)}><span>{item.label}</span>{visited.includes(item.id) && <small aria-label="Visited">✓</small>}</button>)}</div>)}{!filtered.length && <p className={styles.empty}>No matching features. Try “invoice”, “mobile”, or “SSO”.</p>}</nav></aside>
      <div className={styles.canvas}><header className={styles.sceneHeader}><div><span className={styles.label}>{section.group}</span><h3 ref={heading} tabIndex={-1}>{section.title}</h3><p>{section.summary}</p></div><span className={`${styles.status} ${section.status !== 'Available' ? styles.preview : ''}`}>{section.status === 'Available' ? 'Available in source' : section.status}</span></header>
        <div className={styles.scene} key={`${sectionId}-${resetVersion}`}><TourScene id={sectionId} state={state} act={act} go={go}/></div>
        <div className={styles.announcement} role="status" aria-live="polite">{message || 'Explore freely. Demo actions stay in this page and reset when you reload.'}</div>
        <div className={styles.sceneGuide}><details className={styles.details}><summary>Try this walkthrough</summary><ol>{section.steps.map((step) => <li key={step}>{step}</li>)}</ol></details><details className={styles.details}><summary>What this area covers</summary><p>{section.features.join(' · ')}</p></details></div>
        <aside className={styles.boundary}><strong>In this tour & the current release</strong><p>{section.boundary}</p></aside>
        <div className={styles.related}><span>Connected work</span>{section.related.map((id) => <Jump key={id} go={go} id={id}>{tourSections.find((item) => item.id === id)!.label}</Jump>)}</div>
        <footer className={styles.pathFooter}><span>{complete} / {path.length} path areas visited</span><div>{pathIndex > 0 && <button onClick={() => go(path[pathIndex - 1])}>← Previous</button>}{pathIndex < path.length - 1 ? <button className={styles.primary} onClick={() => go(path[Math.max(0, pathIndex + 1)])}>{pathIndex < 0 ? 'Return to my path' : `Next: ${tourSections.find((item) => item.id === path[pathIndex + 1])!.label}`} →</button> : <a className={styles.primary} href="/start">Choose my own setup →</a>}</div></footer>
      </div>
    </div>
    <footer className={styles.resetBar}><p><strong>Fictional studio · nothing is saved.</strong> No customer records, provider calls, uploads, or real payments. Reset clears every demo change.</p><button onClick={() => { dispatch({ type: 'reset' }); setResetVersion((version) => version + 1); setVisited([sectionId]); setQuery(''); setMessage('Tour reset. All sample records and controls are back to their starting state.'); }}>Reset demo</button></footer>
  </section>;
}
