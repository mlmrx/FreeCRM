/* eslint-disable @next/next/no-html-link-for-pages -- Vinext production prefetch is intentionally avoided for reliable navigation. */
import type { Metadata } from 'next';

import { glossaryGroups, glossaryTerms } from '@/lib/glossary';
import { freeCrmRepositoryUrl, freeCrmSiteUrl } from '@/lib/public-config';

import styles from './glossary.module.css';

const title = 'CRM Glossary — Plain-Language Terms | FREE CRM';
const description = 'Understand Customer 360, pipeline, agents, approvals, signals, and more. Plain-language definitions, current FREE CRM behavior, and links to the documentation.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${freeCrmSiteUrl}/glossary` },
  openGraph: { title, description, type: 'website', url: `${freeCrmSiteUrl}/glossary` },
  twitter: { card: 'summary', title, description },
};

export default function GlossaryPage() {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#glossary-content">Skip to glossary</a>
      <header className={styles.header}>
        <a className={styles.brand} href="/"><span>FREE</span> CRM</a>
        <nav aria-label="Glossary navigation">
          <a href="/how-it-works">How it works</a>
          <a href="/insights">Insights</a>
          <a href="/tour">Product tour</a>
        </nav>
      </header>

      <main className={styles.main} id="glossary-content" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="glossary-title">
          <p className={styles.eyebrow}>A little clarity goes a long way</p>
          <h1 id="glossary-title">Good relationships.<br /><em>Fewer mystery words.</em></h1>
          <p>A plain-language CRM glossary for people building relationships, whether this is your first contact list or your next agent-powered workflow.</p>
          <p className={styles.readingGuide}>Each of these {glossaryTerms.length} terms separates the general meaning from what FREE CRM does today. Follow the documentation for details and limits.</p>
        </section>

        <nav className={styles.alphabet} id="glossary-index" aria-label="Browse glossary by letter" tabIndex={-1}>
          {Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ', (letter) => glossaryGroups.some((group) => group.letter === letter)
            ? <a key={letter} href={`#letter-${letter.toLowerCase()}`} aria-label={`Terms beginning with ${letter}`}>{letter}</a>
            : <span key={letter} aria-hidden="true">{letter}</span>)}
        </nav>

        <div className={styles.groups}>
          {glossaryGroups.map((group) => (
            <section className={styles.group} key={group.letter} aria-labelledby={`letter-${group.letter.toLowerCase()}`}>
              <h2 id={`letter-${group.letter.toLowerCase()}`} tabIndex={-1}>{group.letter}</h2>
              <div className={styles.entries}>
                {group.terms.map((entry) => (
                  <article className={styles.entry} key={entry.id} aria-labelledby={entry.id}>
                    <h3 id={entry.id} tabIndex={-1}><a href={`#${entry.id}`}>{entry.term}</a></h3>
                    <dl>
                      <div><dt>In plain language</dt><dd>{entry.meaning}</dd></div>
                      <div><dt>In FREE CRM today</dt><dd>{entry.inFreeCrm}</dd></div>
                    </dl>
                    <a className={styles.documentation} href={`${freeCrmRepositoryUrl}/blob/main/${entry.documentation.path}`}>{entry.documentation.label}<span className={styles.visuallyHidden}> for {entry.term} (repository documentation)</span> <span aria-hidden="true">↗</span></a>
                  </article>
                ))}
              </div>
              <a className={styles.backToIndex} href="#glossary-index">Back to A–Z <span aria-hidden="true">↑</span></a>
            </section>
          ))}
        </div>

        <aside className={styles.note} aria-labelledby="glossary-note-title">
          <h2 id="glossary-note-title">Words should help. So should the product.</h2>
          <p>These definitions describe the shipped boundaries, not promises of universal interoperability or certified security. The public tour is synthetic; your installed workspace uses your own data and configuration.</p>
          <a href="/tour">See the concepts in the product tour <span aria-hidden="true">→</span></a>
        </aside>
      </main>

      <footer className={styles.footer}>
        <a href="/">FREE CRM</a>
        <p>Original definitions. Open to correction.</p>
        <a href="/contribute">Help make this clearer</a>
      </footer>
    </div>
  );
}
