'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext's production next/link prefetch currently throws before navigation. */

import { useState } from 'react';

import { freeCrmCloneUrl, freeCrmDeployUrl, freeCrmRepositoryUrl } from '@/lib/public-config';

export type Path = 'vercel' | 'cloudflare' | 'github' | 'docker';

const vercelDeployUrl = `https://vercel.com/new/clone?repository-url=${encodeURIComponent(freeCrmRepositoryUrl)}`;

const commands: Record<Path, string> = {
  vercel: `# Vercel project settings
Production Branch: main
Framework: Next.js
Root Directory: .
Build Command: npm run build:vercel
Install Command: npm ci

# Required Production environment variables
FREE_CRM_AUTH_MODE=authjs
NEXTAUTH_URL=https://freecrm.dev
NEXT_PUBLIC_SITE_URL=https://freecrm.dev
FREE_CRM_OWNER_EMAIL
AUTH_SECRET
AUTH_GITHUB_ID
AUTH_GITHUB_SECRET
FREE_CRM_D1_RPC_URL
FREE_CRM_D1_RPC_SECRET
FREE_CRM_D1_ACCESS_CLIENT_ID
FREE_CRM_D1_ACCESS_CLIENT_SECRET
BLOB_READ_WRITE_TOKEN`,
  cloudflare: `git clone ${freeCrmCloneUrl} free-crm
cd free-crm
npm ci
npx wrangler login
npm run deploy:cloudflare`,
  github: `# Add secrets to the cloudflare-production environment:
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
FREE_CRM_OWNER_EMAIL

# Then run: Actions → Deploy FREE CRM → Run workflow`,
  docker: `# Windows: double-click START-FREE-CRM.cmd

# macOS or Linux:
chmod +x scripts/start-local.sh
./scripts/start-local.sh

# Or run the same private device mode with Docker:
docker compose up --build

# Private server access from your computer:
ssh -L 3477:127.0.0.1:3477 user@your-server

# Open http://localhost:3477`,
};

const pathMeta: Record<Path, { number: string; label: string; note: string }> = {
  vercel: { number: '01', label: 'Vercel', note: 'GitHub main · Next.js' },
  cloudflare: { number: '02', label: 'Cloudflare', note: 'Worker · D1 + R2' },
  github: { number: '03', label: 'GitHub Action', note: 'Cloudflare first install' },
  docker: { number: '04', label: 'Local / Docker', note: 'No cloud keys' },
};

function CopyBlock({ path, onCopy, copied }: { path: Path; onCopy: (path: Path) => void | Promise<void>; copied: boolean }) {
  return (
    <div className="deploy-code-wrap">
      <div className="deploy-code-head"><span>Terminal</span><button type="button" aria-live="polite" onClick={() => void onCopy(path)}>{copied ? 'Copied' : 'Copy'}</button></div>
      <pre><code>{commands[path]}</code></pre>
    </div>
  );
}

export default function DeploymentCenter({ initialPath = 'vercel' }: { initialPath?: Path }) {
  const [path, setPath] = useState<Path>(initialPath);
  const [copied, setCopied] = useState<Path | null>(null);

  async function copy(selected: Path) {
    let succeeded = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(commands[selected]);
        succeeded = true;
      } catch {
        // Fall through to the compatibility path.
      }
    }
    if (!succeeded) {
    try {
      const fallback = document.createElement('textarea');
      fallback.value = commands[selected];
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.appendChild(fallback);
      try {
        fallback.select();
        succeeded = typeof document.execCommand === 'function' && document.execCommand('copy');
      } finally {
        fallback.remove();
      }
    } catch {
      // Clipboard support varies in embedded and permission-restricted browsers.
    }
    }
    if (!succeeded) return;
    setCopied(selected);
    window.setTimeout(() => setCopied((current) => current === selected ? null : current), 1800);
  }

  return (
    <main className="deploy-shell">
      <div className="deploy-flag-line" aria-hidden="true"><i /><i /><i /></div>
      <header className="deploy-header">
        <a className="deploy-brand" href="/"><span>FREE</span> CRM</a>
        <nav aria-label="Deployment navigation">
          <a href="/deploy/readiness">Readiness</a>
          <a href="/insights">Insights</a>
          <a href="/workspace">Workspace</a>
          <a href={freeCrmRepositoryUrl} target="_blank" rel="noreferrer">Source ↗</a>
        </nav>
      </header>

      <section className="deploy-hero">
        <p className="deploy-kicker">YOUR CLOUD · YOUR CREDENTIALS · YOUR DATA</p>
        <h1>Deploy your own<br /><em>FREE CRM.</em></h1>
        <p>Your account. Your database. Your files. FREE CRM never receives your provider credentials. No cloud credentials? Run locally or in Docker with no cloud keys.</p>
        <div className="deploy-trust-row" aria-label="Deployment guarantees">
          <span><i>✓</i> MIT licensed</span><span><i>✓</i> Private by default</span><span><i>✓</i> Export anytime</span>
        </div>
        <a className="deploy-readiness-link" href="/deploy/readiness">Check deployment readiness before using credentials <span>→</span></a>
      </section>

      <section className="deploy-paths" aria-labelledby="choose-deployment-path">
        <div className="deploy-section-head">
          <p>01 / CHOOSE</p>
          <h2 id="choose-deployment-path">Where should it live?</h2>
        </div>
        <div className="deploy-path-tabs" role="tablist" aria-label="Deployment paths">
          {(Object.keys(pathMeta) as Path[]).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={path === item} aria-controls={`deploy-panel-${item}`} onClick={() => setPath(item)}>
              <span>{pathMeta[item].number}</span><strong>{pathMeta[item].label}</strong><small>{pathMeta[item].note}</small><i aria-hidden="true">→</i>
            </button>
          ))}
        </div>

        <div className="deploy-guide-layout">
          <ol className="deploy-step-rail" aria-label="Deployment sequence">
            <li className="active"><span>1</span><div><strong>Choose</strong><small>Pick a home</small></div></li>
            <li><span>2</span><div><strong>Protect</strong><small>Set private access</small></div></li>
            <li><span>3</span><div><strong>Provision</strong><small>Create storage</small></div></li>
            <li><span>4</span><div><strong>Deploy</strong><small>Build and migrate</small></div></li>
            <li><span>5</span><div><strong>Verify</strong><small>Open and back up</small></div></li>
          </ol>

          {path === 'vercel' && (
            <article id="deploy-panel-vercel" role="tabpanel" className="deploy-panel">
              <div className="deploy-panel-title"><div><span className="deploy-recommended">RECOMMENDED</span><h2>GitHub main → Vercel</h2></div><span className="deploy-time">native Next.js</span></div>
              <p>Vercel builds this repository directly from the protected <b>main</b> branch. There is no ChatGPT Sites proxy and no ChatGPT login. GitHub OAuth protects the exact owner; Cloudflare D1 and private Vercel Blob keep durable data in accounts you control.</p>
              <a className="deploy-primary" href={vercelDeployUrl} target="_blank" rel="noreferrer">Import repository into Vercel <span>↗</span></a>
              <div className="deploy-seal-note"><span>◈</span><p><strong>Starts sealed</strong>Missing OAuth, D1, or Blob configuration never falls back to a public or in-memory workspace. Configure all user-owned credentials before promoting <b>main</b>.</p></div>
              <div className="deploy-instructions">
                <section><span>01</span><div><h3>Create the protected D1 data plane</h3><p>Create D1 in your Cloudflare account, apply canonical migrations, and deploy the narrow RPC Worker. Select that Worker by name in Cloudflare Access, protect production and previews, and add a <b>Service Auth</b> policy for one dedicated service token. Vercel receives that token, the endpoint, and a separate 32-byte HMAC secret—never a Cloudflare account token.</p></div></section>
                <section><span>02</span><div><h3>Create private Blob storage</h3><p>In the Vercel project Storage tab, create a <b>Private</b> Blob store. Vercel injects <code>BLOB_READ_WRITE_TOKEN</code>. Private document bytes are streamed only after owner authorization.</p></div></section>
                <section><span>03</span><div><h3>Create GitHub owner login</h3><p>Create a GitHub OAuth app with callback <code>https://freecrm.dev/api/auth/callback/github</code>. Add its client values, a random <code>AUTH_SECRET</code>, and the exact verified owner email as encrypted Production variables.</p></div></section>
                <CopyBlock path="vercel" onCopy={copy} copied={copied === 'vercel'} />
                <section><span>04</span><div><h3>Connect and promote main</h3><p>Use the settings above, attach both domains, and keep <b>freecrm.dev</b> canonical. Pull requests become previews; only <b>main</b> becomes Production. <a href={`${freeCrmRepositoryUrl}/blob/main/docs/VERCEL_DEPLOYMENT.md`} target="_blank" rel="noreferrer">Open the complete runbook ↗</a></p></div></section>
              </div>
            </article>
          )}

          {path === 'cloudflare' && (
            <article id="deploy-panel-cloudflare" role="tabpanel" className="deploy-panel">
              <div className="deploy-panel-title"><div><span className="deploy-recommended">RECOMMENDED</span><h2>Cloudflare guided launch</h2></div><span className="deploy-time">≈ 4 min</span></div>
              <p>This protected first-install path provisions a sealed Worker, D1 database, and private R2 bucket in your Cloudflare account. A short Access step then admits only you. Existing Workers are refused before any migration or deployment.</p>
              <a className="deploy-primary" href={freeCrmDeployUrl} target="_blank" rel="noreferrer">Provision on Cloudflare <span>↗</span></a>
              <div className="deploy-seal-note"><span>◈</span><p><strong>Secure handoff</strong>The new instance stays sealed until Cloudflare Access has a team domain and application audience. There is no public-owner fallback.</p></div>
              <div className="deploy-instructions">
                <section><span>01</span><div><h3>Prefer a guided terminal?</h3><p>Node 22.13+, Git, and a Cloudflare account are the only prerequisites. Wrangler opens Cloudflare sign-in in your browser; FREE CRM never sees the login.</p></div></section>
                <CopyBlock path="cloudflare" onCopy={copy} copied={copied === 'cloudflare'} />
                <section><span>02</span><div><h3>Protect the entire Worker</h3><p>In Cloudflare, open <b>Workers &amp; Pages → free-crm → Settings → Domains &amp; Routes → Access</b>. Protect <b>all traffic</b> and allow your exact email.</p></div></section>
                <section><span>03</span><div><h3>Activate verified identity</h3><p>In the Worker dashboard, set <code>FREE_CRM_AUTH_MODE=cloudflare-access</code>, then add <code>FREE_CRM_ACCESS_TEAM_DOMAIN</code>, <code>FREE_CRM_ACCESS_AUD</code>, and <code>FREE_CRM_OWNER_EMAIL</code>. Use the dashboard Save/Deploy action—do not rerun the first-install build. The app verifies the JWT and exact owner again before touching CRM data.</p></div></section>
              </div>
              <details className="deploy-details"><summary>Least-privilege token permissions</summary><p>For CI, scope the token to one account with Workers Scripts: Edit, D1: Edit, Workers R2 Storage: Edit, Access: Apps and Policies: Edit, and Access: Organizations, Identity Providers, and Groups: Read. The last permission only discovers your team domain.</p></details>
            </article>
          )}

          {path === 'github' && (
            <article id="deploy-panel-github" role="tabpanel" className="deploy-panel">
              <div className="deploy-panel-title"><div><span className="deploy-recommended">FIRST INSTALL</span><h2>GitHub deployment</h2></div><span className="deploy-time">reviewed launch</span></div>
              <p>Fork the repository, keep credentials in a protected GitHub Environment, and run the reviewed first-install workflow. It intentionally refuses an existing Worker; automated cloud upgrades are not implemented yet.</p>
              <a className="deploy-primary" href={`${freeCrmRepositoryUrl}/actions/workflows/deploy-cloudflare.yml`} target="_blank" rel="noreferrer">Open deployment action <span>↗</span></a>
              <div className="deploy-instructions">
                <section><span>01</span><div><h3>Create a Cloudflare API token</h3><p>Scope it to the account that will own the Worker, D1 database, and R2 bucket. Never commit it or paste it into FREE CRM.</p></div></section>
                <section><span>02</span><div><h3>Add protected environment secrets</h3><p>Create the <code>cloudflare-production</code> environment, require approval if desired, and add the three values below.</p></div></section>
                <CopyBlock path="github" onCopy={copy} copied={copied === 'github'} />
                <section><span>03</span><div><h3>Run and verify</h3><p>The workflow requires all owner credentials, validates the release, proves resource ownership, audits the Access policy, and reports success only after unauthenticated CRM access is denied.</p></div></section>
              </div>
            </article>
          )}

          {path === 'docker' && (
            <article id="deploy-panel-docker" role="tabpanel" className="deploy-panel">
              <div className="deploy-panel-title"><div><span className="deploy-recommended">NO CLOUD KEYS</span><h2>Local or Docker launch</h2></div><span className="deploy-time">≈ 2 min</span></div>
              <p>Run FREE CRM directly on your laptop or use Docker on a device or private server. Neither path needs a Cloudflare account, deployment token, or third-party API key.</p>
              <CopyBlock path="docker" onCopy={copy} copied={copied === 'docker'} />
              <div className="deploy-seal-note"><span>⌂</span><p><strong>Keep it private</strong>Do not expose local-owner mode directly to the internet. On a VM, keep port 3477 firewalled and reach it through the SSH tunnel shown above.</p></div>
              <div className="deploy-instructions">
                <section><span>01</span><div><h3>Choose native or Docker</h3><p>The native launcher keeps data in <code>.wrangler/state</code>. Docker uses the <code>free-crm-data</code> volume. Both bind only to this machine.</p></div></section>
                <section><span>02</span><div><h3>Back up before upgrades</h3><p>Back up the local state directory or Docker volume, pull a reviewed release, and rebuild. Forward-only D1 migrations run before requests are served.</p></div></section>
              </div>
            </article>
          )}
        </div>
      </section>

      <section className="deploy-finish">
        <p>05 / VERIFY</p><h2>A deployment is finished when it is private, recoverable, and yours.</h2>
        <div><span><b>1</b>Open the workspace through its identity gate.</span><span><b>2</b>Test a portable snapshot and maintain provider recovery copies.</span><span><b>3</b>Keep provider credentials in provider secret stores.</span></div>
      </section>

      <footer className="deploy-footer"><a href="/">FREE CRM</a><p>Open source. Free forever. Infrastructure providers may charge for usage.</p><a href="/workspace">Open workspace →</a></footer>
      <p className="sr-only" aria-live="polite">{copied ? `${pathMeta[copied].label} instructions copied.` : ''}</p>
    </main>
  );
}
