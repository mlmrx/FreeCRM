import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import ContributePage from '@/app/contribute/page';
import InsightsPage from '@/app/insights/page';

const root = process.cwd();
const css = readFileSync(join(root, 'app', 'globals.css'), 'utf8');
const workspace = readFileSync(join(root, 'app', 'crm-app.tsx'), 'utf8');
const matrix = readFileSync(join(root, 'docs', 'PUBLIC_UX_TEST_MATRIX.md'), 'utf8');

describe('mobile and editorial accessibility completion', () => {
  it('gives mobile controls 44px targets and labels deliberate horizontal regions', () => {
    expect(css).toContain('@media (max-width: 768px)');
    expect(css).toContain('@media (max-width: 400px)');
    expect(css).toContain('@media (max-width: 1100px)');
    expect(css).toContain('.landing-brand { min-height:44px; display:inline-flex; align-items:center; }');
    expect(css).toMatch(/\.landing-site-nav \{ position:fixed;top:[^}]+overflow-x:auto;/);
    expect(css).toMatch(/\.mobile-menu,[^{]+\{ width:44px;min-width:44px;height:44px;/);
    expect(css).toMatch(/\.filter-tabs button \{ min-height:44px;/);
    expect(css).toMatch(/\.row-actions button,[^{]+\{ min-height:44px;/);
    expect(css).toContain('grid-auto-columns:minmax(250px,82vw)');
    expect(css).toContain('.record-table { min-width:760px; }');
    expect(workspace).toContain('aria-label={`${moduleDefinition.label} table. Scroll horizontally for more columns.`}');
    expect(workspace).toContain('aria-label="Opportunity pipeline. Scroll horizontally to review every stage."');
    expect(workspace.match(/className="(?:record-table-wrap|pipeline-board)" role="region"/g)).toHaveLength(2);
  });

  it('adds first-focus skip links and robust FAQ focus/reflow behavior', () => {
    const insights = renderToStaticMarkup(createElement(InsightsPage));
    const contribute = renderToStaticMarkup(createElement(ContributePage));

    expect(insights).toContain('class="skip-link" href="#insights-content"');
    expect(insights).toContain('id="insights-content" tabindex="-1"');
    expect(contribute).toContain('class="skip-link" href="#contribute-content"');
    expect(contribute).toContain('id="contribute-content" tabindex="-1"');
    expect(insights.indexOf('class="skip-link"')).toBeLessThan(insights.indexOf('<header'));
    expect(contribute.indexOf('class="skip-link"')).toBeLessThan(contribute.indexOf('<header'));
    expect(css).toContain('.skip-link:focus { transform: none;');
    expect(css).toContain('.insights-shell a:focus-visible, .insights-shell summary:focus-visible');
    expect(css).toContain('.insights-faq-list summary { min-height:64px; }');
    expect(css).toContain('.insights-shell,.article-shell,.contribute-shell { overflow-wrap:anywhere; }');
  });

  it('documents the synthetic cross-device and reduced-motion verification matrix', () => {
    for (const target of ['320 px', '375 px', '768 px', '200% zoom', 'Keyboard only', 'prefers-reduced-motion: reduce']) expect(matrix).toContain(target);
    expect(matrix).toContain('Never place customer data');
    expect(matrix).toContain('workspace, authentication, and API requests remain network-only');
  });
});
