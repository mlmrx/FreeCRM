'use client';

import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from 'react';

const phrase = [
  { text: 'Celebrate', className: 'landing-word landing-word-celebrate' },
  { text: 'Love', className: 'landing-word landing-word-love' },
  { text: 'of', className: 'landing-word landing-word-of' },
  { text: 'CRM', className: 'landing-word landing-word-crm' },
] as const;

const letterCount = phrase.reduce((count, word) => count + word.text.length, 0);

function AnimatedPhrase() {
  let index = 0;
  return (
    <h1 id="landing-title" aria-label="Celebrate Love of CRM">
      {phrase.map((word) => {
        const letters = [...word.text].map((letter) => {
          const letterIndex = index++;
          const style = {
            '--reveal-delay': `${520 + letterIndex * 78}ms`,
            '--step-delay': `${7200 + (letterCount - letterIndex) * 145}ms`,
          } as CSSProperties;
          return <span className="landing-letter" style={style} key={`${word.text}-${letterIndex}`}>{letter}</span>;
        });
        const content = word.text === 'Love' ? <em>{letters}</em> : letters;
        return <span className={word.className} key={word.text}>{content}</span>;
      })}
      <span className="landing-comma" aria-hidden="true">,</span>
    </h1>
  );
}

function Wolf() {
  return (
    <div className="wolf-runner" aria-hidden="true">
      <div className="wolf-tail" />
      <div className="wolf-body" />
      <div className="wolf-neck" />
      <div className="wolf-head"><i /></div>
      <div className="wolf-leg wolf-leg-a"><i /></div>
      <div className="wolf-leg wolf-leg-b"><i /></div>
      <div className="wolf-leg wolf-leg-c"><i /></div>
      <div className="wolf-leg wolf-leg-d"><i /></div>
      <div className="wolf-collar" />
    </div>
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

  function trackPointer(event: PointerEvent<HTMLElement>) {
    const x = Math.max(-1, Math.min(1, event.clientX / window.innerWidth * 2 - 1));
    const y = Math.max(-1, Math.min(1, event.clientY / window.innerHeight * 2 - 1));
    event.currentTarget.style.setProperty('--pointer-x', `${x * 5}px`);
    event.currentTarget.style.setProperty('--pointer-y', `${y * 3}px`);
  }

  function replay() {
    setPaused(false);
    setComplete(false);
    setAnimationKey((value) => value + 1);
  }

  return (
    <main className={`landing-shell${paused ? ' animation-paused' : ''}${complete ? ' animation-complete' : ''}`} onPointerMove={trackPointer}>
      <div className="landing-flag-line" aria-hidden="true"><i /><i /><i /></div>

      <a className="landing-brand" href="/workspace" aria-label="Open FREE CRM">
        <span>FREE</span> CRM
      </a>

      <div className="landing-controls">
        <button className="landing-skip" type="button" onClick={() => { setPaused(false); setComplete(true); }}>Skip intro</button>
        <button className="landing-motion-control" type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? 'Resume animation' : 'Pause animation'}>
          {paused ? '▶' : 'Ⅱ'}
        </button>
        <button ref={infoRef} className="landing-info" type="button" onClick={() => setAboutOpen(true)} aria-label="About FREE CRM">i</button>
      </div>

      <section className="landing-stage" aria-labelledby="landing-title">
        <div className="landing-scene" key={animationKey}>
          <p className="landing-kicker">A customer operating system for one</p>
          <div className="landing-wordmark">
            <AnimatedPhrase />
            <div className="landing-scent" aria-hidden="true" />
            <div className="landing-trail" aria-hidden="true"><i /><i /></div>
          </div>
          <Wolf />
        </div>

        <div className="landing-actions">
          <button className="landing-replay" type="button" onClick={replay}>Replay the wolf</button>
          <a className="landing-enter" href="/workspace">
            <span>Enter FREE CRM</span><i aria-hidden="true">→</i>
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
        <p>One private place for relationships, selling, work, billing, service, documents and decisions. Open source, without a subscription.</p>
        <div>
          <a href="/workspace">Open your workspace <span>→</span></a>
          <a href="/deploy">Deploy your own <span>→</span></a>
          <a href="https://github.com/mlmrx/FreeCRM" target="_blank" rel="noreferrer">View the source <span>↗</span></a>
        </div>
      </dialog>
    </main>
  );
}
