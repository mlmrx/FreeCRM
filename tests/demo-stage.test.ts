import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DemoPage, { metadata } from '@/app/demo/page';
import { DemoVisual } from '@/app/demo/demo-stage';
import sitemap from '@/app/sitemap';
import { demoChapters, demoFeatures, chapterFromHash, demoHref, demoKeyboardAction, filterDemoFeatures, normalizeDemoOrigin } from '@/lib/demo-content';
import { moduleCatalog } from '@/lib/crm-platform';

describe('single-screen platform presentation', () => {
  it('provides ten unique, complete chapters with honest presenter guidance', () => {
    expect(demoChapters).toHaveLength(10);
    expect(new Set(demoChapters.map((chapter) => chapter.id)).size).toBe(10);
    for (const chapter of demoChapters) {
      expect(chapter.points).toHaveLength(3);
      expect(chapter.steps).toHaveLength(3);
      expect(chapter.note.length).toBeGreaterThan(70);
      expect(chapter.boundary.length).toBeGreaterThan(60);
      expect(chapter.route).toMatch(/^(\/|https:\/\/)/);
    }
    expect(demoChapters[3].boundary).toContain('explicit opt-in');
    expect(demoChapters[4].boundary).toContain('not automatically installed code');
    expect(demoChapters[5].boundary).toContain('External tool execution is blocked');
    expect(demoChapters[8].boundary).toContain('not shipped');
  });

  it('covers every CRM module and separates optional, preview and roadmap capabilities', () => {
    for (const entry of moduleCatalog) expect(demoFeatures.some((feature) => feature.route === `/workspace?view=${entry.key}`)).toBe(true);
    expect(new Set(demoFeatures.map((feature) => feature.name)).size).toBe(demoFeatures.length);
    expect(new Set(demoFeatures.map((feature) => feature.status))).toEqual(new Set(['Implemented', 'Optional setup', 'Guarded preview', 'Roadmap']));
    expect(demoFeatures.find((feature) => feature.name === 'Agent policy & receipts')?.status).toBe('Guarded preview');
    expect(demoFeatures.find((feature) => feature.name === 'Enterprise & native mobile')?.status).toBe('Roadmap');
    expect(demoFeatures.find((feature) => feature.name === 'Local AI & semantic indexing')?.status).toBe('Optional setup');
  });

  it('renders a safe public stage with keyboard, modal and new-tab affordances', () => {
    const html = renderToStaticMarkup(createElement(DemoPage));
    expect(html).toContain('Less scattered.');
    expect(html).toContain('Feature atlas');
    expect(html).toContain('Presenter notes');
    expect(html).toContain('Live links');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('aria-label="Previous chapter"');
    expect(html).toContain('aria-label="Next chapter"');
    expect(html).toContain('aria-labelledby="demo-dialog-title"');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('href="/tour"');
    expect(html).not.toContain('SAY IT LIKE THIS');
    expect(metadata.title).toContain('ten chapters');
    expect(sitemap().some((entry) => entry.url.endsWith('/demo'))).toBe(true);
  });

  it.each(demoChapters.map((chapter, index) => [chapter.id, index] as const))('renders the %s diagram without private data', (_id, index) => {
    const html = renderToStaticMarkup(createElement(DemoVisual, { chapter: index, onChapter: () => undefined }));
    const captions = ['ONE SHARED PLATFORM', 'RELATIONSHIP, IN CONTEXT', 'THE RELATIONSHIP LIFECYCLE', 'YOUR KNOWLEDGE, CONNECTED', 'A DAILY BRIEFING WITH RECEIPTS', 'AUTHORITY IS NEVER IMPLIED', 'PORTABILITY IS A PRODUCT FEATURE', 'CHOOSE WHERE YOUR WORK LIVES', 'A SHARED FOUNDATION', 'A DIFFERENT KIND OF DEFAULT'];
    expect(html).toContain(captions[index]);
    expect(html).not.toContain('<script');
    if ([1, 3, 4].includes(index)) expect(html).toContain('Illustrative');
  });

  it('does not import private clients, call APIs, track behavior or persist the installation URL', () => {
    const source = readFileSync('app/demo/demo-stage.tsx', 'utf8');
    expect(source).not.toMatch(/\bfetch\s*\(|localStorage|sessionStorage|loadCloudSnapshot|sendCommand|createAdaptiveClient|createBrainClient|navigator\.sendBeacon/);
    expect(source).toContain('event.altKey || event.ctrlKey || event.metaKey');
    expect(source).toContain('if (atlas || setup');
    expect(source).toContain('showModal()');
    expect(source).toContain('onCancel={close}');
    expect(source).toContain('aria-invalid={Boolean(originError)}');
    const css = readFileSync('app/demo/demo.module.css', 'utf8');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('@container');
    expect(css).not.toMatch(/font-size: (?:[5-9]|10|11)px/);
  });
});

describe('presentation navigation and filtering', () => {
  it('restores only known chapter hashes', () => {
    demoChapters.forEach((chapter, index) => expect(chapterFromHash(`#${chapter.id}`)).toBe(index));
    for (const hash of ['', '#missing', '#../../today', '#brain?secret=x']) expect(chapterFromHash(hash)).toBe(0);
  });
  it.each([['ArrowRight', 'next'], ['PageDown', 'next'], ['ArrowLeft', 'previous'], ['PageUp', 'previous'], ['n', 'notes'], ['N', 'notes'], ['Escape', null], ['Enter', null]])('maps %s without interfering with other browser keys', (key, action) => {
    expect(demoKeyboardAction(key!)).toBe(action);
  });
  it('searches descriptions and delivery state with category intersection', () => {
    expect(filterDemoFeatures('  INVOICE  ').map((feature) => feature.name)).toContain('Invoices');
    expect(filterDemoFeatures('optional setup').every((feature) => feature.status === 'Optional setup')).toBe(true);
    expect(filterDemoFeatures('', 'CRM modules')).toHaveLength(12);
    expect(filterDemoFeatures('invoice', 'Second brain')).toHaveLength(0);
    expect(filterDemoFeatures('not-a-real-feature')).toHaveLength(0);
    expect(filterDemoFeatures('')).toHaveLength(demoFeatures.length);
  });
  it.each(['', 'https://demo.example', 'https://demo.example/', 'https://demo.example:444', 'http://localhost:3485', 'http://127.0.0.1:3485/', 'http://[::1]:3485'])('accepts explicit installation origin %s', (value) => {
    expect(normalizeDemoOrigin(value)).toBe(value ? new URL(value).origin : '');
  });
  it.each(['javascript:alert(1)', 'data:text/html,test', '//evil.example', ['https://', 'synthetic-user', ':', 'synthetic-password', '@example.org'].join(''), 'https://example.org/workspace', 'https://example.org/?key=secret', 'https://example.org/#token', 'https:example.org', 'https://example.org\\bad', 'http://example.org', 'http://localhost.evil.org', 'http://127.1', 'http://2130706433', 'http://0.0.0.0', 'http://127.0.0.1:99999', 'https://exa mple.org', 'https://' + 'x'.repeat(300)])('rejects unsafe or ambiguous origin %s', (value) => {
    expect(normalizeDemoOrigin(value)).toBeNull();
  });
  it('rewrites only internal destinations and preserves public source links', () => {
    expect(demoHref('/workspace?view=reports', 'http://127.0.0.1:3485')).toBe('http://127.0.0.1:3485/workspace?view=reports');
    expect(demoHref('/today', 'javascript:bad')).toBe('/today');
    expect(demoHref('https://github.com/mlmrx/FreeCRM', 'https://demo.example')).toBe('https://github.com/mlmrx/FreeCRM');
    for (const route of ['javascript:bad', '//evil.example', '/\\evil.example', '/today\n']) expect(demoHref(route)).toBe('/demo');
  });
});
