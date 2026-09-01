'use client';

import { type CSSProperties, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { freeCrmContributingUrl, freeCrmRepositoryUrl } from '@/lib/public-config';

const phrase = [
  { text: 'Celebrate', className: 'landing-word landing-word-celebrate' },
  { text: 'Love', className: 'landing-word landing-word-love' },
  { text: 'of', className: 'landing-word landing-word-of' },
  { text: 'CRM', className: 'landing-word landing-word-crm' },
] as const;

const letterCount = phrase.reduce((count, word) => count + word.text.length, 0);

function AnimatedPhrase() {
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
    <h1 id="landing-title" aria-label="Celebrate Love of FREE CRM">
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
      <span className="eagle-rig">
        <span className="eagle-carriage">
          <span className="eagle-search-trail"><i /><i /><i /></span>
          <span className="eagle-sprite-stack">
            <i className="eagle-frame eagle-frame-1" />
            <i className="eagle-frame eagle-frame-2" />
            <i className="eagle-frame eagle-frame-3" />
            <i className="eagle-frame eagle-frame-4" />
          </span>
          <span className="eagle-banner"><b>FREE</b></span>
        </span>
      </span>
    </span>
  );
}

export default function LandingPage() {
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
        <button className="landing-skip" type="button" onClick={() => { setPaused(false); setComplete(true); }}>Skip intro</button>
        <button className="landing-motion-control" type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? 'Resume animation' : 'Pause animation'} aria-pressed={paused}>
          {paused ? '▶' : 'Ⅱ'}
        </button>
        <button ref={infoRef} className="landing-info" type="button" onClick={() => setAboutOpen(true)} aria-label="About FREE CRM">i</button>
        <nav className="landing-site-nav" aria-label="FREE CRM navigation">
          <a href="/how-it-works">How it works</a>
          <Link href="/insights">Insights</Link>
          <a href="/workspace">Owner sign in</a>
          <a href="/contribute">Contribute</a>
          <a href={freeCrmRepositoryUrl} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
        </nav>
      </div>

      <section className="landing-stage" aria-labelledby="landing-title">
        <div className="landing-scene" key={animationKey}>
          <p className="landing-kicker">A customer operating system for one</p>
          <div className="landing-wordmark">
            <AnimatedPhrase />
            <div className="landing-trail" aria-hidden="true"><i /><i /></div>
          </div>
        </div>

        <div className="landing-actions" key={`actions-${animationKey}`}>
          <button className="landing-replay" type="button" onClick={replay}>Replay the eagle</button>
          <a className="landing-enter" href="/deploy">
            <span>Deploy FREE CRM</span><i aria-hidden="true">→</i>
          </a>
        </div>
      </section>

      <p className="landing-promise">Free for all. Free forever.</p>
      <p className="landing-origin">Built in California · yours everywhere</p>

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
        <button ref={closeRef} className="landing-dialog-close" type="button" onClick={() => setAboutOpen(false)} aria-label="Close">×</button>
        <p>FREE CRM,</p>
        <h2 id="about-free-crm">Your customers.<br />Your craft.<br /><em>Your data.</em></h2>
        <p>One private place for relationships, selling, work, billing, service, documents and decisions. Open source, without a subscription. Help improve the code, documentation, tests, or accessibility through a focused pull request.</p>
        <div>
          <a href="/workspace">Open your workspace <span>→</span></a>
          <a href="/how-it-works">See how it works <span>→</span></a>
          <Link href="/insights">Read FREE CRM Insights <span>→</span></Link>
          <a href="/deploy">Deploy your own <span>→</span></a>
          <a href="/contribute">How to contribute <span>→</span></a>
          <a href={freeCrmRepositoryUrl} target="_blank" rel="noopener noreferrer">View on GitHub <span>↗</span></a>
          <a href={freeCrmContributingUrl} target="_blank" rel="noopener noreferrer">Contribution guide <span>↗</span></a>
        </div>
      </dialog>
    </main>
  );
}
