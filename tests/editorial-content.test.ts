import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import InsightArticlePage, { generateMetadata, generateStaticParams } from '@/app/insights/[slug]/page';
import InsightsPage from '@/app/insights/page';
import { GET as getRss } from '@/app/insights/rss.xml/route';
import sitemap from '@/app/sitemap';
import { crmFaqs, editorialArticles } from '@/lib/editorial-content';

describe('FREE CRM editorial publication', () => {
  it('ships a substantial, sourced, and uniquely addressable starter library', () => {
    expect(editorialArticles.length).toBeGreaterThanOrEqual(10);
    expect(crmFaqs.length).toBeGreaterThanOrEqual(10);
    expect(editorialArticles.filter((article) => article.kind === 'News brief').length).toBeGreaterThanOrEqual(3);
    expect(new Set(editorialArticles.map((article) => article.slug)).size).toBe(editorialArticles.length);
    expect(new Set(editorialArticles.map((article) => article.category))).toEqual(new Set(['Open CRM', 'Agentic CRM', 'CRM for Agents', 'Customer 360', 'Solopreneur CRM']));
    for (const article of editorialArticles) {
      expect(article.sections.length).toBeGreaterThanOrEqual(2);
      expect(article.takeaways).toHaveLength(3);
      expect(article.sources.length).toBeGreaterThan(0);
      for (const source of article.sources) expect(source.url).toMatch(/^https:\/\//);
    }
  });

  it('publishes the CRM exit drill as a dated, open-source field guide', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'run-a-crm-exit-drill-before-you-need-one');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'Open CRM',
      publishedAt: '2026-09-01',
      readMinutes: 4,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['NIST', 'Cloudflare', 'SQLite']);
  });

  it('publishes delegated agent authority as a sourced CRM-for-Agents research note', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'the-agent-is-not-the-user');

    expect(article).toMatchObject({
      kind: 'Research note',
      category: 'CRM for Agents',
      publishedAt: '2026-09-01',
      readMinutes: 5,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['IETF RFC Editor', 'IETF RFC Editor', 'NIST']);
  });

  it('publishes a sourced intention-cue guide for solopreneurs', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'write-the-cue-not-just-the-task');

    expect(article).toMatchObject({
      kind: 'Research note',
      category: 'Solopreneur CRM',
      publishedAt: '2026-09-01',
      readMinutes: 5,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['PubMed Central', 'PubMed Central']);
  });

  it('publishes a sourced correction workflow for Customer 360', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'customer-360-needs-a-correction-queue');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'Customer 360',
      publishedAt: '2026-09-01',
      readMinutes: 6,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual([
      'California Privacy Protection Agency',
      'Information Commissioner’s Office',
      'EUR-Lex',
    ]);
  });

  it('publishes a shadow-mode evaluation ladder for Agentic CRM', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'shadow-mode-before-agent-autonomy');

    expect(article).toMatchObject({
      kind: 'Research note',
      category: 'Agentic CRM',
      publishedAt: '2026-09-02',
      readMinutes: 6,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual([
      'NIST',
      'UK AI Security Institute',
      'NIST',
    ]);
  });

  it('publishes uncertainty-aware relationship contracts for CRM for Agents', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'crm-agents-need-uncertainty-fields');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'CRM for Agents',
      publishedAt: '2026-09-02',
      readMinutes: 6,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['W3C', 'W3C', 'IETF RFC Editor']);
  });

  it('publishes a safe first-contribution path for the open CRM', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'first-free-crm-contribution-friction-to-patch');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'Open CRM',
      publishedAt: '2026-09-02',
      readMinutes: 6,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['GitHub', 'GitHub', 'GitHub']);
  });

  it('renders the public hub with news, research, FAQs, cadence, and discovery links', () => {
    const markup = renderToStaticMarkup(createElement(InsightsPage));

    expect(markup).toContain('id="insights-title"');
    expect(markup).toContain('Latest CRM signals');
    expect(markup).toContain('CRM for people.');
    expect(markup).toContain('CRM for agents.');
    expect(markup).toContain('Fresh research and commentary every six hours');
    expect(markup).toContain('id="faq"');
    expect(markup).toContain('href="/insights/rss.xml"');
    expect(markup.match(/<details/g)).toHaveLength(crmFaqs.length);
  });

  it('renders durable article pages with takeaways, source links, and article metadata', async () => {
    const article = editorialArticles[1];
    const element = await InsightArticlePage({ params: Promise.resolve({ slug: article.slug }) });
    const markup = renderToStaticMarkup(element);
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: article.slug }) });

    expect(generateStaticParams()).toContainEqual({ slug: article.slug });
    expect(markup).toContain(article.title);
    expect(markup).toContain('class="skip-link" href="#article-content"');
    expect(markup).toContain('id="article-content" tabindex="-1"');
    expect(markup).toContain('The short version');
    expect(markup).toContain('Sources, in the open.');
    expect(markup).toContain('application/ld+json');
    expect(metadata.title).toContain(article.title);
    expect(metadata.alternates).toEqual({ canonical: `https://freecrm.dev/insights/${article.slug}` });
    expect(metadata.openGraph).toMatchObject({ type: 'article', images: [] });
  });

  it('publishes every article through RSS and the sitemap', async () => {
    const response = getRss();
    const feed = await response.text();
    const entries = sitemap();

    expect(response.headers.get('content-type')).toContain('application/rss+xml');
    expect(feed.match(/<item>/g)).toHaveLength(editorialArticles.length);
    for (const article of editorialArticles) {
      expect(feed).toContain(`/insights/${article.slug}`);
      expect(entries).toContainEqual(expect.objectContaining({ url: `https://freecrm.dev/insights/${article.slug}` }));
    }
  });
});
