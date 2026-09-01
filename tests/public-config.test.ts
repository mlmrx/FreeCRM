import { describe, expect, it } from 'vitest';

import { resolveContributingUrl, resolveRepositoryUrl } from '@/lib/public-config';

describe('public source configuration', () => {
  it('uses the canonical source when no fork is configured', () => {
    expect(resolveRepositoryUrl()).toBe('https://github.com/mlmrx/FreeCRM');
    expect(resolveContributingUrl()).toBe('https://github.com/mlmrx/FreeCRM/blob/main/CONTRIBUTING.md');
  });

  it('accepts a simple HTTPS GitHub fork and normalizes a git suffix', () => {
    expect(resolveRepositoryUrl('https://github.com/example/free-crm.git')).toBe('https://github.com/example/free-crm');
    expect(resolveContributingUrl('https://github.com/example/free-crm.git')).toBe('https://github.com/example/free-crm/blob/main/CONTRIBUTING.md');
  });

  it.each([
    'http://github.com/example/free-crm',
    `https://${['user', 'synthetic'].join(':')}@github.com/example/free-crm`,
    'https://github.com/example/free-crm?token=secret',
    'https://github.com/example/free-crm#fragment',
    'https://github.com:444/example/free-crm',
    'https://github.com/example/free-crm/extra',
    'https://github.com/example',
    'https://github.example/example/free-crm',
    'https://example.com/example/free-crm',
    '//github.com/example/free-crm',
    'javascript:alert(1)',
    'not a URL',
  ])('rejects unsafe or non-repository source URLs: %s', (value) => {
    expect(resolveRepositoryUrl(value)).toBe('https://github.com/mlmrx/FreeCRM');
    expect(resolveContributingUrl(value)).toBe('https://github.com/mlmrx/FreeCRM/blob/main/CONTRIBUTING.md');
  });

  it('derives clean source and contribution URLs from the validated repository root', () => {
    for (const value of [resolveRepositoryUrl(), resolveContributingUrl()]) {
      const url = new URL(value);
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toBe('github.com');
      expect(url.username).toBe('');
      expect(url.password).toBe('');
      expect(url.search).toBe('');
      expect(url.hash).toBe('');
    }
    expect(new URL(resolveContributingUrl()).pathname).toMatch(/\/blob\/main\/CONTRIBUTING\.md$/);
  });
});
