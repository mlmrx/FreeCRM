'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Use ordinary navigation across Vinext routes. */

import { T, LocalizedAttributes } from '@/app/localized-text';
import { useI18n } from '@/app/i18n-provider';
import { useEffect, useRef, useState } from 'react';
import { guideQuestions, recommendPath } from '@/lib/start-guide';
import { freeCrmRepositoryUrl } from '@/lib/public-config';
import styles from './start.module.css';

export default function StartGuide() {
  const { text } = useI18n();
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
    <a className="skip-link" href="#guide"><T text="Skip to guide" /></a>
    <header className={styles.header}>
      <a className={styles.brand} href="/"><span>FREE</span> CRM</a>
      <LocalizedAttributes names={["aria-label"]}><nav aria-label="Guide navigation"><a href="/tour"><T text="Take a tour" /></a><a href={freeCrmRepositoryUrl} target="_blank" rel="noopener noreferrer"><T text="GitHub ↗" /></a></nav></LocalizedAttributes>
    </header>
    <main className={styles.layout} id="guide">
      <aside className={styles.intro}>
        <p className={styles.eyebrow}><T text="A GOOD PLACE TO BEGIN" /></p>
        <h1><T text="Your work." /><br /><T text="Your people." /><br /><em><T text="Your path." /></em></h1>
        <p><T text="Let’s find a comfortable starting point for you. Three small questions, then a next step you can actually take." /></p>
        <div className={styles.facts}><span><T text="01 — Choose your work" /></span><span><T text="02 — Find your focus" /></span><span><T text="03 — Make it yours" /></span></div>
        <p className={styles.note}><T text="An interactive guide, with curated answers. No AI account needed. Your choices stay on this page and reset when you leave." /></p>
        <a href="/deploy"><T text="Already know your setup? Go straight there →" /></a>
      </aside>
      <LocalizedAttributes names={["aria-label"]}><section className={styles.conversation} aria-label="Find your FREE CRM path">
        <div className={styles.topline}><span><i aria-hidden="true" /><T text=" FREE CRM GUIDE" /></span><span>{Math.min(answers.length + 1, 3)} / 3</span></div>
        <div className={styles.progress} aria-hidden="true">{guideQuestions.map((item, index) => <i key={item.title} data-done={index <= answers.length} />)}</div>
        <p className={styles.welcome}><T text="Hi there. You don’t need to know which “edition” to choose. We’ll work it out together." /></p>
        {answers.map((answer, index) => <div className={styles.exchange} key={guideQuestions[index].title}>
          <p><T text={guideQuestions[index].title} /></p>
          <div><span><T text={guideQuestions[index].options.find((option) => option.id === answer)?.label ?? ''} /></span><button onClick={() => update(answers.slice(0, index))} aria-label={text('Change answer to {question}', { question: text(guideQuestions[index].title) })}><T text="Change" /></button></div>
        </div>)}
        <div className={styles.current}>
          {question ? <>
            <p className={styles.eyebrow}>{answers.length === 0 ? <T text="LET’S START WITH YOU" /> : answers.length === 1 ? <T text="GOT IT. NOW, YOUR DAY." /> : <T text="ONE LAST THING." />}</p>
            <h2 ref={current} tabIndex={-1}><T text={question.title} /></h2>
            <div className={styles.options}>{question.options.map((option) => <button key={option.id} onClick={() => update([...answers, option.id])}>
              <span><T text={option.label} /><i aria-hidden="true">↗</i></span><small><T text={option.detail} /></small>
            </button>)}</div>
            <button className={styles.help} aria-expanded={help} aria-controls="guide-help" onClick={() => setHelp(!help)}><T text="Help me understand " />{help ? '−' : '+'}</button>
            {help && <p id="guide-help" className={styles.helpText}>{answers.length === 0 ? <T text="Choose the description closest to your work. All paths share one open-source platform. Today, workspaces have one verified owner; team access is still being developed." /> : answers.length === 1 ? <T text="Choose the task you want help with first. This only shapes our suggestion. You can use the other CRM modules later. Agent features currently use a local simulator." /> : <T text="Local keeps the setup on your computer. Cloud needs your own provider accounts, storage, and owner sign-in; provider charges may apply. If you’re unsure, choose “Show me first”." />}</p>}
          </> : recommendation && <>
            <p className={styles.eyebrow}><T text="HERE’S YOUR STARTING POINT" /></p>
            <h2 ref={current} tabIndex={-1}><T text={recommendation.title} /></h2>
            <p><T text={recommendation.reason} /></p>
            <article className={styles.result}><div><strong><T text={recommendation.persona.name} /></strong><span><T text={recommendation.persona.delivery} /></span></div>
              <p><T text={recommendation.persona.promise} /></p><p className={styles.boundary}><T text={recommendation.persona.boundary} /></p>
              {recommendation.agentic && <p><strong><T text="With Agentic CRM:" /></strong> <T text={recommendation.agentic.boundary} /></p>}
            </article>
            <p><strong><T text="Your first small win" /></strong><br /><T text={recommendation.firstStep} /></p>
            <a className={styles.primary} href={recommendation.href}><T text={recommendation.action} /> <span aria-hidden="true">→</span></a>
            <p className={styles.note}><T text="This recommends a path; it doesn’t create or change a workspace. The software is free. Cloud infrastructure may have costs." /></p>
            <div className={styles.secondary}><a href="/platform"><T text="Compare all paths" /></a><button onClick={() => update([])}><T text="Start over" /></button></div>
          </>}
        </div>
        <noscript><p><T text="This conversation needs JavaScript. You can also " /><a href="/platform"><T text="compare profiles" /></a><T text=" or " /><a href="/deploy/readiness"><T text="read the setup checklist" /></a>.</p></noscript>
      </section></LocalizedAttributes>
    </main>
    <footer className={styles.footer}><span><T text="Open source. Yours to keep." /></span><a href="/contribute"><T text="Help make FREE CRM better ↗" /></a></footer>
  </div>;
}
