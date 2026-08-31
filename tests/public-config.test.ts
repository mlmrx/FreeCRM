import { describe, expect, it } from 'vitest';

import { resolveRepositoryUrl } from '@/lib/public-config';

describe('public source configuration', () => {
  it('uses the canonical source when no fork is configured', () => {
    expect(resolveRepositoryUrl()).toBe('https://github.com/mlmrx/FreeCRM');
  });

  it('accepts a simple HTTPS GitHub fork and normalizes a git suffix', () => {
    expect(resolveRepositoryUrl('https://github.com/example/free-crm.git')).toBe('https://github.com/example/free-crm');
  });

  it.each([
    'http://github.com/example/free-crm',
    `https://${['user', 'synthetic'].join(':')}@github.com/example/free-crm`,
    'https://github.com/example/free-crm?token=secret',
    'https://github.com/example/free-crm/extra',
    'https://example.com/example/free-crm',
    'not a URL',
  ])('rejects unsafe or non-repository source URLs: %s', (value) => {
    expect(resolveRepositoryUrl(value)).toBe('https://github.com/mlmrx/FreeCRM');
  });
});
