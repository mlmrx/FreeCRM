'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Use ordinary navigation across Vinext routes. */

import { useEffect, useRef, useState } from 'react';
import { guideQuestions, recommendPath } from '@/lib/start-guide';
import { freeCrmRepositoryUrl } from '@/lib/public-config';
import styles from './start.module.css';

export default function StartGuide() {
  const [answers, setAnswers] = useState<string[]>([]);
  const [help, setHelp] = useState(false);
  const current = useRef<HTMLHeadingElement>(null);
  const interacted = useRef(false);
  const question = guideQuestions[answers.length];
  const recommendation = recommendPath(answers);

  useEffect(() => {
    if (interacted.current) current.current?.focus();
  }, [answers]);

  function update(next: string[]) {
    interacted.current = true;
    setHelp(false);
    setAnswers(next);
  }

  return <div className={styles.shell}>
    <a className="skip-link" href="#guide">Skip to guide</a>
    <header className={styles.header}>
      <a className={styles.brand} href="/"><span>FREE</span> CRM</a>
      <nav aria-label="Guide navigation"><a href="/tour">Take a tour</a><a href={freeCrmRepositoryUrl} target="_blank" rel="noopener noreferrer">GitHub ↗</a></nav>
    </header>
    <main className={styles.layout} id="guide">
      <aside className={styles.intro}>
        <p className={styles.eyebrow}>A GOOD PLACE TO BEGIN</p>
        <h1>Your work.<br />Your people.<br /><em>Your path.</em></h1>
        <p>Let’s find a comfortable starting point for you. Three small questions, then a next step you can actually take.</p>
        <div className={styles.facts}><span>01 — Choose your work</span><span>02 — Find your focus</span><span>03 — Make it yours</span></div>
        <p className={styles.note}>An interactive guide, with curated answers. No AI account needed. Your choices stay on this page and reset when you leave.</p>
        <a href="/deploy">Already know your setup? Go straight there →</a>
      </aside>
      <section className={styles.conversation} aria-label="Find your FREE CRM path">
        <div className={styles.topline}><span><i aria-hidden="true" /> FREE CRM GUIDE</span><span>{Math.min(answers.length + 1, 3)} / 3</span></div>
        <div className={styles.progress} aria-hidden="true">{guideQuestions.map((item, index) => <i key={item.title} data-done={index <= answers.length} />)}</div>
        <p className={styles.welcome}>Hi there. You don’t need to know which “edition” to choose. We’ll work it out together.</p>
        {answers.map((answer, index) => <div className={styles.exchange} key={guideQuestions[index].title}>
          <p>{guideQuestions[index].title}</p>
          <div><span>{guideQuestions[index].options.find((option) => option.id === answer)?.label}</span><button onClick={() => update(answers.slice(0, index))} aria-label={`Change answer to ${guideQuestions[index].title}`}>Change</button></div>
        </div>)}
        <div className={styles.current}>
          {question ? <>
            <p className={styles.eyebrow}>{answers.length === 0 ? 'LET’S START WITH YOU' : answers.length === 1 ? 'GOT IT. NOW, YOUR DAY.' : 'ONE LAST THING.'}</p>
            <h2 ref={current} tabIndex={-1}>{question.title}</h2>
            <div className={styles.options}>{question.options.map((option) => <button key={option.id} onClick={() => update([...answers, option.id])}>
              <span>{option.label}<i aria-hidden="true">↗</i></span><small>{option.detail}</small>
            </button>)}</div>
            <button className={styles.help} aria-expanded={help} aria-controls="guide-help" onClick={() => setHelp(!help)}>Help me understand {help ? '−' : '+'}</button>
            {help && <p id="guide-help" className={styles.helpText}>{answers.length === 0 ? 'Choose the description closest to your work. All paths share one open-source platform. Today, workspaces have one verified owner; team access is still being developed.' : answers.length === 1 ? 'Choose the task you want help with first. This only shapes our suggestion. You can use the other CRM modules later. Agent features currently use a local simulator.' : 'Local keeps the setup on your computer. Cloud needs your own provider accounts, storage, and owner sign-in; provider charges may apply. If you’re unsure, choose “Show me first”.'}</p>}
          </> : recommendation && <>
            <p className={styles.eyebrow}>HERE’S YOUR STARTING POINT</p>
            <h2 ref={current} tabIndex={-1}>{recommendation.title}</h2>
            <p>{recommendation.reason}</p>
            <article className={styles.result}><div><strong>{recommendation.persona.name}</strong><span>{recommendation.persona.delivery}</span></div>
              <p>{recommendation.persona.promise}</p><p className={styles.boundary}>{recommendation.persona.boundary}</p>
              {recommendation.agentic && <p><strong>With Agentic CRM:</strong> {recommendation.agentic.boundary}</p>}
            </article>
            <p><strong>Your first small win</strong><br />{recommendation.firstStep}</p>
            <a className={styles.primary} href={recommendation.href}>{recommendation.action} <span aria-hidden="true">→</span></a>
            <p className={styles.note}>This recommends a path; it doesn’t create or change a workspace. The software is free. Cloud infrastructure may have costs.</p>
            <div className={styles.secondary}><a href="/platform">Compare all paths</a><button onClick={() => update([])}>Start over</button></div>
          </>}
        </div>
        <noscript><p>This conversation needs JavaScript. You can also <a href="/platform">compare profiles</a> or <a href="/deploy/readiness">read the setup checklist</a>.</p></noscript>
      </section>
    </main>
    <footer className={styles.footer}><span>Open source. Yours to keep.</span><a href="/contribute">Help make FREE CRM better ↗</a></footer>
  </div>;
}
