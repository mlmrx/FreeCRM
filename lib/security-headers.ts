export type SecurityHeader = Readonly<{ key: string; value: string }>;

export function contentSecurityPolicy(environment = process.env.NODE_ENV): string {
  const scriptSources = ["'self'", "'unsafe-inline'"];
  const connectSources = ["'self'"];

  // Next/Vinext injects inline bootstrap scripts in production. Development also
  // needs eval and websocket connections for HMR, but those allowances must not
  // escape into production responses.
  if (environment === 'development') {
    scriptSources.push("'unsafe-eval'");
    connectSources.push('ws:', 'wss:');
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${connectSources.join(' ')}`,
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "img-src 'self' data: blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    `script-src ${scriptSources.join(' ')}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ].join('; ');
}

export function securityHeaders(environment = process.env.NODE_ENV): readonly SecurityHeader[] {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(environment) },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  ] as const;
}
