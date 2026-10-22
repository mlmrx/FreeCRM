/* eslint-disable @next/next/no-html-link-for-pages -- Vinext production prefetch is intentionally avoided for reliable navigation. */
import { T, LocalizedAttributes, LocalizedDate } from '@/app/localized-text';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { editorialArticles, findEditorialArticle } from '@/lib/editorial-content';
import { freeCrmSiteUrl } from '@/lib/public-config';

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
    alternates: { canonical: `${freeCrmSiteUrl}/insights/${article.slug}` },
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
    mainEntityOfPage: `${freeCrmSiteUrl}/insights/${article.slug}`,
  };

  return (
    <div className="article-shell">
      <a className="skip-link" href="#article-content"><T text="Skip to article" /></a>
      <div className="article-flag-line" aria-hidden="true"><i /><i /><i /></div>
      <header className="article-header">
        <a className="article-brand" href="/"><span>FREE</span> CRM</a>
        <LocalizedAttributes names={["aria-label"]}><nav aria-label="Article navigation"><a href="/insights"><T text="All insights" /></a><a href="/contribute"><T text="Contribute" /></a><a className="article-deploy" href="/deploy"><T text="Deploy " /><span>→</span></a></nav></LocalizedAttributes>
      </header>

      <main id="article-content" tabIndex={-1}>
        <article>
          <header className="article-hero">
            <p>{<T text={article.kind} />} · {<T text={article.category} />}</p>
            <h1>{<T text={article.title} />}</h1>
            <div><p>{<T text={article.description} />}</p><span><LocalizedDate date={article.publishedAt} /> · {article.readMinutes}<T text=" minute read" /></span></div>
          </header>

          <div className="article-layout">
            <aside aria-labelledby="article-takeaways-title">
              <p id="article-takeaways-title"><T text="The short version" /></p>
              <ol>{article.takeaways.map((takeaway, index) => <li key={takeaway}><span>{String(index + 1).padStart(2, '0')}</span>{<T text={takeaway} />}</li>)}</ol>
            </aside>

            <div className="article-body">
              {article.sections.map((section, index) => (
                <section key={section.heading}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <h2>{<T text={section.heading} />}</h2>
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{<T text={paragraph} />}</p>)}
                  {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{<T text={bullet} />}</li>)}</ul>}
                </section>
              ))}
            </div>
          </div>

          <section className="article-sources" aria-labelledby="article-sources-title">
            <div><p><T text="Read the evidence" /></p><h2 id="article-sources-title"><T text="Sources, in the open." /></h2></div>
            <ol>{article.sources.map((source, index) => <li key={source.url}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{<T text={source.label} />}</strong><small>{source.publisher}</small></div><LocalizedAttributes names={["aria-label"]}><a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={source.label}>↗</a></LocalizedAttributes></li>)}</ol>
          </section>
        </article>

        <section className="article-related" aria-labelledby="related-insights-title">
          <p><T text="Keep thinking" /></p>
          <h2 id="related-insights-title"><T text="More from FREE CRM Insights." /></h2>
          <div>{related.map((candidate) => <article key={candidate.slug}><span>{<T text={candidate.category} />}</span><h3><a href={`/insights/${candidate.slug}`}>{<T text={candidate.title} />}</a></h3><LocalizedAttributes names={["aria-label"]}><a href={`/insights/${candidate.slug}`} aria-label={candidate.title}><T text="Read " /><b>→</b></a></LocalizedAttributes></article>)}</div>
        </section>
      </main>

      <footer className="article-footer"><a href="/"><span>FREE</span> CRM</a><a href="/insights"><T text="Return to all insights" /></a></footer>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replaceAll('<', '\\u003c') }} />
    </div>
  );
}
