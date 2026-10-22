/* eslint-disable @next/next/no-html-link-for-pages -- Vinext production prefetch is intentionally avoided for reliable navigation. */
import { T, LocalizedAttributes } from '@/app/localized-text';
import type { Metadata } from 'next';

import { crmLandscape } from '@/lib/crm-landscape';
import { publicPersonas } from '@/lib/public-personas';

export const metadata: Metadata = {
  title: 'One FREE CRM platform — Personal, SMB, Enterprise, and Agents',
  description: 'Explore the shared FREE CRM platform for solo operators, businesses, enterprises, Agentic CRM, and CRM for Agents—with honest delivery boundaries.',
};

export default function PlatformPage() {
  return (
    <div className="platform-shell">
      <a className="skip-link" href="#platform-content"><T text="Skip to content" /></a>
      <div className="platform-flag-line" aria-hidden="true"><i /><i /><i /></div>
      <header className="platform-header">
        <a className="platform-brand" href="/"><span>FREE</span> CRM</a>
        <LocalizedAttributes names={["aria-label"]}><nav aria-label="Platform navigation">
          <a href="/how-it-works"><T text="How it works" /></a>
          <a href="/tour"><T text="Product tour" /></a>
          <a className="platform-open" href="/deploy"><T text="Deploy " /><span>→</span></a>
        </nav></LocalizedAttributes>
      </header>

      <main id="platform-content" tabIndex={-1}>
        <section className="platform-hero" aria-labelledby="platform-title">
          <p><T text="One platform · many ways to work" /></p>
          <h1 id="platform-title"><T text="Your CRM should grow." /><br /><em><T text="Not split apart." /></em></h1>
          <div>
            <p><T text="Personal, business, and enterprise are reversible workspace profiles. Agentic CRM is a guarded capability layer across them. CRM for Agents is the actor-and-API path ahead. Every version stays in one open-source codebase." /></p>
            <a href="/start"><T text="Help me choose " /><span>→</span></a>
          </div>
        </section>

        <LocalizedAttributes names={["aria-label"]}><section className="platform-thesis" aria-label="Shared platform architecture">
          <p><T text="ONE REPOSITORY" /></p><i aria-hidden="true" /><p><T text="THREE WORKSPACE PROFILES" /></p><i aria-hidden="true" /><p><T text="ONE AGENTIC LAYER" /></p>
        </section></LocalizedAttributes>

        <section className="platform-landscape" aria-labelledby="landscape-title">
          <header>
            <p><T text="Recognize your CRM world" /></p>
            <h2 id="landscape-title"><T text="Bring what you know." /><br /><em><T text="Change the default." /></em></h2>
            <span><T text="No vendor scorecard. Just the familiar pattern—and the FREE CRM shift." /></span>
          </header>
          <div className="platform-landscape-list">
            {crmLandscape.map((item) => (
              <article key={item.id}>
                <div><span>{item.number}</span><h3><T text={item.category} /></h3></div>
                <p><small><T text="Feels familiar" /></small><T text={item.familiar} /></p>
                <i aria-hidden="true">→</i>
                <p><small><T text="The FREE CRM shift" /></small><T text={item.difference} /></p>
              </article>
            ))}
          </div>
        </section>

        <section className="platform-personas" id="personas" aria-labelledby="personas-title">
          <header>
            <p><T text="Choose the work, not a fork" /></p>
            <h2 id="personas-title"><T text="Five perspectives." /><br /><em><T text="One source of truth." /></em></h2>
          </header>
          <div className="platform-persona-list">
            {publicPersonas.map((persona) => (
              <article id={`persona-${persona.id}`} className={`platform-persona persona-${persona.id}`} key={persona.id}>
                <div className="persona-index"><span>{persona.number}</span><p><T text={persona.profile} /></p></div>
                <LocalizedAttributes names={['aria-label']}><div className="persona-visual" role="img" aria-label={persona.visualLabel}>
                  <i /><i /><i /><i />
                </div></LocalizedAttributes>
                <div className="persona-copy">
                  <div><p><T text={persona.name} /></p><span><T text={persona.delivery} /></span></div>
                  <h3><T text={persona.headline} /></h3>
                  <p><T text={persona.promise} /></p>
                  <ul>{persona.capabilities.map((capability) => <li key={capability}><T text={capability} /></li>)}</ul>
                  <aside><strong><T text="Current boundary" /></strong><span><T text={persona.boundary} /></span></aside>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="platform-next" aria-labelledby="platform-next-title">
          <p><T text="See before you install" /></p>
          <h2 id="platform-next-title"><T text="Tour a fictional workspace." /><br /><em><T text="Touch no customer data." /></em></h2>
          <div><a href="/tour"><T text="Open the read-only tour " /><span>→</span></a><a href="/deploy/readiness"><T text="Check deployment readiness" /></a></div>
        </section>
      </main>

      <footer className="platform-footer"><a href="/">FREE CRM</a><span><T text="One shared platform · no edition forks" /></span><a href="/contribute"><T text="Contribute →" /></a></footer>
    </div>
  );
}
