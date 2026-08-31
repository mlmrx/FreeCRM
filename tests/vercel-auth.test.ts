import { encode } from 'next-auth/jwt';
import { describe, expect, it } from 'vitest';
import {
  authorizeVercelRequest,
  createVercelAuthOptions,
  readVercelAuthSettings,
  VercelAuthConfigurationError,
  type VercelAuthEnvironment,
} from '@/server/vercel-auth';

const validEnvironment: VercelAuthEnvironment = {
  AUTH_SECRET: 'this-is-a-test-only-secret-with-at-least-32-characters',
  AUTH_GITHUB_ID: 'Iv1.testclient',
  AUTH_GITHUB_SECRET: 'test-only-github-client-secret',
  FREE_CRM_OWNER_EMAIL: 'Owner@Example.com',
  NEXTAUTH_URL: 'https://freecrm.dev',
};

describe('Vercel Auth.js configuration', () => {
  it('normalizes the exact owner and pins secure production cookies', () => {
    expect(readVercelAuthSettings(validEnvironment)).toMatchObject({
      ownerEmail: 'owner@example.com',
      canonicalOrigin: 'https://freecrm.dev',
      secureCookies: true,
    });
    const options = createVercelAuthOptions(validEnvironment);
    expect(options.providers.map((provider) => provider.id)).toEqual(['github']);
    expect(options.session).toMatchObject({ strategy: 'jwt', maxAge: 28_800 });
    expect(options.debug).toBe(false);
  });

  it.each([
    [{ ...validEnvironment, AUTH_SECRET: 'too-short' }],
    [{ ...validEnvironment, AUTH_GITHUB_SECRET: undefined }],
    [{ ...validEnvironment, FREE_CRM_OWNER_EMAIL: 'owner＠example.com' }],
    [{ ...validEnvironment, NEXTAUTH_URL: 'http://freecrm.dev' }],
    [{ ...validEnvironment, NEXTAUTH_URL: 'https://freecrm.dev/auth' }],
  ])('fails closed for incomplete or unsafe settings', (environment) => {
    expect(() => readVercelAuthSettings(environment)).toThrow(VercelAuthConfigurationError);
  });
});

describe('Vercel owner session authorization', () => {
  it('accepts a signed Auth.js owner session and returns a stable GitHub actor', async () => {
    const token = await encode({
      secret: validEnvironment.AUTH_SECRET!,
      maxAge: 60,
      token: {
        email: 'owner@example.com',
        name: 'CRM Owner',
        freeCrmAuthProvider: 'github',
        freeCrmUserId: 'github:123456',
      },
    });
    const request = new Request('https://freecrm.dev/api/v1/bootstrap', {
      headers: {
        cookie: `__Secure-next-auth.session-token=${encodeURIComponent(token)}`,
        'x-request-id': 'request-from-vercel',
      },
    });

    await expect(authorizeVercelRequest(request, validEnvironment)).resolves.toEqual({
      status: 'authorized',
      identity: {
        userId: 'github:123456',
        email: 'owner@example.com',
        displayName: 'CRM Owner',
        requestId: 'request-from-vercel',
      },
    });
  });

  it('rejects a validly signed session for any other email', async () => {
    const token = await encode({
      secret: validEnvironment.AUTH_SECRET!,
      maxAge: 60,
      token: {
        email: 'other@example.com',
        freeCrmAuthProvider: 'github',
        freeCrmUserId: 'github:123456',
      },
    });
    const request = new Request('https://freecrm.dev/api/v1/bootstrap', {
      headers: { cookie: `__Secure-next-auth.session-token=${token}` },
    });

    await expect(authorizeVercelRequest(request, validEnvironment)).resolves.toEqual({ status: 'forbidden' });
  });

  it('rejects missing, tampered, and ambiguous session cookies', async () => {
    const missing = new Request('https://freecrm.dev/api/v1/bootstrap');
    const tampered = new Request('https://freecrm.dev/api/v1/bootstrap', {
      headers: { cookie: '__Secure-next-auth.session-token=not-a-jwt' },
    });
    const ambiguous = new Request('https://freecrm.dev/api/v1/bootstrap', {
      headers: {
        cookie: '__Secure-next-auth.session-token=a; __Secure-next-auth.session-token.0=b',
      },
    });

    await expect(authorizeVercelRequest(missing, validEnvironment)).resolves.toEqual({ status: 'unauthenticated' });
    await expect(authorizeVercelRequest(tampered, validEnvironment)).resolves.toEqual({ status: 'unauthenticated' });
    await expect(authorizeVercelRequest(ambiguous, validEnvironment)).resolves.toEqual({ status: 'unauthenticated' });
  });
});
