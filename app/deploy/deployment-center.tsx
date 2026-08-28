'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext's production next/link prefetch currently throws before navigation. */

import { useState } from 'react';

type Path = 'cloudflare' | 'github' | 'docker';

const deployUrl = 'https://deploy.workers.cloudflare.com/?url=https://github.com/mlmrx/FreeCRM';
const repositoryUrl = 'https://github.com/mlmrx/FreeCRM';

const commands: Record<Path, string> = {
  cloudflare: `git clone https://github.com/mlmrx/FreeCRM.git
cd FreeCRM
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
  cloudflare: { number: '01', label: 'Cloudflare', note: 'Recommended · D1 + R2' },
  github: { number: '02', label: 'GitHub', note: 'Repeatable releases' },
  docker: { number: '03', label: 'Local / Docker', note: 'No cloud keys' },
};

function CopyBlock({ path, onCopy, copied }: { path: Path; onCopy: (path: Path) => void; copied: boolean }) {
  return (
    <div className="deploy-code-wrap">
      <div className="deploy-code-head"><span>Terminal</span><button type="button" aria-live="polite" onClick={() => onCopy(path)}>{copied ? 'Copied' : 'Copy'}</button></div>
      <pre><code>{commands[path]}</code></pre>
    </div>
  );
}

export default function DeploymentCenter() {
  const [path, setPath] = useState<Path>('cloudflare');
  const [copied, setCopied] = useState<Path | null>(null);

  function copy(selected: Path) {
    let copiedSynchronously = false;
    try {
      const fallback = document.createElement('textarea');
      fallback.value = commands[selected];
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.appendChild(fallback);
      try {
        fallback.select();
        copiedSynchronously = typeof document.execCommand === 'function' && document.execCommand('copy');
      } finally {
        fallback.remove();
      }
    } catch {
      // Clipboard support varies in embedded and permission-restricted browsers.
    }
    if (!copiedSynchronously && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(commands[selected]).catch(() => undefined);
    }
    setCopied(selected);
    window.setTimeout(() => setCopied((current) => current === selected ? null : current), 1800);
  }

  return (
    <main className="deploy-shell">
      <div className="deploy-flag-line" aria-hidden="true"><i /><i /><i /></div>
      <header className="deploy-header">
        <a className="deploy-brand" href="/"><span>FREE</span> CRM</a>
        <nav aria-label="Deployment navigation">
          <a href="/workspace">Workspace</a>
          <a href={repositoryUrl} target="_blank" rel="noreferrer">Source ↗</a>
        </nav>
      </header>

      <section className="deploy-hero">
        <p className="deploy-kicker">YOUR CLOUD · YOUR CREDENTIALS · YOUR DATA</p>
        <h1>Deploy your own<br /><em>FREE CRM.</em></h1>
        <p>Your account. Your database. Your files. FREE CRM never receives your provider credentials. No cloud credentials? Run locally or in Docker with no cloud keys.</p>
        <div className="deploy-trust-row" aria-label="Deployment guarantees">
          <span><i>✓</i> MIT licensed</span><span><i>✓</i> Private by default</span><span><i>✓</i> Export anytime</span>
        </div>
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

          {path === 'cloudflare' && (
            <article id="deploy-panel-cloudflare" role="tabpanel" className="deploy-panel">
              <div className="deploy-panel-title"><div><span className="deploy-recommended">RECOMMENDED</span><h2>Cloudflare guided launch</h2></div><span className="deploy-time">≈ 4 min</span></div>
              <p>One click provisions a sealed Worker, D1 database, and private R2 bucket in your Cloudflare account. A short Access step then admits only you.</p>
              <a className="deploy-primary" href={deployUrl} target="_blank" rel="noreferrer">Provision on Cloudflare <span>↗</span></a>
              <div className="deploy-seal-note"><span>◈</span><p><strong>Secure handoff</strong>The new instance stays sealed until Cloudflare Access has a team domain and application audience. There is no public-owner fallback.</p></div>
              <div className="deploy-instructions">
                <section><span>01</span><div><h3>Prefer a guided terminal?</h3><p>Node 22.13+, Git, and a Cloudflare account are the only prerequisites. Wrangler opens Cloudflare sign-in in your browser; FREE CRM never sees the login.</p></div></section>
                <CopyBlock path="cloudflare" onCopy={copy} copied={copied === 'cloudflare'} />
                <section><span>02</span><div><h3>Protect the entire Worker</h3><p>In Cloudflare, open <b>Workers &amp; Pages → free-crm → Settings → Domains &amp; Routes → Access</b>. Protect <b>all traffic</b> and allow your exact email.</p></div></section>
                <section><span>03</span><div><h3>Activate verified identity</h3><p>Set <code>FREE_CRM_AUTH_MODE=cloudflare-access</code>, then add <code>FREE_CRM_ACCESS_TEAM_DOMAIN</code>, <code>FREE_CRM_ACCESS_AUD</code>, and <code>FREE_CRM_OWNER_EMAIL</code>. The app verifies the JWT and exact owner again before touching CRM data.</p></div></section>
              </div>
              <details className="deploy-details"><summary>Least-privilege token permissions</summary><p>For CI, scope the token to one account with Workers Scripts: Edit, D1: Edit, Workers R2 Storage: Edit, Access: Apps and Policies: Edit, and Access: Organizations, Identity Providers, and Groups: Read. The last permission only discovers your team domain.</p></details>
            </article>
          )}

          {path === 'github' && (
            <article id="deploy-panel-github" role="tabpanel" className="deploy-panel">
              <div className="deploy-panel-title"><div><span className="deploy-recommended">REPEATABLE</span><h2>GitHub deployment</h2></div><span className="deploy-time">manual release</span></div>
              <p>Fork the repository, keep credentials in a protected GitHub Environment, and run a reviewed release whenever you choose.</p>
              <a className="deploy-primary" href={`${repositoryUrl}/actions/workflows/deploy-cloudflare.yml`} target="_blank" rel="noreferrer">Open deployment action <span>↗</span></a>
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
        <div><span><b>1</b>Open the workspace through its identity gate.</span><span><b>2</b>Download a full JSON backup in Settings.</span><span><b>3</b>Keep provider credentials in provider secret stores.</span></div>
      </section>

      <footer className="deploy-footer"><a href="/">FREE CRM</a><p>Open source. Free forever. Infrastructure providers may charge for usage.</p><a href="/workspace">Open workspace →</a></footer>
      <p className="sr-only" aria-live="polite">{copied ? `${pathMeta[copied].label} instructions copied.` : ''}</p>
    </main>
  );
}
