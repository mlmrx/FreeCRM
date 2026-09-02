/* eslint-disable @next/next/no-html-link-for-pages -- Vinext production prefetch is intentionally avoided for reliable navigation. */
import type { Metadata } from 'next';

import { publicPersonas } from '@/lib/public-personas';

export const metadata: Metadata = {
  title: 'One FREE CRM platform — Personal, SMB, Enterprise, and Agents',
  description: 'Explore the shared FREE CRM platform for solo operators, businesses, enterprises, Agentic CRM, and CRM for Agents—with honest delivery boundaries.',
};

export default function PlatformPage() {
  return (
    <div className="platform-shell">
      <a className="skip-link" href="#platform-content">Skip to content</a>
      <div className="platform-flag-line" aria-hidden="true"><i /><i /><i /></div>
      <header className="platform-header">
        <a className="platform-brand" href="/"><span>FREE</span> CRM</a>
        <nav aria-label="Platform navigation">
          <a href="/how-it-works">How it works</a>
          <a href="/tour">Product tour</a>
          <a className="platform-open" href="/deploy">Deploy <span>→</span></a>
        </nav>
      </header>

      <main id="platform-content" tabIndex={-1}>
        <section className="platform-hero" aria-labelledby="platform-title">
          <p>One platform · many ways to work</p>
          <h1 id="platform-title">Your CRM should grow.<br /><em>Not split apart.</em></h1>
          <div>
            <p>Personal, business, and enterprise are reversible workspace profiles. Agentic CRM is a guarded capability layer across them. CRM for Agents is the actor-and-API path ahead. Every version stays in one open-source codebase.</p>
            <a href="#personas">Meet every profile <span>↓</span></a>
          </div>
        </section>

        <section className="platform-thesis" aria-label="Shared platform architecture">
          <p>ONE REPOSITORY</p><i aria-hidden="true" /><p>THREE WORKSPACE PROFILES</p><i aria-hidden="true" /><p>ONE AGENTIC LAYER</p>
        </section>

        <section className="platform-personas" id="personas" aria-labelledby="personas-title">
          <header>
            <p>Choose the work, not a fork</p>
            <h2 id="personas-title">Five perspectives.<br /><em>One source of truth.</em></h2>
          </header>
          <div className="platform-persona-list">
            {publicPersonas.map((persona) => (
              <article id={`persona-${persona.id}`} className={`platform-persona persona-${persona.id}`} key={persona.id}>
                <div className="persona-index"><span>{persona.number}</span><p>{persona.profile}</p></div>
                <div className="persona-visual" role="img" aria-label={persona.visualLabel}>
                  <i /><i /><i /><i />
                </div>
                <div className="persona-copy">
                  <div><p>{persona.name}</p><span>{persona.delivery}</span></div>
                  <h3>{persona.headline}</h3>
                  <p>{persona.promise}</p>
                  <ul>{persona.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
                  <aside><strong>Current boundary</strong><span>{persona.boundary}</span></aside>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="platform-next" aria-labelledby="platform-next-title">
          <p>See before you install</p>
          <h2 id="platform-next-title">Tour a fictional workspace.<br /><em>Touch no customer data.</em></h2>
          <div><a href="/tour">Open the read-only tour <span>→</span></a><a href="/deploy/readiness">Check deployment readiness</a></div>
        </section>
      </main>

      <footer className="platform-footer"><a href="/">FREE CRM</a><span>One shared platform · no edition forks</span><a href="/contribute">Contribute →</a></footer>
    </div>
  );
}
