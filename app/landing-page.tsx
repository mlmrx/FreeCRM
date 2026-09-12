'use client';

import { type CSSProperties, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { freeCrmContributingUrl, freeCrmRepositoryUrl } from '@/lib/public-config';
import { LanguageSelect, useI18n } from './i18n-provider';

const phrase = [
  { text: 'Celebrate', className: 'landing-word landing-word-celebrate' },
  { text: 'Love', className: 'landing-word landing-word-love' },
  { text: 'of', className: 'landing-word landing-word-of' },
  { text: 'CRM', className: 'landing-word landing-word-crm' },
] as const;

const letterCount = phrase.reduce((count, word) => count + word.text.length, 0);

function AnimatedPhrase({ ariaLabel }: { ariaLabel: string }) {
  let index = 0;
  const letters = (text: string) => [...text].map((letter) => {
    const letterIndex = index++;
    const style = {
      '--reveal-delay': `${520 + letterIndex * 78}ms`,
      '--step-delay': `${7200 + (letterCount - letterIndex) * 145}ms`,
    } as CSSProperties;
    return <span className="landing-letter" style={style} key={`${text}-${letterIndex}`}>{letter}</span>;
  });

  return (
    <h1 id="landing-title" aria-label={ariaLabel}>
      <span className="landing-word landing-word-celebrate">{letters('Celebrate')}</span>
      <span className="landing-word landing-word-love"><em>{letters('Love')}</em></span>
      <span className="landing-final-lockup">
        <span className="landing-word landing-word-of"><em>{letters('of')}</em></span>
        <span className="landing-eagle-slot" aria-hidden="true">
          <span className="landing-gap-marker">?</span>
          <BaldEagle />
        </span>
        <span className="landing-word landing-word-crm">{letters('CRM')}</span>
      </span>
      <span className="landing-comma" aria-hidden="true">,</span>
    </h1>
  );
}

function BaldEagle() {
  return (
    <span className="eagle-flight" aria-hidden="true">
      <span className="eagle-route">
        <span className="eagle-rig">
          <span className="eagle-carriage">
            <span className="eagle-natural">
              <i className="eagle-art eagle-wing eagle-wing-left" />
              <i className="eagle-art eagle-wing eagle-wing-right" />
              <i className="eagle-art eagle-body" />
              <span className="eagle-head">
                <i className="eagle-art" />
                <span className="eagle-gaze"><i /><i /></span>
              </span>
            </span>
            <span className="eagle-banner"><b>FREE</b></span>
          </span>
        </span>
      </span>
    </span>
  );
}

const fireworks = [
  { x: '13%', y: '24%', size: 'clamp(112px, 14vw, 210px)', delay: '11.86s', color: '#bf0a30' },
  { x: '84%', y: '19%', size: 'clamp(132px, 17vw, 250px)', delay: '12.02s', color: '#002868' },
  { x: '26%', y: '67%', size: 'clamp(96px, 12vw, 184px)', delay: '12.24s', color: '#002868' },
  { x: '73%', y: '69%', size: 'clamp(106px, 14vw, 206px)', delay: '12.38s', color: '#bf0a30' },
  { x: '48%', y: '17%', size: 'clamp(84px, 10vw, 156px)', delay: '12.62s', color: '#bf0a30' },
] as const;

function LandingFireworks() {
  return (
    <span className="landing-fireworks" aria-hidden="true">
      {fireworks.map((firework, burstIndex) => (
        <span
          className="landing-firework"
          key={`${firework.x}-${firework.y}`}
          style={{
            '--firework-x': firework.x,
            '--firework-y': firework.y,
            '--firework-size': firework.size,
            '--firework-delay': firework.delay,
            '--firework-color': firework.color,
          } as CSSProperties}
        >
          {Array.from({ length: 12 }, (_, sparkIndex) => (
            <i
              key={sparkIndex}
              style={{ '--spark-angle': `${sparkIndex * 30 + burstIndex * 6}deg` } as CSSProperties}
            />
          ))}
        </span>
      ))}
    </span>
  );
}

export default function LandingPage() {
  const { t } = useI18n();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [complete, setComplete] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const infoRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (aboutOpen && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!aboutOpen && dialog.open) {
      dialog.close();
    }
  }, [aboutOpen]);

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) setPaused(true); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  function replay() {
    setPaused(false);
    setComplete(false);
    setAnimationKey((value) => value + 1);
  }

  return (
    <main className={`landing-shell${paused ? ' animation-paused' : ''}${complete ? ' animation-complete' : ''}`}>
      <div className="landing-flag-line" aria-hidden="true"><i /><i /><i /></div>

      <Link className="landing-brand" href="/" aria-label="FREE CRM home">
        <span>FREE</span> CRM
      </Link>

      <div className="landing-controls">
        <div className="landing-intro-controls" aria-label="Intro controls">
          <LanguageSelect className="landing-language-select" />
          <button className="landing-skip" type="button" onClick={() => { setPaused(false); setComplete(true); }}>{t('landing.skip')}</button>
          <button className="landing-motion-control" type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? t('landing.resume') : t('landing.pause')} aria-pressed={paused}>
            {paused ? '▶' : 'Ⅱ'}
          </button>
          <button ref={infoRef} className="landing-info" type="button" onClick={() => setAboutOpen(true)} aria-label={t('landing.about')}>i</button>
        </div>
        <nav className="landing-site-nav" aria-label={t('landing.navigation')}>
          <a href="/how-it-works">{t('landing.how')}</a>
          <Link href="/insights">{t('landing.insights')}</Link>
          <a className="landing-github-link" href={freeCrmRepositoryUrl} target="_blank" rel="noopener noreferrer" aria-label="FREE CRM open source repository on GitHub">GitHub <span aria-hidden="true">↗</span></a>
          <details className="landing-nav-menu">
            <summary>{t('landing.explore')} <span aria-hidden="true">+</span></summary>
            <div className="landing-nav-menu-panel">
              <a href="/platform"><span>{t('landing.platform')}</span><i aria-hidden="true">01</i></a>
              <a href="/tour"><span>{t('landing.tour')}</span><i aria-hidden="true">02</i></a>
              <a href="/contribute"><span>{t('landing.contribute')}</span><i aria-hidden="true">03</i></a>
              <a href="/workspace"><span>{t('landing.workspace')}</span><i aria-hidden="true">04</i></a>
            </div>
          </details>
        </nav>
      </div>

      <section className="landing-stage" aria-labelledby="landing-title">
        <div className="landing-scene" key={animationKey}>
          <LandingFireworks />
          <p className="landing-kicker">{t('landing.kicker')}</p>
          <div className="landing-wordmark">
            <AnimatedPhrase ariaLabel={t('landing.kicker')} />
            <div className="landing-trail" aria-hidden="true"><i /><i /></div>
          </div>
          <div className="landing-actions">
            <div className="landing-invitation">
              <span className="landing-cub" aria-hidden="true">
                <span className="landing-cub-lean"><i className="landing-cub-body" /><i className="landing-cub-paw" /></span>
              </span>
              <a className="landing-enter" href="/start">
                <span>{t('landing.findPath')}</span><i aria-hidden="true">→</i>
              </a>
            </div>
            <p className="landing-invitation-note">{t('landing.guidance')}</p>
          </div>
        </div>

        <div className="landing-replay-control" key={`actions-${animationKey}`}>
          <button className="landing-replay" type="button" onClick={replay}>{t('landing.replay')}</button>
        </div>
      </section>

      <p className="landing-promise">
        <a href={freeCrmRepositoryUrl} target="_blank" rel="noopener noreferrer">{t('landing.openSource')} <span aria-hidden="true">↗</span></a>
        <span>{t('landing.freeForever')}</span>
      </p>
      <p className="landing-origin">{t('landing.origin')}</p>

      <dialog
        ref={dialogRef}
        className="landing-dialog"
        aria-labelledby="about-free-crm"
        onCancel={() => setAboutOpen(false)}
        onClose={() => {
          setAboutOpen(false);
          infoRef.current?.focus();
        }}
        onMouseDown={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
          if (outside) setAboutOpen(false);
        }}
      >
        <button ref={closeRef} className="landing-dialog-close" type="button" onClick={() => setAboutOpen(false)} aria-label={t('common.close')}>×</button>
        <p>FREE CRM,</p>
        <h2 id="about-free-crm">{t('landing.customers')}<br />{t('landing.craft')}<br /><em>{t('landing.data')}</em></h2>
        <p>{t('landing.aboutBody')}</p>
        <div>
          <a href="/workspace">{t('landing.workspace')} <span>→</span></a>
          <a href="/how-it-works">{t('landing.how')} <span>→</span></a>
          <a href="/platform">{t('landing.platform')} <span>→</span></a>
          <a href="/tour">{t('landing.tour')} <span>→</span></a>
          <Link href="/insights">{t('landing.readInsights')} <span>→</span></Link>
          <a href="/deploy">{t('landing.deploy')} <span>→</span></a>
          <a href="/contribute">{t('landing.contribute')} <span>→</span></a>
          <a href={freeCrmRepositoryUrl} target="_blank" rel="noopener noreferrer">{t('landing.viewGithub')} <span>↗</span></a>
          <a href={freeCrmContributingUrl} target="_blank" rel="noopener noreferrer">{t('landing.contributionGuide')} <span>↗</span></a>
        </div>
      </dialog>
    </main>
  );
}
