import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ErrorScreen } from '@/app/crm-app';

describe('workspace entry experience', () => {
  it('turns a sealed deployment into actionable setup guidance', () => {
    const markup = renderToStaticMarkup(createElement(ErrorScreen, {
      message: 'This FREE CRM deployment is sealed until an identity provider is configured.',
      onRetry: vi.fn(),
    }));

    expect(markup).toContain('Finish workspace setup');
    expect(markup).toContain('href="/deploy"');
    expect(markup).toContain('Complete deployment setup');
    expect(markup).toContain('href="/"');
    expect(markup).not.toContain('Try again');
  });

  it('keeps GitHub sign-in available when authentication is configured', () => {
    const markup = renderToStaticMarkup(createElement(ErrorScreen, {
      message: 'Sign in with GitHub to open this workspace.',
      onRetry: vi.fn(),
    }));

    expect(markup).toContain('Sign in to FREE CRM');
    expect(markup).toContain('href="/api/auth/signin?callbackUrl=/workspace"');
    expect(markup).toContain('Continue with GitHub');
  });
});
