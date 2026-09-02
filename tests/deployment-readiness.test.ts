import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import DeploymentReadinessPage from '@/app/deploy/readiness/page';
import DeploymentCenter from '@/app/deploy/deployment-center';

describe('public deployment readiness checklist', () => {
  it('separates local and cloud requirements and links every check to source guidance', () => {
    const markup = renderToStaticMarkup(createElement(DeploymentReadinessPage));
    const checks = markup.match(/<li>/g) ?? [];
    const sourceLinks = markup.match(/href="https:\/\/github\.com\/mlmrx\/FreeCRM\/blob\/main\//g) ?? [];

    expect(markup).toContain('Local device or Docker');
    expect(markup).toContain('User-owned cloud');
    expect(markup).toContain('Node.js 22.13.0 or newer');
    expect(markup).toContain('identity provider');
    expect(markup).toContain('Durable database');
    expect(markup).toContain('Private object storage');
    expect(markup).toContain('Provider cost and quotas');
    expect(markup).toContain('Redact before you share.');
    expect(markup).toContain('cookies, email addresses, account and database identifiers');
    expect(sourceLinks.length).toBeGreaterThanOrEqual(checks.length);
    expect(markup).toContain('rel="noopener noreferrer"');
  });

  it('is discoverable from the public deployment center', () => {
    const markup = renderToStaticMarkup(createElement(DeploymentCenter));
    expect(markup).toContain('href="/deploy/readiness"');
    expect(markup).toContain('Check deployment readiness before using credentials');
  });
});
