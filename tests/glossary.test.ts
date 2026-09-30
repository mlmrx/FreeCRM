import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import GlossaryPage, { metadata } from '@/app/glossary/page';
import HowItWorksPage from '@/app/how-it-works/page';
import InsightsPage from '@/app/insights/page';
import sitemap from '@/app/sitemap';
import { glossaryGroups, glossaryTerms } from '@/lib/glossary';
import { freeCrmRepositoryUrl, freeCrmSiteUrl } from '@/lib/public-config';

describe('public CRM glossary', () => {
  it('defines the required existing product terms with unique stable alphabetical anchors', () => {
    expect(glossaryTerms.length).toBeGreaterThanOrEqual(20);
    expect(glossaryTerms.map(({ term }) => term)).toEqual([...glossaryTerms.map(({ term }) => term)].sort((a, b) => a.localeCompare(b, 'en')));
    expect(glossaryTerms.map(({ term }) => term)).toEqual(expect.arrayContaining([
      'Customer 360', 'Lifecycle', 'Pipeline', 'Weighted forecast', 'Tenant', 'Connector',
      'Idempotency', 'Grant', 'Approval', 'Receipt', 'Emergency stop',
    ]));
    expect(new Set(glossaryTerms.map(({ id }) => id)).size).toBe(glossaryTerms.length);
    expect(new Set(glossaryTerms.map(({ term }) => term)).size).toBe(glossaryTerms.length);
    expect(glossaryGroups.flatMap(({ terms }) => terms)).toEqual(glossaryTerms);
    for (const entry of glossaryTerms) {
      expect(entry.id).toMatch(/^[a-z]+(?:-[a-z0-9]+)*$/);
      expect(entry.meaning.length).toBeGreaterThan(35);
      expect(entry.inFreeCrm.length).toBeGreaterThan(75);
      expect(entry.meaning).not.toEqual(entry.inFreeCrm);
    }
  });

  it('links every entry to an existing repository document and valid heading', () => {
    for (const { documentation } of glossaryTerms) {
      const [path, anchor] = documentation.path.split('#');
      expect(path).toMatch(/^(?:docs\/[A-Z_-]+|SECURITY)\.md$/);
      expect(existsSync(join(process.cwd(), path)), path).toBe(true);
      if (anchor) {
        const headings = [...readFileSync(join(process.cwd(), path), 'utf8').matchAll(/^#{1,6} (.+)$/gm)]
          .map((match) => match[1].trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s/g, '-'));
        expect(headings, documentation.path).toContain(anchor);
      }
    }
  });

  it('renders a complete no-script alphabet index, landmark, and meaningful heading hierarchy', () => {
    const html = renderToStaticMarkup(createElement(GlossaryPage));
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html.match(/<h2\b/g)).toHaveLength(glossaryGroups.length + 1);
    expect(html.match(/<h3\b/g)).toHaveLength(glossaryTerms.length);
    expect(html).not.toMatch(/<h[4-6]\b/);
    expect(html).toContain('href="#glossary-content"');
    expect(html).toContain('id="glossary-content" tabindex="-1"');
    expect(html).toContain('aria-label="Browse glossary by letter"');
    for (const { letter } of glossaryGroups) {
      expect(html).toContain(`href="#letter-${letter.toLowerCase()}"`);
      expect(html).toContain(`id="letter-${letter.toLowerCase()}" tabindex="-1"`);
    }
    for (const entry of glossaryTerms) {
      expect(html).toContain(`id="${entry.id}" tabindex="-1"`);
      expect(html).toContain(`href="#${entry.id}"`);
      expect(html).toContain(`href="${freeCrmRepositoryUrl}/blob/main/${entry.documentation.path}"`);
    }
    expect(html.match(/<dt>In plain language<\/dt>/g)).toHaveLength(glossaryTerms.length);
    expect(html.match(/<dt>In FREE CRM today<\/dt>/g)).toHaveLength(glossaryTerms.length);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) expect(ids).toContain(target);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<form');
  });

  it('keeps safety, data, and delivery distinctions explicit', () => {
    const behavior = (id: string) => glossaryTerms.find((term) => term.id === id)?.inFreeCrm;
    expect(behavior('approval')).toContain('Approval is not execution');
    expect(behavior('emergency-stop')).toContain('leaves the agent paused');
    expect(behavior('export')).toContain('not a full recovery backup');
    expect(behavior('connector')).toContain('not implemented');
    expect(behavior('receipt')).toContain('neither proves an external service completed work');
    expect(behavior('weighted-forecast')).toContain('not an AI prediction');
    expect(behavior('webhook')).toContain('Native Vercel rejects it');
    expect(behavior('signal')).toContain('does not prove work was missed');
    expect(glossaryTerms.map(({ meaning, inFreeCrm }) => `${meaning} ${inFreeCrm}`).join(' ')).not.toMatch(/HubSpot|Salesforce|YouSpot|Pipedrive|Zoho/i);
  });

  it('is discoverable from both requested pages and the existing sitemap', () => {
    expect(renderToStaticMarkup(createElement(InsightsPage))).toContain('href="/glossary"');
    expect(renderToStaticMarkup(createElement(HowItWorksPage))).toContain('href="/glossary"');
    expect(sitemap().filter(({ url }) => url === `${freeCrmSiteUrl}/glossary`)).toHaveLength(1);
    expect(metadata.title).toContain('CRM Glossary');
    expect(metadata.description).toContain('Plain-language definitions');
    expect(metadata.alternates).toEqual({ canonical: `${freeCrmSiteUrl}/glossary` });
    expect(metadata.openGraph).toMatchObject({ url: `${freeCrmSiteUrl}/glossary`, title: metadata.title });
  });

  it('provides scoped keyboard focus, touch-sized links, and narrow-screen reflow without animation', () => {
    const css = readFileSync(join(process.cwd(), 'app/glossary/glossary.module.css'), 'utf8');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('outline:3px solid');
    expect(css).toContain('.skipLink:focus');
    expect(css).toContain('min-height:44px');
    expect(css).toContain('flex-wrap:wrap');
    expect(css).toContain('@media(max-width:480px)');
    expect(css).toContain('grid-template-columns:minmax(0,1fr)');
    expect(css).toContain('overflow-wrap:anywhere');
    expect(css).not.toMatch(/animation:|scroll-behavior:smooth/);
  });
});
