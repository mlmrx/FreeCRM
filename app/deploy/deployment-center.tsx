'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext's production next/link prefetch currently throws before navigation. */

import { T, LocalizedAttributes } from '@/app/localized-text';
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
      <div className="deploy-code-head"><span><T text="Terminal" /></span><button type="button" aria-live="polite" onClick={() => void onCopy(path)}>{copied ? <T text="Copied" /> : <T text="Copy" />}</button></div>
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
        <LocalizedAttributes names={["aria-label"]}><nav aria-label="Deployment navigation">
          <a href="/deploy/readiness"><T text="Readiness" /></a>
          <a href="/insights"><T text="Insights" /></a>
          <a href="/workspace"><T text="Workspace" /></a>
          <a href={freeCrmRepositoryUrl} target="_blank" rel="noreferrer"><T text="Source ↗" /></a>
        </nav></LocalizedAttributes>
      </header>

      <section className="deploy-hero">
        <p className="deploy-kicker"><T text="YOUR CLOUD · YOUR CREDENTIALS · YOUR DATA" /></p>
        <h1><T text="Deploy your own" /><br /><em><T text="FREE CRM." /></em></h1>
        <p><T text="Your account. Your database. Your files. FREE CRM never receives your provider credentials. No cloud credentials? Run locally or in Docker with no cloud keys." /></p>
        <LocalizedAttributes names={["aria-label"]}><div className="deploy-trust-row" aria-label="Deployment guarantees">
          <span><i>✓</i><T text=" MIT licensed" /></span><span><i>✓</i><T text=" Private by default" /></span><span><i>✓</i><T text=" Export anytime" /></span>
        </div></LocalizedAttributes>
        <a className="deploy-readiness-link" href="/deploy/readiness"><T text="Check deployment readiness before using credentials " /><span>→</span></a>
      </section>

      <section className="deploy-paths" aria-labelledby="choose-deployment-path">
        <div className="deploy-section-head">
          <p><T text="01 / CHOOSE" /></p>
          <h2 id="choose-deployment-path"><T text="Where should it live?" /></h2>
        </div>
        <LocalizedAttributes names={["aria-label"]}><div className="deploy-path-tabs" role="tablist" aria-label="Deployment paths">
          {(Object.keys(pathMeta) as Path[]).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={path === item} aria-controls={`deploy-panel-${item}`} onClick={() => setPath(item)}>
              <span>{pathMeta[item].number}</span><strong><T text={pathMeta[item].label} /></strong><small><T text={pathMeta[item].note} /></small><i aria-hidden="true">→</i>
            </button>
          ))}
        </div></LocalizedAttributes>

        <div className="deploy-guide-layout">
          <LocalizedAttributes names={["aria-label"]}><ol className="deploy-step-rail" aria-label="Deployment sequence">
            <li className="active"><span>1</span><div><strong><T text="Choose" /></strong><small><T text="Pick a home" /></small></div></li>
            <li><span>2</span><div><strong><T text="Protect" /></strong><small><T text="Set private access" /></small></div></li>
            <li><span>3</span><div><strong><T text="Provision" /></strong><small><T text="Create storage" /></small></div></li>
            <li><span>4</span><div><strong><T text="Deploy" /></strong><small><T text="Build and migrate" /></small></div></li>
            <li><span>5</span><div><strong><T text="Verify" /></strong><small><T text="Open and back up" /></small></div></li>
          </ol></LocalizedAttributes>

          {path === 'vercel' && (
            <article id="deploy-panel-vercel" role="tabpanel" className="deploy-panel">
              <div className="deploy-panel-title"><div><span className="deploy-recommended"><T text="RECOMMENDED" /></span><h2><T text="GitHub main → Vercel" /></h2></div><span className="deploy-time"><T text="native Next.js" /></span></div>
              <p><T text="Vercel builds this repository directly from the protected " /><b>main</b><T text=" branch. There is no ChatGPT Sites proxy and no ChatGPT login. GitHub OAuth protects the exact owner; Cloudflare D1 and private Vercel Blob keep durable data in accounts you control." /></p>
              <a className="deploy-primary" href={vercelDeployUrl} target="_blank" rel="noreferrer"><T text="Import repository into Vercel " /><span>↗</span></a>
              <div className="deploy-seal-note"><span>◈</span><p><strong><T text="Starts sealed" /></strong><T text="Missing OAuth, D1, or Blob configuration never falls back to a public or in-memory workspace. Configure all user-owned credentials before promoting " /><b>main</b>.</p></div>
              <div className="deploy-instructions">
                <section><span>01</span><div><h3><T text="Create the protected D1 data plane" /></h3><p><T text="Create D1 in your Cloudflare account, apply canonical migrations, and deploy the narrow RPC Worker. Select that Worker by name in Cloudflare Access, protect production and previews, and add a " /><b><T text="Service Auth" /></b><T text=" policy for one dedicated service token. Vercel receives that token, the endpoint, and a separate 32-byte HMAC secret—never a Cloudflare account token." /></p></div></section>
                <section><span>02</span><div><h3><T text="Create private Blob storage" /></h3><p><T text="In the Vercel project Storage tab, create a " /><b><T text="Private" /></b><T text=" Blob store. Vercel injects " /><code>BLOB_READ_WRITE_TOKEN</code><T text=". Private document bytes are streamed only after owner authorization." /></p></div></section>
                <section><span>03</span><div><h3><T text="Create GitHub owner login" /></h3><p><T text="Create a GitHub OAuth app with callback " /><code>https://freecrm.dev/api/auth/callback/github</code><T text=". Add its client values, a random " /><code>AUTH_SECRET</code><T text=", and the exact verified owner email as encrypted Production variables." /></p></div></section>
                <CopyBlock path="vercel" onCopy={copy} copied={copied === 'vercel'} />
                <section><span>04</span><div><h3><T text="Connect and promote main" /></h3><p><T text="Use the settings above, attach both domains, and keep " /><b>freecrm.dev</b><T text=" canonical. Pull requests become previews; only " /><b>main</b><T text=" becomes Production. " /><a href={`${freeCrmRepositoryUrl}/blob/main/docs/VERCEL_DEPLOYMENT.md`} target="_blank" rel="noreferrer"><T text="Open the complete runbook ↗" /></a></p></div></section>
              </div>
            </article>
          )}

          {path === 'cloudflare' && (
            <article id="deploy-panel-cloudflare" role="tabpanel" className="deploy-panel">
              <div className="deploy-panel-title"><div><span className="deploy-recommended"><T text="RECOMMENDED" /></span><h2><T text="Cloudflare guided launch" /></h2></div><span className="deploy-time"><T text="≈ 4 min" /></span></div>
              <p><T text="This protected first-install path provisions a sealed Worker, D1 database, and private R2 bucket in your Cloudflare account. A short Access step then admits only you. Existing Workers are refused before any migration or deployment." /></p>
              <a className="deploy-primary" href={freeCrmDeployUrl} target="_blank" rel="noreferrer"><T text="Provision on Cloudflare " /><span>↗</span></a>
              <div className="deploy-seal-note"><span>◈</span><p><strong><T text="Secure handoff" /></strong><T text="The new instance stays sealed until Cloudflare Access has a team domain and application audience. There is no public-owner fallback." /></p></div>
              <div className="deploy-instructions">
                <section><span>01</span><div><h3><T text="Prefer a guided terminal?" /></h3><p><T text="Node 22.13+, Git, and a Cloudflare account are the only prerequisites. Wrangler opens Cloudflare sign-in in your browser; FREE CRM never sees the login." /></p></div></section>
                <CopyBlock path="cloudflare" onCopy={copy} copied={copied === 'cloudflare'} />
                <section><span>02</span><div><h3><T text="Protect the entire Worker" /></h3><p><T text="In Cloudflare, open " /><b><T text="Workers & Pages → free-crm → Settings → Domains & Routes → Access" /></b><T text=". Protect " /><b><T text="all traffic" /></b><T text=" and allow your exact email." /></p></div></section>
                <section><span>03</span><div><h3><T text="Activate verified identity" /></h3><p><T text="In the Worker dashboard, set " /><code>FREE_CRM_AUTH_MODE=cloudflare-access</code><T text=", then add " /><code>FREE_CRM_ACCESS_TEAM_DOMAIN</code>, <code>FREE_CRM_ACCESS_AUD</code><T text=", and " /><code>FREE_CRM_OWNER_EMAIL</code><T text=". Use the dashboard Save/Deploy action—do not rerun the first-install build. The app verifies the JWT and exact owner again before touching CRM data." /></p></div></section>
              </div>
              <details className="deploy-details"><summary><T text="Least-privilege token permissions" /></summary><p><T text="For CI, scope the token to one account with Workers Scripts: Edit, D1: Edit, Workers R2 Storage: Edit, Access: Apps and Policies: Edit, and Access: Organizations, Identity Providers, and Groups: Read. The last permission only discovers your team domain." /></p></details>
            </article>
          )}

          {path === 'github' && (
            <article id="deploy-panel-github" role="tabpanel" className="deploy-panel">
              <div className="deploy-panel-title"><div><span className="deploy-recommended"><T text="FIRST INSTALL" /></span><h2><T text="GitHub deployment" /></h2></div><span className="deploy-time"><T text="reviewed launch" /></span></div>
              <p><T text="Fork the repository, keep credentials in a protected GitHub Environment, and run the reviewed first-install workflow. It intentionally refuses an existing Worker; automated cloud upgrades are not implemented yet." /></p>
              <a className="deploy-primary" href={`${freeCrmRepositoryUrl}/actions/workflows/deploy-cloudflare.yml`} target="_blank" rel="noreferrer"><T text="Open deployment action " /><span>↗</span></a>
              <div className="deploy-instructions">
                <section><span>01</span><div><h3><T text="Create a Cloudflare API token" /></h3><p><T text="Scope it to the account that will own the Worker, D1 database, and R2 bucket. Never commit it or paste it into FREE CRM." /></p></div></section>
                <section><span>02</span><div><h3><T text="Add protected environment secrets" /></h3><p><T text="Create the " /><code>cloudflare-production</code><T text=" environment, require approval if desired, and add the three values below." /></p></div></section>
                <CopyBlock path="github" onCopy={copy} copied={copied === 'github'} />
                <section><span>03</span><div><h3><T text="Run and verify" /></h3><p><T text="The workflow requires all owner credentials, validates the release, proves resource ownership, audits the Access policy, and reports success only after unauthenticated CRM access is denied." /></p></div></section>
              </div>
            </article>
          )}

          {path === 'docker' && (
            <article id="deploy-panel-docker" role="tabpanel" className="deploy-panel">
              <div className="deploy-panel-title"><div><span className="deploy-recommended"><T text="NO CLOUD KEYS" /></span><h2><T text="Local or Docker launch" /></h2></div><span className="deploy-time"><T text="≈ 2 min" /></span></div>
              <p><T text="Run FREE CRM directly on your laptop or use Docker on a device or private server. Neither path needs a Cloudflare account, deployment token, or third-party API key." /></p>
              <CopyBlock path="docker" onCopy={copy} copied={copied === 'docker'} />
              <div className="deploy-seal-note"><span>⌂</span><p><strong><T text="Keep it private" /></strong><T text="Do not expose local-owner mode directly to the internet. On a VM, keep port 3477 firewalled and reach it through the SSH tunnel shown above." /></p></div>
              <div className="deploy-instructions">
                <section><span>01</span><div><h3><T text="Choose native or Docker" /></h3><p><T text="The native launcher keeps data in " /><code>.wrangler/state</code><T text=". Docker uses the " /><code>free-crm-data</code><T text=" volume. Both bind only to this machine." /></p></div></section>
                <section><span>02</span><div><h3><T text="Back up before upgrades" /></h3><p><T text="Back up the local state directory or Docker volume, pull a reviewed release, and rebuild. Forward-only D1 migrations run before requests are served." /></p></div></section>
              </div>
            </article>
          )}
        </div>
      </section>

      <section className="deploy-finish">
        <p><T text="05 / VERIFY" /></p><h2><T text="A deployment is finished when it is private, recoverable, and yours." /></h2>
        <div><span><b>1</b><T text="Open the workspace through its identity gate." /></span><span><b>2</b><T text="Test a portable snapshot and maintain provider recovery copies." /></span><span><b>3</b><T text="Keep provider credentials in provider secret stores." /></span></div>
      </section>

      <footer className="deploy-footer"><a href="/">FREE CRM</a><p><T text="Open source. Free forever. Infrastructure providers may charge for usage." /></p><a href="/workspace"><T text="Open workspace →" /></a></footer>
      <p className="sr-only" aria-live="polite">{copied ? <T text="{0} instructions copied." values={{ "0": <T text={pathMeta[copied].label} /> }} /> : ''}</p>
    </main>
  );
}
