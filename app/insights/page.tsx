/* eslint-disable @next/next/no-html-link-for-pages -- Vinext production prefetch is intentionally avoided for reliable navigation. */
import { T, LocalizedAttributes, LocalizedDate } from '@/app/localized-text';
import type { Metadata } from 'next';

import { crmFaqs, listEditorialArticlesNewestFirst } from '@/lib/editorial-content';
import { freeCrmRepositoryUrl } from '@/lib/public-config';

export const metadata: Metadata = {
  title: 'FREE CRM Insights — Open CRM, Agentic CRM, and CRM for Agents',
  description: 'Original essays, practical guides, sourced CRM news, research notes, and FAQs celebrating open-source and free CRM.',
};

const newestArticles = listEditorialArticlesNewestFirst();
const featured = newestArticles.find((article) => article.featured) ?? newestArticles[0];
const newsBriefs = newestArticles.filter((article) => article.kind === 'News brief');
const library = newestArticles.filter((article) => article.slug !== featured.slug && article.kind !== 'News brief');

export default function InsightsPage() {
  return (
    <div className="insights-shell">
      <a className="skip-link" href="#insights-content"><T text="Skip to insights" /></a>
      <div className="insights-flag-line" aria-hidden="true"><i /><i /><i /></div>
      <header className="insights-header">
        <a className="insights-brand" href="/"><span>FREE</span> CRM</a>
        <LocalizedAttributes names={["aria-label"]}><nav aria-label="Insights navigation">
          <a href="/"><T text="Home" /></a>
          <a href="#latest"><T text="Latest" /></a>
          <a href="#faq"><T text="FAQs" /></a>
          <a href="/contribute"><T text="Contribute" /></a>
          <a className="insights-open" href="/deploy"><T text="Deploy " /><span>→</span></a>
        </nav></LocalizedAttributes>
      </header>

      <main id="insights-content" tabIndex={-1}>
        <section className="insights-hero" aria-labelledby="insights-title">
          <div>
            <p><T text="Ideas for relationship builders" /></p>
            <h1 id="insights-title"><T text="Celebrate open." /><br /><em><T text="Question everything." /></em></h1>
          </div>
          <div className="insights-hero-copy">
            <p><T text="Original essays, field guides, sourced news, research notes, and plain-language answers about CRM—especially the parts that become more important when humans and agents work together." /></p>
            <div className="insights-cadence"><i aria-hidden="true" /><span><strong><T text="Living publication" /></strong><T text="Fresh research and commentary every six hours" /></span></div>
          </div>
        </section>

        <section className="insights-feature" aria-labelledby="featured-insight-title">
          <div className="insights-feature-number" aria-hidden="true">01</div>
          <div>
            <p>{<T text={featured.kind} />} · {<T text={featured.category} />}</p>
            <h2 id="featured-insight-title">{<T text={featured.title} />}</h2>
          </div>
          <div>
            <p>{<T text={featured.description} />}</p>
            <span><LocalizedDate date={featured.publishedAt} /> · {featured.readMinutes}<T text=" min read" /></span>
            <a href={`/insights/${featured.slug}`}><T text="Read the manifesto " /><b>→</b></a>
          </div>
        </section>

        <section className="insights-latest" id="latest" aria-labelledby="latest-crm-title">
          <div className="insights-section-head">
            <p><T text="Latest CRM signals" /></p>
            <h2 id="latest-crm-title"><T text="News, with the" /><br /><em><T text="marketing removed." /></em></h2>
            <p><T text="Short, sourced readings of what changed and why it matters to people building open, trustworthy CRM." /></p>
          </div>
          <div className="insights-news-grid">
            {newsBriefs.map((article, index) => (
              <article key={article.slug}>
                <span>0{index + 1}</span>
                <p>{<T text={article.category} />} · <LocalizedDate date={article.publishedAt} /></p>
                <h3><a href={`/insights/${article.slug}`}>{<T text={article.title} />}</a></h3>
                <p>{<T text={article.description} />}</p>
                <LocalizedAttributes names={["aria-label"]}><a href={`/insights/${article.slug}`} aria-label={article.title}><T text="Read the signal " /><b>→</b></a></LocalizedAttributes>
              </article>
            ))}
          </div>
        </section>

        <section className="insights-library" aria-labelledby="insight-library-title">
          <div className="insights-section-head insights-section-head-light">
            <p><T text="The growing library" /></p>
            <h2 id="insight-library-title"><T text="CRM for people." /><br /><em><T text="CRM for agents." /></em></h2>
            <p><T text="Architecture, practice, ownership, and the craft of maintaining relationships without renting your memory." /></p>
          </div>
          <div className="insights-library-grid">
            {library.map((article, index) => (
              <article key={article.slug}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{<T text={article.kind} />} · {<T text={article.category} />}</p>
                <h3><a href={`/insights/${article.slug}`}>{<T text={article.title} />}</a></h3>
                <p>{<T text={article.description} />}</p>
                <footer><small>{article.readMinutes}<T text=" min read" /></small><LocalizedAttributes names={["aria-label"]}><a href={`/insights/${article.slug}`} aria-label={article.title}>→</a></LocalizedAttributes></footer>
              </article>
            ))}
          </div>
        </section>

        <section className="insights-standard" aria-labelledby="editorial-standard-title">
          <p><T text="Our editorial standard" /></p>
          <div>
            <h2 id="editorial-standard-title"><T text="Open source deserves" /><br /><em><T text="open reasoning." /></em></h2>
            <p><T text="News briefs link to primary sources. Research notes separate evidence from opinion. Articles are original, dated, reviewable in Git, and open to correction through a pull request." /></p>
          </div>
          <ol>
            <li><span>01</span><T text="Primary sources first" /></li>
            <li><span>02</span><T text="No pay-to-publish" /></li>
            <li><span>03</span><T text="No copied articles" /></li>
            <li><span>04</span><T text="Claims stay reviewable" /></li>
          </ol>
        </section>

        <section className="insights-faq" id="faq" aria-labelledby="crm-faq-title">
          <div className="insights-section-head">
            <p><T text="CRM, explained" /></p>
            <h2 id="crm-faq-title"><T text="Questions worth" /><br /><em><T text="asking plainly." /></em></h2>
            <p><T text="Practical answers about CRM, ownership, agents, privacy, local operation, and contributing." /></p>
          </div>
          <div className="insights-faq-list">
            {crmFaqs.map((faq, index) => (
              <details key={faq.question} name="crm-faq">
                <summary><span>{String(index + 1).padStart(2, '0')}</span><strong>{<T text={faq.question} />}</strong><i aria-hidden="true">＋</i></summary>
                <p>{<T text={faq.answer} />}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="insights-contribute">
          <p><T text="Knowledge should be free, too" /></p>
          <h2><T text="Research it." /><br /><em><T text="Challenge it. Share it." /></em></h2>
          <div><a href="/contribute"><T text="Contribute an idea " /><span>→</span></a><a href={freeCrmRepositoryUrl} target="_blank" rel="noopener noreferrer"><T text="Inspect the source " /><span>↗</span></a></div>
        </section>
      </main>

      <footer className="insights-footer">
        <a href="/"><span>FREE</span> CRM</a>
        <p><T text="Original writing · primary sources · open corrections" /></p>
        <a href="/insights/rss.xml"><T text="RSS feed" /></a>
      </footer>
    </div>
  );
}
