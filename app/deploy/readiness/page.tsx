/* eslint-disable @next/next/no-html-link-for-pages -- Vinext production prefetch is intentionally avoided for reliable navigation. */
import type { Metadata } from 'next';

import { freeCrmRepositoryUrl } from '@/lib/public-config';

export const metadata: Metadata = {
  title: 'FREE CRM deployment readiness checklist',
  description: 'Check local, Docker, Vercel, or Cloudflare prerequisites before putting credentials or customer data into FREE CRM.',
};

const source = `${freeCrmRepositoryUrl}/blob/main`;

const readinessGroups = [
  {
    id: 'local',
    number: '01',
    title: 'Local device or Docker',
    summary: 'No cloud account, identity provider, or API key is required. Keep the listener private and back up the state you own.',
    checks: [
      { title: 'Supported runtime', copy: 'Node.js 22.13.0 or newer for native use, or a current Docker installation.', href: `${source}/README.md#run-on-one-device`, source: 'Device requirements' },
      { title: 'Reviewed repository state', copy: 'Use a clean clone of the release or protected main, preserve package-lock.json, and run the release checks before trusting a change.', href: `${source}/README.md#development-and-release-verification`, source: 'Release verification' },
      { title: 'Private runtime choice', copy: 'Use the loopback-only launcher or Docker volume. Do not expose local-owner mode directly to the internet.', href: `${source}/docs/CLOUD_DEPLOYMENT.md#device-and-docker`, source: 'Device and Docker guide' },
      { title: 'Identity and credentials', copy: 'Local-owner mode is only for loopback access. Local operation needs no cloud identity provider and no cloud credentials.', href: `${source}/SECURITY.md#deployment-checklist`, source: 'Security deployment checklist' },
      { title: 'Database and files', copy: 'Confirm the local D1/SQLite state directory or Docker volume is persistent and included in your backup routine.', href: `${source}/README.md#data-ownership-and-current-limits`, source: 'Ownership and limits' },
      { title: 'Cost and capacity', copy: 'The software is free. Your device, storage, backups, and network remain your responsibility; review the documented record envelope.', href: `${source}/README.md#data-ownership-and-current-limits`, source: 'Current limits' },
    ],
  },
  {
    id: 'cloud',
    number: '02',
    title: 'User-owned cloud',
    summary: 'Cloud credentials belong only in your provider secret store. Production stays sealed until storage and exact-owner identity are verified.',
    checks: [
      { title: 'Runtime and release path', copy: 'Choose native Vercel or the protected Cloudflare first-install path. Only reviewed main should become production.', href: `${source}/docs/CLOUD_DEPLOYMENT.md#choose-a-runtime`, source: 'Runtime comparison' },
      { title: 'Exact-owner identity', copy: 'Configure GitHub OAuth on Vercel or an exact-owner Cloudflare Access policy before entering data.', href: `${source}/docs/VERCEL_AUTH.md#github-oauth-application`, source: 'Identity setup' },
      { title: 'Durable database', copy: 'Provision user-owned D1 and apply the canonical migrations; Vercel additionally needs the narrowly scoped D1 RPC boundary.', href: `${source}/docs/VERCEL_DEPLOYMENT.md#1-create-the-user-owned-d1-data-plane`, source: 'D1 data plane' },
      { title: 'Private object storage', copy: 'Use private R2 on Cloudflare or private Vercel Blob. Do not enable a public bucket or object URL.', href: `${source}/docs/VERCEL_DEPLOYMENT.md#2-create-private-blob-storage`, source: 'Private file storage' },
      { title: 'User-supplied credentials', copy: 'Create least-privilege, short-lived provider credentials and store them as encrypted environment values—not source, commands, screenshots, or logs.', href: `${source}/SECURITY.md#credential-handling`, source: 'Credential handling' },
      { title: 'Provider cost and quotas', copy: 'FREE CRM has no subscription fee, but infrastructure providers may charge. Check current storage, request, build, and identity quotas in your own accounts.', href: `${source}/docs/CLOUD_DEPLOYMENT.md#choose-a-runtime`, source: 'Runtime ownership notes' },
      { title: 'Recovery and verification', copy: 'Verify the identity gate, health response, provider recovery copy, and a portable export before calling the deployment ready.', href: `${source}/docs/CLOUD_DEPLOYMENT.md#recovery-is-provider-state-not-the-portable-snapshot`, source: 'Recovery boundary' },
    ],
  },
] as const;

export default function DeploymentReadinessPage() {
  return (
    <div className="readiness-shell">
      <a className="skip-link" href="#readiness-content">Skip to readiness checklist</a>
      <div className="readiness-flag-line" aria-hidden="true"><i /><i /><i /></div>
      <header className="readiness-header"><a className="readiness-brand" href="/"><span>FREE</span> CRM</a><nav aria-label="Readiness navigation"><a href="/deploy">Deployment guide</a><a href="/tour">Product tour</a><a href={freeCrmRepositoryUrl} target="_blank" rel="noopener noreferrer">Source ↗</a></nav></header>
      <main id="readiness-content" tabIndex={-1}>
        <section className="readiness-hero" aria-labelledby="readiness-title"><p>Before you deploy</p><h1 id="readiness-title">Ready is a checklist.<br /><em>Not a green button.</em></h1><div><p>Choose a path, confirm every boundary, then deploy with credentials that stay in your account. This page links each check to the authoritative repository guidance.</p><a href="#readiness-local">Start the check <span>↓</span></a></div></section>
        <section className="readiness-groups" aria-label="Deployment readiness checks">
          {readinessGroups.map((group) => <article id={`readiness-${group.id}`} key={group.id}>
            <header><span>{group.number}</span><div><p>{group.id === 'local' ? 'NO CLOUD KEYS' : 'YOUR PROVIDER ACCOUNTS'}</p><h2>{group.title}</h2><small>{group.summary}</small></div></header>
            <ol>{group.checks.map((check) => <li key={check.title}><span aria-hidden="true" /><div><h3>{check.title}</h3><p>{check.copy}</p></div><a href={check.href} target="_blank" rel="noopener noreferrer" aria-label={`${check.source} for ${check.title}`}>{check.source} ↗</a></li>)}</ol>
          </article>)}
        </section>
        <aside className="readiness-redact" aria-labelledby="redaction-title"><p>SAFE DIAGNOSTICS</p><div><h2 id="redaction-title">Redact before you share.</h2><p>Remove tokens, cookies, email addresses, account and database identifiers, private URLs, customer records, request headers, environment values, and QR codes from screenshots, terminal output, issues, and support messages.</p></div><a href={`${source}/SECURITY.md#credential-handling`} target="_blank" rel="noopener noreferrer">Review credential safety ↗</a></aside>
        <section className="readiness-final"><p>EVERY CHECK COMPLETE?</p><h2>Deploy sealed.<br /><em>Verify before data.</em></h2><div><a href="/deploy">Choose a deployment path <span>→</span></a><a href="/tour">Stay in the synthetic tour</a></div></section>
      </main>
      <footer className="readiness-footer"><a href="/">FREE CRM</a><span>Open source · user-owned credentials</span><a href="/contribute">Improve this checklist →</a></footer>
    </div>
  );
}
