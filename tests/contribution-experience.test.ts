import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import ContributePage from '@/app/contribute/page';
import LandingPage from '@/app/landing-page';
import { freeCrmContributingUrl, freeCrmRepositoryUrl } from '@/lib/public-config';

const repositoryUrl = freeCrmRepositoryUrl;
const contributionGuideUrl = freeCrmContributingUrl;

describe('public contribution experience', () => {
  it('keeps the repository and contribution route visible in the landing navigation', () => {
    const markup = renderToStaticMarkup(createElement(LandingPage));
    const navigation = markup.match(/<nav class="landing-site-nav" aria-label="FREE CRM navigation">[\s\S]*?<\/nav>/)?.[0];

    expect(navigation).toBeDefined();
    expect(navigation).toContain('href="/contribute"');
    expect(navigation).toContain('Contribute');
    expect(navigation).toContain('href="/workspace"');
    expect(navigation).toContain('Owner sign in');
    expect(navigation).toContain(`href="${repositoryUrl}"`);
    expect(navigation).toContain('GitHub ↗');
    expect(navigation).toContain('target="_blank"');
    expect(navigation).toContain('rel="noopener noreferrer"');
    expect(markup.indexOf('class="landing-skip"')).toBeLessThan(markup.indexOf('<nav class="landing-site-nav"'));
    expect(markup).toContain('href="/deploy"');
    expect(markup).toContain('Deploy FREE CRM');
    expect(markup).not.toContain('Enter FREE CRM');
  });

  it('explains a safe, focused contribution loop on a public page', () => {
    const markup = renderToStaticMarkup(createElement(ContributePage));

    expect(markup).toContain('id="contribute-title"');
    expect(markup).toContain('Build FREE CRM');
    expect(markup).toContain('aria-label="How to contribute"');
    expect(markup).toContain('Choose one focused problem.');
    expect(markup).toContain('Fork and branch from main.');
    expect(markup).toContain('Build the full slice.');
    expect(markup).toContain('Validate, sign, and submit.');
    expect(markup).toContain(`href="${repositoryUrl}"`);
    expect(markup).toContain(`href="${contributionGuideUrl}"`);
    expect(markup).toContain('View FREE CRM on GitHub');
    expect(markup).toContain('Read the contribution guide');
    expect(markup).toContain('Do not publish it in an issue or pull request.');
    expect(markup.indexOf('<header')).toBeLessThan(markup.indexOf('<main'));
    expect(markup.indexOf('<main')).toBeLessThan(markup.indexOf('<footer'));
    expect(markup.match(/<main/g)).toHaveLength(1);

    const externalLinks = markup.match(/<a[^>]*target="_blank"[^>]*>/g) ?? [];
    expect(externalLinks.length).toBeGreaterThan(0);
    for (const link of externalLinks) expect(link).toContain('rel="noopener noreferrer"');
  });
});
