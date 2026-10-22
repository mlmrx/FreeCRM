/* eslint-disable @next/next/no-html-link-for-pages -- Vinext production prefetch is intentionally avoided for reliable navigation. */
import { T, LocalizedAttributes } from '@/app/localized-text';
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
const goodFirstIssuesUrl = `${issuesUrl}?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22`;
const roadmapUrl = `${freeCrmRepositoryUrl}/blob/main/ROADMAP.md`;
const securityGuideUrl = `${freeCrmRepositoryUrl}/blob/main/SECURITY.md`;

export default function ContributePage() {
  return (
    <div className="contribute-shell">
      <a className="skip-link" href="#contribute-content"><T text="Skip to contribution guide" /></a>
      <div className="contribute-flag-line" aria-hidden="true"><i /><i /><i /></div>

      <header className="contribute-header">
        <a className="contribute-brand" href="/"><span>FREE</span> CRM</a>
        <LocalizedAttributes names={["aria-label"]}><nav aria-label="Contribution navigation">
          <a href="/"><T text="Home" /></a>
          <a href="/how-it-works"><T text="How it works" /></a>
          <a href="/insights"><T text="Insights" /></a>
          <a href={freeCrmRepositoryUrl} target="_blank" rel="noopener noreferrer"><T text="GitHub ↗" /></a>
          <a className="contribute-open" href="/workspace"><T text="Open workspace " /><span>→</span></a>
        </nav></LocalizedAttributes>
      </header>

      <main id="contribute-content" tabIndex={-1}>
        <section className="contribute-hero" aria-labelledby="contribute-title">
        <div>
          <p><T text="Open source, by design" /></p>
          <h1 id="contribute-title"><T text="Build FREE CRM" /><br /><em><T text="with us." /></em></h1>
        </div>
        <div className="contribute-hero-copy">
          <p><T text="FREE CRM is a user-owned relationship operating system, free for everyone forever. Contribute code, documentation, tests, security improvements, or accessible design—without needing permission to care about the product." /></p>
          <div>
            <a className="contribute-primary" href={freeCrmRepositoryUrl} target="_blank" rel="noopener noreferrer"><T text="View FREE CRM on GitHub " /><span>↗</span></a>
            <a href={freeCrmContributingUrl} target="_blank" rel="noopener noreferrer"><T text="Read the contribution guide " /><span>↗</span></a>
          </div>
        </div>
      </section>

      <section className="contribute-paths" aria-labelledby="contribution-paths-title">
        <div className="contribute-section-head">
          <p><T text="Ways to contribute" /></p>
          <h2 id="contribution-paths-title"><T text="Useful work comes" /><br /><em><T text="in many forms." /></em></h2>
        </div>
        <div className="contribute-path-grid">
          {contributionPaths.map((path) => (
            <article key={path.number}>
              <span>{path.number}</span>
              <h3><T text={path.label} /></h3>
              <p><T text={path.copy} /></p>
            </article>
          ))}
        </div>
      </section>

      <section className="contribute-process" aria-labelledby="contribution-process-title">
        <div className="contribute-section-head contribute-section-head-light">
          <p><T text="A clean contribution loop" /></p>
          <h2 id="contribution-process-title"><T text="Focused change." /><br /><em><T text="Clear evidence." /></em></h2>
        </div>
        <LocalizedAttributes names={["aria-label"]}><ol aria-label="How to contribute">
          {contributionSteps.map((step) => (
            <li key={step.number}>
              <span>{step.number}</span>
              <h3><T text={step.title} /></h3>
              <p><T text={step.copy} /></p>
            </li>
          ))}
        </ol></LocalizedAttributes>
      </section>

      <section className="contribute-start" aria-labelledby="contribution-start-title">
        <div>
          <p><T text="Start locally" /></p>
          <h2 id="contribution-start-title"><T text="Your machine." /><br /><em><T text="Your fork." /></em></h2>
          <p><T text="Use Node.js 22.13 or newer and npm. Replace the account placeholder with your GitHub username, then work from the latest upstream " /><code>main</code>.</p>
        </div>
        <LocalizedAttributes names={["aria-label"]}><pre aria-label="Contributor local setup commands"><code>{`git clone https://github.com/<your-account>/FreeCRM.git
cd FreeCRM
git remote add upstream ${freeCrmRepositoryUrl}.git
git fetch upstream main
git switch -c ml/short-description upstream/main
npm ci
npm run dev`}</code></pre></LocalizedAttributes>
        </section>

        <aside className="contribute-security" aria-labelledby="contribution-security-title">
          <p><T text="Security is different" /></p>
          <div>
            <h2 id="contribution-security-title"><T text="Found a vulnerability?" /></h2>
            <p><T text="Do not publish it in an issue or pull request. Follow the private security-advisory instructions so maintainers can investigate without exposing users." /></p>
          </div>
          <a href={securityGuideUrl} target="_blank" rel="noopener noreferrer"><T text="Read security reporting guidance " /><span>↗</span></a>
        </aside>

        <section className="contribute-final">
          <p><T text="Ready when you are" /></p>
          <h2><T text="Make one thing" /><br /><em><T text="meaningfully better." /></em></h2>
          <div>
            <a href={goodFirstIssuesUrl} target="_blank" rel="noopener noreferrer"><T text="Find a good first issue " /><span>↗</span></a>
            <a href={roadmapUrl} target="_blank" rel="noopener noreferrer"><T text="Community roadmap " /><span>↗</span></a>
            <a href={freeCrmContributingUrl} target="_blank" rel="noopener noreferrer"><T text="Read CONTRIBUTING.md" /></a>
          </div>
        </section>
      </main>

      <footer className="contribute-footer">
        <a href="/"><span>FREE</span> CRM</a>
        <p><T text="MIT licensed · community built · free forever" /></p>
        <a href={freeCrmRepositoryUrl} target="_blank" rel="noopener noreferrer"><T text="GitHub ↗" /></a>
      </footer>
    </div>
  );
}
