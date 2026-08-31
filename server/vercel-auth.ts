import type { NextAuthOptions } from 'next-auth';
import { decode, type JWT } from 'next-auth/jwt';
import GitHubProvider, {
  type GithubEmail,
  type GithubProfile,
} from 'next-auth/providers/github';

const AUTH_SESSION_SECONDS = 8 * 60 * 60;
const MAX_SESSION_TOKEN_BYTES = 32_768;
const GITHUB_API_VERSION = '2022-11-28';

export type VercelAuthEnvironment = {
  AUTH_SECRET?: string;
  AUTH_GITHUB_ID?: string;
  AUTH_GITHUB_SECRET?: string;
  FREE_CRM_OWNER_EMAIL?: string;
  NEXTAUTH_URL?: string;
};

export type VercelAuthSettings = {
  secret: string;
  githubClientId: string;
  githubClientSecret: string;
  ownerEmail: string;
  canonicalOrigin: string;
  secureCookies: boolean;
};

export type VercelAuthIdentity = {
  userId: string;
  email: string;
  displayName: string;
  requestId: string;
};

export type VercelAuthDecision =
  | { status: 'authorized'; identity: VercelAuthIdentity }
  | { status: 'unauthenticated' }
  | { status: 'forbidden' };

export class VercelAuthConfigurationError extends Error {
  constructor() {
    super('Vercel authentication is not configured.');
    this.name = 'VercelAuthConfigurationError';
  }
}

function configurationError(): never {
  throw new VercelAuthConfigurationError();
}

function requiredSingleLine(
  value: string | undefined,
  { minLength = 1, maxLength }: { minLength?: number; maxLength: number },
): string {
  if (
    !value
    || value !== value.trim()
    || value.length < minLength
    || value.length > maxLength
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return configurationError();
  }
  return value;
}

function normalizedEmail(value: unknown): string | null {
  if (typeof value !== 'string' || value !== value.trim() || value.length > 254) return null;
  // The owner allowlist intentionally accepts ASCII mailboxes only. That keeps the
  // comparison independent of Unicode normalization performed by a provider.
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(value)) {
    return null;
  }
  return value.toLowerCase();
}

function canonicalOrigin(value: string | undefined): URL {
  const raw = requiredSingleLine(value, { maxLength: 2_048 });
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return configurationError();
  }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !localHttp)
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    return configurationError();
  }
  return url;
}

export function readVercelAuthSettings(
  environment: VercelAuthEnvironment = process.env,
): VercelAuthSettings {
  const ownerEmail = normalizedEmail(environment.FREE_CRM_OWNER_EMAIL);
  if (!ownerEmail) return configurationError();

  const secret = requiredSingleLine(environment.AUTH_SECRET, { minLength: 32, maxLength: 1_024 });
  const githubClientId = requiredSingleLine(environment.AUTH_GITHUB_ID, { minLength: 8, maxLength: 256 });
  const githubClientSecret = requiredSingleLine(environment.AUTH_GITHUB_SECRET, { minLength: 20, maxLength: 512 });
  const url = canonicalOrigin(environment.NEXTAUTH_URL);

  return {
    secret,
    githubClientId,
    githubClientSecret,
    ownerEmail,
    canonicalOrigin: url.origin,
    secureCookies: url.protocol === 'https:',
  };
}

function isGithubProfile(value: unknown): value is GithubProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<GithubProfile>;
  return Number.isSafeInteger(profile.id)
    && typeof profile.login === 'string'
    && profile.login.length > 0
    && profile.login.length <= 256;
}

function isVerifiedOwnerEmail(value: unknown, ownerEmail: string): value is GithubEmail {
  if (!value || typeof value !== 'object') return false;
  const email = value as Partial<GithubEmail>;
  return email.verified === true && normalizedEmail(email.email) === ownerEmail;
}

function verifiedGithubProvider(settings: VercelAuthSettings) {
  const provider = GitHubProvider<GithubProfile>({
    clientId: settings.githubClientId,
    clientSecret: settings.githubClientSecret,
  });

  // GitHub's public profile email is optional and is not sufficient for an
  // owner allowlist. Always inspect the authenticated account's verified email
  // collection and expose only the configured owner email to Auth.js.
  provider.userinfo = {
    url: 'https://api.github.com/user',
    async request({ tokens }) {
      const accessToken = tokens.access_token;
      if (!accessToken || accessToken.length > 4_096) throw new Error('GitHub did not issue a usable access token.');

      const headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'free-crm',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      };
      const requestOptions: RequestInit = {
        cache: 'no-store',
        headers,
        signal: AbortSignal.timeout(10_000),
      };
      const [profileResponse, emailsResponse] = await Promise.all([
        fetch('https://api.github.com/user', requestOptions),
        fetch('https://api.github.com/user/emails?per_page=100', requestOptions),
      ]);
      if (!profileResponse.ok || !emailsResponse.ok) {
        throw new Error('GitHub could not verify this account.');
      }

      const profile: unknown = await profileResponse.json();
      const emails: unknown = await emailsResponse.json();
      if (!isGithubProfile(profile) || !Array.isArray(emails) || !emails.some((email) => isVerifiedOwnerEmail(email, settings.ownerEmail))) {
        throw new Error('GitHub account is not the configured FREE CRM owner.');
      }

      return {
        ...profile,
        sub: profile.id.toString(),
        name: profile.name ?? profile.login,
        email: settings.ownerEmail,
        image: profile.avatar_url,
      };
    },
  };

  return provider;
}

function safeDisplayName(value: unknown, email: string): string {
  if (typeof value === 'string') {
    const clean = value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200);
    if (clean) return clean;
  }
  return email.split('@')[0] || email;
}

function isOwnerToken(token: JWT, settings: VercelAuthSettings): boolean {
  return token.freeCrmAuthProvider === 'github'
    && typeof token.freeCrmUserId === 'string'
    && /^github:\d{1,32}$/.test(token.freeCrmUserId)
    && normalizedEmail(token.email) === settings.ownerEmail;
}

export function createVercelAuthOptions(
  environment: VercelAuthEnvironment = process.env,
): NextAuthOptions {
  const settings = readVercelAuthSettings(environment);
  return {
    secret: settings.secret,
    useSecureCookies: settings.secureCookies,
    debug: false,
    providers: [verifiedGithubProvider(settings)],
    session: {
      strategy: 'jwt',
      maxAge: AUTH_SESSION_SECONDS,
    },
    jwt: {
      maxAge: AUTH_SESSION_SECONDS,
    },
    callbacks: {
      async signIn({ user, account }) {
        return account?.provider === 'github'
          && /^\d{1,32}$/.test(account.providerAccountId)
          && normalizedEmail(user.email) === settings.ownerEmail;
      },
      async jwt({ token, account, user }) {
        if (account || user) {
          if (
            account?.provider !== 'github'
            || !/^\d{1,32}$/.test(account.providerAccountId)
            || normalizedEmail(user?.email) !== settings.ownerEmail
          ) {
            throw new Error('FREE CRM refused an unauthorized owner session.');
          }
          token.email = settings.ownerEmail;
          token.freeCrmAuthProvider = 'github';
          token.freeCrmUserId = `github:${account.providerAccountId}`;
        }
        return token;
      },
      async session({ session, token }) {
        if (!isOwnerToken(token, settings)) throw new Error('FREE CRM refused an unauthorized owner session.');
        return {
          ...session,
          user: {
            ...session.user,
            email: settings.ownerEmail,
            name: safeDisplayName(token.name, settings.ownerEmail),
          },
        };
      },
      async redirect({ url, baseUrl }) {
        let destination: URL;
        try {
          destination = new URL(url, baseUrl);
        } catch {
          return baseUrl;
        }
        return destination.origin === new URL(baseUrl).origin ? destination.toString() : baseUrl;
      },
    },
  };
}

function decodedCookieValue(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function sessionTokenFromCookieHeader(request: Request, secureCookies: boolean): string | null {
  const header = request.headers.get('cookie');
  if (!header || header.length > MAX_SESSION_TOKEN_BYTES * 2) return null;
  const cookieName = `${secureCookies ? '__Secure-' : ''}next-auth.session-token`;
  let complete: string | null = null;
  const chunks = new Map<number, string>();

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = decodedCookieValue(part.slice(separator + 1).trim());
    if (value === null) return null;
    if (name === cookieName) {
      if (complete !== null) return null;
      complete = value;
      continue;
    }
    const match = name.match(new RegExp(`^${cookieName.replaceAll('.', '\\.')}\\.(\\d+)$`));
    if (!match) continue;
    const index = Number(match[1]);
    if (!Number.isSafeInteger(index) || chunks.has(index) || index > 32) return null;
    chunks.set(index, value);
  }

  if (complete !== null && chunks.size > 0) return null;
  const orderedChunks = Array.from(chunks.entries()).sort(([left], [right]) => left - right);
  if (complete === null && orderedChunks.some(([index], position) => index !== position)) return null;
  const token = complete ?? orderedChunks.map(([, value]) => value).join('');
  if (!token || new TextEncoder().encode(token).byteLength > MAX_SESSION_TOKEN_BYTES) return null;
  return token;
}

function requestId(request: Request): string {
  const supplied = request.headers.get('x-request-id');
  if (supplied && supplied.length <= 128 && !/[\u0000-\u001f\u007f]/.test(supplied)) return supplied;
  return crypto.randomUUID();
}

export async function authorizeVercelRequest(
  request: Request,
  environment: VercelAuthEnvironment = process.env,
): Promise<VercelAuthDecision> {
  const settings = readVercelAuthSettings(environment);
  const encoded = sessionTokenFromCookieHeader(request, settings.secureCookies);
  if (!encoded) return { status: 'unauthenticated' };

  let token: JWT | null;
  try {
    token = await decode({ token: encoded, secret: settings.secret });
  } catch {
    return { status: 'unauthenticated' };
  }
  if (!token) return { status: 'unauthenticated' };
  if (!isOwnerToken(token, settings)) return { status: 'forbidden' };

  return {
    status: 'authorized',
    identity: {
      userId: token.freeCrmUserId as string,
      email: settings.ownerEmail,
      displayName: safeDisplayName(token.name, settings.ownerEmail),
      requestId: requestId(request),
    },
  };
}
