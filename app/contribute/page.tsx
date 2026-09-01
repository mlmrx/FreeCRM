/* eslint-disable @next/next/no-html-link-for-pages -- Vinext production prefetch is intentionally avoided for reliable navigation. */
import type { Metadata } from 'next';

import { freeCrmContributingUrl, freeCrmRepositoryUrl } from '@/lib/public-config';

export const metadata: Metadata = {
  title: 'Contribute to FREE CRM',
  description: 'Help build FREE CRM through focused code, documentation, testing, security, and accessibility contributions.',
};

const contributionPaths = [
  {
    number: '01',
    label: 'Product + code',
    copy: 'Ship one complete, workspace-scoped improvement that works on device and preserves the shared platform architecture.',
  },
  {
    number: '02',
    label: 'Quality + safety',
    copy: 'Add regression coverage, tenant-isolation checks, failure recovery, or honest validation for a real production risk.',
  },
  {
    number: '03',
    label: 'Docs + deployment',
    copy: 'Make setup, self-hosting, recovery, and user-owned cloud credentials easier to understand and safer to operate.',
  },
  {
    number: '04',
    label: 'Design + access',
    copy: 'Improve clarity, responsive behavior, keyboard navigation, reduced motion, and assistive-technology support.',
  },
] as const;

const contributionSteps = [
  {
    number: '01',
    title: 'Choose one focused problem.',
    copy: 'Read the contribution guide and browse current work before starting. Keep the pull request small enough to review and complete enough to use.',
  },
  {
    number: '02',
    title: 'Fork and branch from main.',
    copy: 'Start from the latest upstream main branch. Never stack new work onto a branch whose earlier pull request has already merged.',
  },
  {
    number: '03',
    title: 'Build the full slice.',
    copy: 'Include implementation, tests, documentation, accessibility, and migration or security evidence whenever the change touches those boundaries.',
  },
  {
    number: '04',
    title: 'Validate, sign, and submit.',
    copy: 'Run the required checks, use a DCO sign-off, and explain behavior, risks, limitations, and verification in the pull request.',
  },
] as const;

const issuesUrl = `${freeCrmRepositoryUrl}/issues`;
const securityGuideUrl = `${freeCrmRepositoryUrl}/blob/main/SECURITY.md`;

export default function ContributePage() {
  return (
    <div className="contribute-shell">
      <div className="contribute-flag-line" aria-hidden="true"><i /><i /><i /></div>

      <header className="contribute-header">
        <a className="contribute-brand" href="/"><span>FREE</span> CRM</a>
        <nav aria-label="Contribution navigation">
          <a href="/">Home</a>
          <a href="/how-it-works">How it works</a>
          <a href="/insights">Insights</a>
          <a href={freeCrmRepositoryUrl} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
          <a className="contribute-open" href="/workspace">Open workspace <span>→</span></a>
        </nav>
      </header>

      <main>
        <section className="contribute-hero" aria-labelledby="contribute-title">
        <div>
          <p>Open source, by design</p>
          <h1 id="contribute-title">Build FREE CRM<br /><em>with us.</em></h1>
        </div>
        <div className="contribute-hero-copy">
          <p>FREE CRM is a user-owned relationship operating system, free for everyone forever. Contribute code, documentation, tests, security improvements, or accessible design—without needing permission to care about the product.</p>
          <div>
            <a className="contribute-primary" href={freeCrmRepositoryUrl} target="_blank" rel="noopener noreferrer">View FREE CRM on GitHub <span>↗</span></a>
            <a href={freeCrmContributingUrl} target="_blank" rel="noopener noreferrer">Read the contribution guide <span>↗</span></a>
          </div>
        </div>
      </section>

      <section className="contribute-paths" aria-labelledby="contribution-paths-title">
        <div className="contribute-section-head">
          <p>Ways to contribute</p>
          <h2 id="contribution-paths-title">Useful work comes<br /><em>in many forms.</em></h2>
        </div>
        <div className="contribute-path-grid">
          {contributionPaths.map((path) => (
            <article key={path.number}>
              <span>{path.number}</span>
              <h3>{path.label}</h3>
              <p>{path.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="contribute-process" aria-labelledby="contribution-process-title">
        <div className="contribute-section-head contribute-section-head-light">
          <p>A clean contribution loop</p>
          <h2 id="contribution-process-title">Focused change.<br /><em>Clear evidence.</em></h2>
        </div>
        <ol aria-label="How to contribute">
          {contributionSteps.map((step) => (
            <li key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="contribute-start" aria-labelledby="contribution-start-title">
        <div>
          <p>Start locally</p>
          <h2 id="contribution-start-title">Your machine.<br /><em>Your fork.</em></h2>
          <p>Use Node.js 22.13 or newer and npm. Replace the account placeholder with your GitHub username, then work from the latest upstream <code>main</code>.</p>
        </div>
        <pre aria-label="Contributor local setup commands"><code>{`git clone https://github.com/<your-account>/FreeCRM.git
cd FreeCRM
git remote add upstream ${freeCrmRepositoryUrl}.git
git fetch upstream main
git switch -c ml/short-description upstream/main
npm ci
npm run dev`}</code></pre>
        </section>

        <aside className="contribute-security" aria-labelledby="contribution-security-title">
          <p>Security is different</p>
          <div>
            <h2 id="contribution-security-title">Found a vulnerability?</h2>
            <p>Do not publish it in an issue or pull request. Follow the private security-advisory instructions so maintainers can investigate without exposing users.</p>
          </div>
          <a href={securityGuideUrl} target="_blank" rel="noopener noreferrer">Read security reporting guidance <span>↗</span></a>
        </aside>

        <section className="contribute-final">
          <p>Ready when you are</p>
          <h2>Make one thing<br /><em>meaningfully better.</em></h2>
          <div>
            <a href={issuesUrl} target="_blank" rel="noopener noreferrer">Browse current issues <span>↗</span></a>
            <a href={freeCrmContributingUrl} target="_blank" rel="noopener noreferrer">Read CONTRIBUTING.md</a>
          </div>
        </section>
      </main>

      <footer className="contribute-footer">
        <a href="/"><span>FREE</span> CRM</a>
        <p>MIT licensed · community built · free forever</p>
        <a href={freeCrmRepositoryUrl} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
      </footer>
    </div>
  );
}
