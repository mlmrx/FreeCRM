import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy, securityHeaders } from '@/lib/security-headers';
import nextConfig from '../next.config';
import { proxy } from '../proxy';

function headerMap(environment: 'development' | 'production' | 'test') {
  return new Map(securityHeaders(environment).map(({ key, value }) => [key.toLowerCase(), value]));
}

describe('browser security headers', () => {
  it('ships a production CSP that isolates executable and embedded content', () => {
    const policy = contentSecurityPolicy('production');

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toMatch(/connect-src[^;]*\bws:/);
  });

  it('limits HMR allowances to development', () => {
    const development = contentSecurityPolicy('development');
    const production = contentSecurityPolicy('production');

    expect(development).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(development).toContain("connect-src 'self' ws: wss:");
    expect(production).not.toContain("'unsafe-eval'");
    expect(production).not.toContain(' ws:');
  });

  it('keeps Next and Vinext responses on the same complete header contract', async () => {
    const expected = headerMap('test');
    expect(expected.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(expected.get('x-content-type-options')).toBe('nosniff');
    expect(expected.get('x-frame-options')).toBe('DENY');
    expect(expected.get('x-permitted-cross-domain-policies')).toBe('none');

    const response = proxy();
    for (const [key, value] of expected) expect(response.headers.get(key)).toBe(value);

    expect(nextConfig.headers).toBeTypeOf('function');
    const routes = await nextConfig.headers!();
    expect(routes).toHaveLength(1);
    expect(routes[0].source).toBe('/:path*');
    expect(new Map(routes[0].headers.map(({ key, value }) => [key.toLowerCase(), value]))).toEqual(expected);
  });
});
