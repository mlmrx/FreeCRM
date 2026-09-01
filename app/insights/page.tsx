/* eslint-disable @next/next/no-html-link-for-pages -- Vinext production prefetch is intentionally avoided for reliable navigation. */
import type { Metadata } from 'next';

import { crmFaqs, formatEditorialDate, listEditorialArticlesNewestFirst } from '@/lib/editorial-content';
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
      <div className="insights-flag-line" aria-hidden="true"><i /><i /><i /></div>
      <header className="insights-header">
        <a className="insights-brand" href="/"><span>FREE</span> CRM</a>
        <nav aria-label="Insights navigation">
          <a href="/">Home</a>
          <a href="#latest">Latest</a>
          <a href="#faq">FAQs</a>
          <a href="/contribute">Contribute</a>
          <a className="insights-open" href="/deploy">Deploy <span>→</span></a>
        </nav>
      </header>

      <main>
        <section className="insights-hero" aria-labelledby="insights-title">
          <div>
            <p>Ideas for relationship builders</p>
            <h1 id="insights-title">Celebrate open.<br /><em>Question everything.</em></h1>
          </div>
          <div className="insights-hero-copy">
            <p>Original essays, field guides, sourced news, research notes, and plain-language answers about CRM—especially the parts that become more important when humans and agents work together.</p>
            <div className="insights-cadence"><i aria-hidden="true" /><span><strong>Living publication</strong>Fresh research and commentary every six hours</span></div>
          </div>
        </section>

        <section className="insights-feature" aria-labelledby="featured-insight-title">
          <div className="insights-feature-number" aria-hidden="true">01</div>
          <div>
            <p>{featured.kind} · {featured.category}</p>
            <h2 id="featured-insight-title">{featured.title}</h2>
          </div>
          <div>
            <p>{featured.description}</p>
            <span>{formatEditorialDate(featured.publishedAt)} · {featured.readMinutes} min read</span>
            <a href={`/insights/${featured.slug}`}>Read the manifesto <b>→</b></a>
          </div>
        </section>

        <section className="insights-latest" id="latest" aria-labelledby="latest-crm-title">
          <div className="insights-section-head">
            <p>Latest CRM signals</p>
            <h2 id="latest-crm-title">News, with the<br /><em>marketing removed.</em></h2>
            <p>Short, sourced readings of what changed and why it matters to people building open, trustworthy CRM.</p>
          </div>
          <div className="insights-news-grid">
            {newsBriefs.map((article, index) => (
              <article key={article.slug}>
                <span>0{index + 1}</span>
                <p>{article.category} · {formatEditorialDate(article.publishedAt)}</p>
                <h3><a href={`/insights/${article.slug}`}>{article.title}</a></h3>
                <p>{article.description}</p>
                <a href={`/insights/${article.slug}`} aria-label={`Read ${article.title}`}>Read the signal <b>→</b></a>
              </article>
            ))}
          </div>
        </section>

        <section className="insights-library" aria-labelledby="insight-library-title">
          <div className="insights-section-head insights-section-head-light">
            <p>The growing library</p>
            <h2 id="insight-library-title">CRM for people.<br /><em>CRM for agents.</em></h2>
            <p>Architecture, practice, ownership, and the craft of maintaining relationships without renting your memory.</p>
          </div>
          <div className="insights-library-grid">
            {library.map((article, index) => (
              <article key={article.slug}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{article.kind} · {article.category}</p>
                <h3><a href={`/insights/${article.slug}`}>{article.title}</a></h3>
                <p>{article.description}</p>
                <footer><small>{article.readMinutes} min read</small><a href={`/insights/${article.slug}`} aria-label={`Read ${article.title}`}>→</a></footer>
              </article>
            ))}
          </div>
        </section>

        <section className="insights-standard" aria-labelledby="editorial-standard-title">
          <p>Our editorial standard</p>
          <div>
            <h2 id="editorial-standard-title">Open source deserves<br /><em>open reasoning.</em></h2>
            <p>News briefs link to primary sources. Research notes separate evidence from opinion. Articles are original, dated, reviewable in Git, and open to correction through a pull request.</p>
          </div>
          <ol>
            <li><span>01</span>Primary sources first</li>
            <li><span>02</span>No pay-to-publish</li>
            <li><span>03</span>No copied articles</li>
            <li><span>04</span>Claims stay reviewable</li>
          </ol>
        </section>

        <section className="insights-faq" id="faq" aria-labelledby="crm-faq-title">
          <div className="insights-section-head">
            <p>CRM, explained</p>
            <h2 id="crm-faq-title">Questions worth<br /><em>asking plainly.</em></h2>
            <p>Practical answers about CRM, ownership, agents, privacy, local operation, and contributing.</p>
          </div>
          <div className="insights-faq-list">
            {crmFaqs.map((faq, index) => (
              <details key={faq.question} name="crm-faq">
                <summary><span>{String(index + 1).padStart(2, '0')}</span><strong>{faq.question}</strong><i aria-hidden="true">＋</i></summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="insights-contribute">
          <p>Knowledge should be free, too</p>
          <h2>Research it.<br /><em>Challenge it. Share it.</em></h2>
          <div><a href="/contribute">Contribute an idea <span>→</span></a><a href={freeCrmRepositoryUrl} target="_blank" rel="noopener noreferrer">Inspect the source <span>↗</span></a></div>
        </section>
      </main>

      <footer className="insights-footer">
        <a href="/"><span>FREE</span> CRM</a>
        <p>Original writing · primary sources · open corrections</p>
        <a href="/insights/rss.xml">RSS feed</a>
      </footer>
    </div>
  );
}
