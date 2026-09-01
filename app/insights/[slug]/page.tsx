/* eslint-disable @next/next/no-html-link-for-pages -- Vinext production prefetch is intentionally avoided for reliable navigation. */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { editorialArticles, findEditorialArticle, formatEditorialDate } from '@/lib/editorial-content';

type InsightArticlePageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return editorialArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: InsightArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = findEditorialArticle(slug);
  if (!article) return {};
  return {
    title: `${article.title} — FREE CRM Insights`,
    description: article.description,
    alternates: { canonical: `https://www.freecrm.dev/insights/${article.slug}` },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.description,
      publishedTime: `${article.publishedAt}T12:00:00Z`,
      images: [],
    },
    twitter: { card: 'summary', title: article.title, description: article.description, images: [] },
  };
}

export default async function InsightArticlePage({ params }: InsightArticlePageProps) {
  const { slug } = await params;
  const article = findEditorialArticle(slug);
  if (!article) notFound();

  const related = editorialArticles.filter((candidate) => candidate.slug !== article.slug).slice(0, 3);
  const schema = {
    '@context': 'https://schema.org',
    '@type': article.kind === 'News brief' ? 'NewsArticle' : 'Article',
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    author: { '@type': 'Organization', name: 'FREE CRM' },
    publisher: { '@type': 'Organization', name: 'FREE CRM' },
    mainEntityOfPage: `https://www.freecrm.dev/insights/${article.slug}`,
  };

  return (
    <div className="article-shell">
      <div className="article-flag-line" aria-hidden="true"><i /><i /><i /></div>
      <header className="article-header">
        <a className="article-brand" href="/"><span>FREE</span> CRM</a>
        <nav aria-label="Article navigation"><a href="/insights">All insights</a><a href="/contribute">Contribute</a><a className="article-deploy" href="/deploy">Deploy <span>→</span></a></nav>
      </header>

      <main>
        <article>
          <header className="article-hero">
            <p>{article.kind} · {article.category}</p>
            <h1>{article.title}</h1>
            <div><p>{article.description}</p><span>{formatEditorialDate(article.publishedAt)} · {article.readMinutes} minute read</span></div>
          </header>

          <div className="article-layout">
            <aside aria-labelledby="article-takeaways-title">
              <p id="article-takeaways-title">The short version</p>
              <ol>{article.takeaways.map((takeaway, index) => <li key={takeaway}><span>{String(index + 1).padStart(2, '0')}</span>{takeaway}</li>)}</ol>
            </aside>

            <div className="article-body">
              {article.sections.map((section, index) => (
                <section key={section.heading}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <h2>{section.heading}</h2>
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
                </section>
              ))}
            </div>
          </div>

          <section className="article-sources" aria-labelledby="article-sources-title">
            <div><p>Read the evidence</p><h2 id="article-sources-title">Sources, in the open.</h2></div>
            <ol>{article.sources.map((source, index) => <li key={source.url}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{source.label}</strong><small>{source.publisher}</small></div><a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${source.label}`}>↗</a></li>)}</ol>
          </section>
        </article>

        <section className="article-related" aria-labelledby="related-insights-title">
          <p>Keep thinking</p>
          <h2 id="related-insights-title">More from FREE CRM Insights.</h2>
          <div>{related.map((candidate) => <article key={candidate.slug}><span>{candidate.category}</span><h3><a href={`/insights/${candidate.slug}`}>{candidate.title}</a></h3><a href={`/insights/${candidate.slug}`} aria-label={`Read ${candidate.title}`}>Read <b>→</b></a></article>)}</div>
        </section>
      </main>

      <footer className="article-footer"><a href="/"><span>FREE</span> CRM</a><a href="/insights">Return to all insights</a></footer>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replaceAll('<', '\\u003c') }} />
    </div>
  );
}
