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

  it('publishes a promises-versus-possibilities guide for solopreneurs', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'solopreneur-crm-promises-from-possibilities');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'Solopreneur CRM',
      publishedAt: '2026-09-03',
      readMinutes: 6,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual([
      'U.S. Small Business Administration',
      'U.S. Small Business Administration',
      'Business.gov.uk',
    ]);
  });

  it('publishes the Customer 360 data-contract research note with provenance sources', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'customer-360-data-contracts-before-dashboards');

    expect(article).toMatchObject({
      kind: 'Research note',
      category: 'Customer 360',
      publishedAt: '2026-09-03',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual([
      "Information Commissioner's Office",
      'European Data Protection Board',
      'W3C',
    ]);
  });

  it('publishes a trust-gated Agentic CRM tool-change research note', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'agentic-crm-tool-changes-trust-gate');

    expect(article).toMatchObject({
      kind: 'Research note',
      category: 'Agentic CRM',
      publishedAt: '2026-09-03',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual([
      'OWASP GenAI Security Project',
      'MITRE',
      'OWASP Foundation',
    ]);
  });

  it('publishes purpose-bound context leases for CRM agents', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'crm-agents-need-context-leases');

    expect(article).toMatchObject({
      kind: 'Research note',
      category: 'CRM for Agents',
      publishedAt: '2026-09-03',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual([
      'IETF RFC Editor',
      'NIST',
      'W3C',
    ]);
  });

  it('publishes a synthetic-data field guide for open-source contributors', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'build-a-fictional-crm-universe');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'Open CRM',
      publishedAt: '2026-09-04',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['NIST', 'Faker', 'SQLite']);
  });

  it('publishes a three-clock operating guide for solopreneurs', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'solopreneur-crm-needs-three-clocks');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'Solopreneur CRM',
      publishedAt: '2026-09-04',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual([
      'Internal Revenue Service',
      'GOV.UK',
      'U.S. Small Business Administration',
    ]);
  });

  it('publishes a reversible identity-link research note for Customer 360', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'customer-360-needs-reversible-identity-links');

    expect(article).toMatchObject({
      kind: 'Research note',
      category: 'Customer 360',
      publishedAt: '2026-09-04',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual([
      'NIST',
      'U.S. Census Bureau',
      "Information Commissioner's Office",
    ]);
  });

  it('publishes an interruption-budget field guide for Agentic CRM', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'agentic-crm-needs-an-interruption-budget');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'Agentic CRM',
      publishedAt: '2026-09-04',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['GOV.UK', 'Microsoft Research', 'NIST']);
  });

  it('publishes typed failure receipts for CRM agents', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'crm-agents-need-typed-failure-receipts');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'CRM for Agents',
      publishedAt: '2026-09-05',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual([
      'IETF RFC Editor',
      'IETF RFC Editor',
      'OWASP Foundation',
    ]);
  });

  it('publishes an operator-owned observability field guide for open CRM', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'observe-the-system-not-the-customer');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'Open CRM',
      publishedAt: '2026-09-06',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual([
      'OpenTelemetry',
      'OpenTelemetry',
      'OWASP Foundation',
    ]);
  });

  it('publishes a minimal relationship-note field guide for solopreneurs', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'record-the-promise-not-the-whole-person');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'Solopreneur CRM',
      publishedAt: '2026-09-07',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['NIST', 'Federal Trade Commission']);
  });

  it('publishes explicit absence states for Customer 360', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'customer-360-needs-explicit-absence-states');

    expect(article).toMatchObject({
      kind: 'Research note',
      category: 'Customer 360',
      publishedAt: '2026-09-08',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['HL7', 'W3C', 'JSON Schema']);
  });

  it('publishes a dated and vendor-attributed Agentic CRM editions news brief', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'salesforce-makes-agentic-crm-bundle-buying-unit');

    expect(article).toMatchObject({
      kind: 'News brief',
      category: 'Agentic CRM',
      publishedAt: '2026-09-10',
      readMinutes: 6,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['Salesforce', 'Salesforce', 'Salesforce']);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs]).join(' ');
    expect(articleCopy).toContain('September 3, 2026');
    expect(articleCopy).toContain('not independent findings');
    expect(articleCopy).toContain('credit meter is not a safety budget');
  });

  it('publishes a temporal-intent contract for CRM agents', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'crm-agents-need-temporal-intent');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'CRM for Agents',
      publishedAt: '2026-09-11',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['IETF RFC Editor', 'IETF RFC Editor', 'IANA']);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]).join(' ');
    expect(articleCopy).toContain('date-only promise');
    expect(articleCopy).toContain('numeric offset is not a durable substitute for a named time zone');
    expect(articleCopy).toContain('Time Zone Database is updated periodically');
  });

  it('publishes an independently rebuildable release drill for open CRM', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'can-the-owner-rebuild-it-open-crm-release-drill');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'Open CRM',
      publishedAt: '2026-09-12',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['Reproducible Builds', 'SLSA', 'NIST']);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]).join(' ');
    expect(articleCopy).toContain('another party can recreate bit-for-bit identical specified artifacts');
    expect(articleCopy).toContain('must not need a copy of a real workspace');
    expect(articleCopy).toContain('Provenance can help an owner trace a release');
    expect(articleCopy).toContain('Publish each outcome separately');
  });

  it('publishes a consent-aware warm-introduction ritual for solopreneurs', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'ask-twice-share-once-warm-introductions');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'Solopreneur CRM',
      publishedAt: '2026-09-13',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual([
      'Office of the Privacy Commissioner of Canada',
      'OECD',
      'Federal Trade Commission',
    ]);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]).join(' ');
    expect(articleCopy).toContain('Silence is not a yes');
    expect(articleCopy).toContain('not a claim that this ritual satisfies every privacy law');
    expect(articleCopy).toContain('shareable fields that are visibly distinct from owner-only memory');
    expect(articleCopy).toContain('Scope the receipt to one introduction');
  });

  it('publishes a dated and vendor-attributed long-running CRM agent news brief', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'salesforce-gives-crm-agents-a-longer-clock');

    expect(article).toMatchObject({
      kind: 'News brief',
      category: 'CRM for Agents',
      publishedAt: '2026-09-14',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['Salesforce', 'Salesforce', 'GitHub']);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]).join(' ');
    expect(articleCopy).toContain('September 11, 2026');
    expect(articleCopy).toContain('vendor-reported examples, not independent evidence');
    expect(articleCopy).toContain('approval is configurable');
    expect(articleCopy).toContain('the runtime is not open source');
    expect(articleCopy).toContain('Re-authorize on every resume');
  });

  it('publishes a purpose-bound Customer 360 research note', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'build-customer-360-on-demand');

    expect(article).toMatchObject({
      kind: 'Research note',
      category: 'Customer 360',
      publishedAt: '2026-09-15',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual([
      "Information Commissioner's Office",
      'NIST',
      'European Data Protection Board',
    ]);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]).join(' ');
    expect(articleCopy).toContain('A field-level contract decides whether a signal may enter');
    expect(articleCopy).toContain('A purpose label is not consent, a lawful basis, or blanket permission');
    expect(articleCopy).toContain('tool response should contain only the allowed projection');
    expect(articleCopy).toContain('without preserving another shadow customer profile');
  });

  it('publishes a dated and vendor-attributed composable-interface news brief', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'salesforce-moves-crm-into-agent-interface');

    expect(article).toMatchObject({
      kind: 'News brief',
      category: 'Agentic CRM',
      publishedAt: '2026-09-16',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual([
      'Salesforce',
      'Model Context Protocol',
      'Model Context Protocol',
    ]);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]).join(' ');
    expect(articleCopy).toContain('September 16, 2026');
    expect(articleCopy).toContain('Salesforce\'s claims, not independent findings');
    expect(articleCopy).toContain('connected once');
    expect(articleCopy).toContain('protocol conformance does not replace CRM policy');
    expect(articleCopy).toContain('Calling an architecture open is not evidence');
  });

  it('publishes an owner-readable threat-model field guide for open CRM', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'draw-the-trust-map-open-crm-threat-model');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'Open CRM',
      publishedAt: '2026-09-17',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['OWASP Foundation', 'CISA', 'GitHub']);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]).join(' ');
    expect(articleCopy).toContain('A source repository is evidence of inspectability');
    expect(articleCopy).toContain('A threat model is not a penetration test, audit, or compliance certificate');
    expect(articleCopy).toContain('Every proposed control needs verification evidence');
    expect(articleCopy).toContain('A public trust map should not contain credentials');
    expect(articleCopy).toContain('Change the model when the trust boundary changes');
  });

  it('publishes a capacity-limited relationship workflow for solopreneurs', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'protect-the-promise-solo-crm-capacity-limit');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'Solopreneur CRM',
      publishedAt: '2026-09-18',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual([
      'Kanban Guides',
      'U.S. Small Business Administration',
    ]);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]).join(' ');
    expect(articleCopy).toContain('The capacity limit belongs to active outcomes, never to human worth');
    expect(articleCopy).toContain('Start with observation, not a universal number');
    expect(articleCopy).toContain('not a claim that a CRM board is a complete Kanban system');
    expect(articleCopy).toContain('capacity-blocked result');
    expect(articleCopy).toContain('Capacity pressure is never authority');
  });

  it('publishes a relationship-scoped role model for Customer 360', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'put-the-role-on-the-relationship');

    expect(article).toMatchObject({
      kind: 'Research note',
      category: 'Customer 360',
      publishedAt: '2026-09-19',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['W3C', 'NIST', 'W3C']);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]).join(' ');
    expect(articleCopy).toContain('turns local context into a global characteristic');
    expect(articleCopy).toContain('That recommendation is not a CRM standard');
    expect(articleCopy).toContain('does not automatically permit marketing');
    expect(articleCopy).toContain('risk-management pattern, not a determination of anyone\'s legal role');
    expect(articleCopy).toContain('Matching records, assigning a role, and granting authority are three different claims');
  });

  it('publishes an effect-aware recovery contract for Agentic CRM', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'design-the-way-back-before-crm-agent-acts');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'Agentic CRM',
      publishedAt: '2026-09-20',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['Microsoft', 'AWS', 'NIST']);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]).join(' ');
    expect(articleCopy).toContain('Recovery should repair the state without rewriting history');
    expect(articleCopy).toContain('That is an architecture precedent');
    expect(articleCopy).toContain('A compensation is another consequential command');
    expect(articleCopy).toContain('Human approval does not make the consequence reversible');
    expect(articleCopy).toContain('it is not a certification');
    expect(articleCopy).toContain('content-minimal receipts');
  });

  it('publishes a bounded read contract for CRM agents', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'give-crm-agents-a-window-not-the-database');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'CRM for Agents',
      publishedAt: '2026-09-21',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['Google', 'OWASP Foundation', 'NIST']);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]).join(' ');
    expect(articleCopy).toContain('Read-only is not consequence-free');
    expect(articleCopy).toContain('not a CRM privacy or authorization standard');
    expect(articleCopy).toContain('A continuation token locates the next safe window');
    expect(articleCopy).toContain('it is not a claim that pagination implements zero trust');
    expect(articleCopy).toContain('content-minimal receipts');
  });

  it('publishes an owner-readable compatibility ledger for open CRM upgrades', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'make-open-crm-upgrades-explain-themselves');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'Open CRM',
      publishedAt: '2026-09-22',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual([
      'Semantic Versioning',
      'IETF RFC Editor',
      'IETF RFC Editor',
    ]);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]).join(' ');
    expect(articleCopy).toContain('public contract is wider than a package interface');
    expect(articleCopy).toContain('the number alone does not establish compatibility');
    expect(articleCopy).toContain('A green result applies to that matrix');
    expect(articleCopy).toContain('deprecation itself does not change the resource\'s behavior');
    expect(articleCopy).toContain('Both RFCs are HTTP lifecycle mechanisms, not a complete CRM upgrade policy');
    expect(articleCopy).toContain('do not send customer identifiers');
  });

  it('publishes a solopreneur closeout ritual that preserves the relationship boundary', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'close-the-work-keep-the-relationship');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'Solopreneur CRM',
      publishedAt: '2026-09-23',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual([
      'GOV.UK',
      'National Cyber Security Centre',
      'ICO',
    ]);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]).join(' ');
    expect(articleCopy).toContain('the engagement is complete without declaring the person complete');
    expect(articleCopy).toContain('indicative rather than prescriptive');
    expect(articleCopy).toContain('internal and external users');
    expect(articleCopy).toContain('not proof that every remote copy is gone');
    expect(articleCopy).toContain('guidance is under review');
    expect(articleCopy).toContain('The agent may prepare the closeout; the owner closes it.');
  });

  it('publishes a two-clock Customer 360 model for late and corrected facts', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'customer-360-needs-two-clocks');

    expect(article).toMatchObject({
      kind: 'Research note',
      category: 'Customer 360',
      publishedAt: '2026-09-24',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['Martin Fowler', 'Microsoft', 'XTDB']);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]).join(' ');
    expect(articleCopy).toContain('A single updated-at timestamp forces one answer to erase the other');
    expect(articleCopy).toContain('a modeling pattern, not a CRM standard');
    expect(articleCopy).toContain('or a requirement to replace SQLite, D1');
    expect(articleCopy).toContain('they do not justify infinite retention');
    expect(articleCopy).toContain('A later fact does not retroactively authorize an earlier action');
    expect(articleCopy).toContain('Bind every proposal to the snapshot it inspected');
  });

  it('publishes a source-aware Odoo 20 automation news brief', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'odoo-20-turns-crm-automation-into-ownership-test');

    expect(article).toMatchObject({
      kind: 'News brief',
      category: 'Open CRM',
      publishedAt: '2026-09-25',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['Odoo', 'Odoo', 'Odoo', 'GitHub']);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]).join(' ');
    expect(articleCopy).toContain('Announcement date: September 24, 2026');
    expect(articleCopy).toContain('vendor sources');
    expect(articleCopy).toContain('main server code is in the Community repository');
    expect(articleCopy).toContain('unknown rather than inferring openness');
    expect(articleCopy).toContain('Existing record access is a ceiling');
    expect(articleCopy).toContain('Conversation history is not the audit trail');
    expect(articleCopy).toContain('never use customer data to prove an exit path');
  });

  it('publishes a conditional-write contract for CRM agents', () => {
    const article = editorialArticles.find((candidate) => candidate.slug === 'crm-agents-must-name-the-version-before-writing');

    expect(article).toMatchObject({
      kind: 'Field guide',
      category: 'CRM for Agents',
      publishedAt: '2026-09-26',
      readMinutes: 7,
    });
    expect(article?.sections).toHaveLength(3);
    expect(article?.takeaways).toHaveLength(3);
    expect(article?.sources.map((source) => source.publisher)).toEqual(['IETF RFC Editor', 'Google', 'IETF RFC Editor']);

    const articleCopy = article?.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])]).join(' ');
    expect(articleCopy).toContain('Approval belongs to a version, not only to a record');
    expect(articleCopy).toContain('The status code is optional');
    expect(articleCopy).toContain('not a requirement that every CRM use Google APIs');
    expect(articleCopy).toContain('It is not a substitute for a whole-resource version');
    expect(articleCopy).toContain('Never turn version_conflict into an automatic retry');
    expect(articleCopy).toContain('triggers no downstream effect');
    expect(articleCopy).toContain('content-minimal receipts');
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
