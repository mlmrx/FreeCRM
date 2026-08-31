/* eslint-disable @next/next/no-html-link-for-pages -- Vinext production prefetch is intentionally avoided for reliable navigation. */
import type { Metadata } from 'next';

import { freeCrmRepositoryUrl } from '@/lib/public-config';

export const metadata: Metadata = {
  title: 'How FREE CRM Works',
  description: 'See how FREE CRM turns relationships into one private, connected operating system—from first contact through revenue, service, and insight.',
};

const steps = [
  {
    number: '01',
    label: 'Capture',
    title: 'Start with the relationship.',
    copy: 'Add a person, company, or lead once. FREE CRM keeps core contact details, status, source, and tags together from the first hello.',
    detail: 'People · Companies · Leads',
  },
  {
    number: '02',
    label: 'Connect',
    title: 'Give every interaction a home.',
    copy: 'Keep notes on a record and use explicit links created by lead conversion and quote workflows. Activities, tasks, and documents remain visible in the same workspace.',
    detail: 'Activities · Tasks · Documents',
  },
  {
    number: '03',
    label: 'Operate',
    title: 'Move work and money forward.',
    copy: 'Track opportunities, quotes, invoices, campaigns, tasks, and support without splitting core CRM work across disconnected subscriptions.',
    detail: 'Sales · Work · Billing · Service',
  },
  {
    number: '04',
    label: 'Understand',
    title: 'See what needs you next.',
    copy: 'Live reports, health signals, workflow history, and exports turn the same records into decisions—without copying data into another tool.',
    detail: 'Reports · Analytics · Automation',
  },
] as const;

export default function HowItWorksPage() {
  return (
    <main className="how-shell">
      <div className="how-flag-line" aria-hidden="true"><i /><i /><i /></div>
      <header className="how-header">
        <a className="how-brand" href="/"><span>FREE</span> CRM</a>
        <nav aria-label="How it works navigation">
          <a href="/">Home</a>
          <a href="/deploy">Deploy</a>
          <a className="how-open" href="/workspace">Open workspace <span>→</span></a>
        </nav>
      </header>

      <section className="how-hero">
        <p>How FREE CRM works</p>
        <h1>From first hello<br /><em>to everything after.</em></h1>
        <div className="how-hero-bottom">
          <p>One private operating system connects your customers, selling, delivery, billing, service, and decisions. You bring the work. FREE CRM keeps the whole story intact.</p>
          <a href="#flow">Follow the flow <span>↓</span></a>
        </div>
      </section>

      <section className="how-flow" id="flow" aria-labelledby="flow-title">
        <div className="how-section-head">
          <p>The operating loop</p>
          <h2 id="flow-title">Four moves.<br />One source of truth.</h2>
        </div>
        <div className="how-step-list">
          {steps.map((step) => (
            <article className="how-step" key={step.number}>
              <span>{step.number}</span>
              <div>
                <p>{step.label}</p>
                <h3>{step.title}</h3>
              </div>
              <p>{step.copy}</p>
              <small>{step.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="how-planes" aria-labelledby="planes-title">
        <div className="how-section-head how-section-head-light">
          <p>Built like a real platform</p>
          <h2 id="planes-title">Simple in front.<br /><em>Serious underneath.</em></h2>
        </div>
        <div className="how-plane-grid">
          <article>
            <span>01 / CONTROL PLANE</span>
            <h3>You decide how it runs.</h3>
            <p>Workspace settings, identity, modules, integration previews, workflows, audit history, portable snapshots, and recovery guidance stay in one governed layer.</p>
          </article>
          <article>
            <span>02 / DATA PLANE</span>
            <h3>Your work stays connected.</h3>
            <p>Customer records, relationships, transactions, activities, files, reports, and events share one durable model instead of becoming isolated app data.</p>
          </article>
          <article className="how-plane-result">
            <span>03 / CUSTOMER 360</span>
            <h3>One record. Useful context.</h3>
            <p>Open a record to see its key fields, explicit connected records, notes, and invoice payment receipts when applicable.</p>
          </article>
        </div>
      </section>

      <section className="how-ownership" aria-labelledby="ownership-title">
        <div>
          <p>Free means yours</p>
          <h2 id="ownership-title">Run it where<br /><em>you trust it.</em></h2>
        </div>
        <div className="how-deploy-choices">
          <article><b>On this device</b><span>One command, local database, local files, zero cloud credentials.</span></article>
          <article><b>In Docker</b><span>A portable container with persistent volumes you control.</span></article>
          <article><b>In your cloud</b><span>Guided deployment using your account and your credentials—never ours.</span></article>
        </div>
      </section>

      <section className="how-final">
        <p>No trial clock. No rented customer list.</p>
        <h2>Your relationships deserve<br /><em>a permanent home.</em></h2>
        <div>
          <a href="/workspace">Open FREE CRM <span>→</span></a>
          <a href="/deploy">Choose your deployment</a>
        </div>
      </section>

      <footer className="how-footer">
        <a href="/">FREE CRM</a>
        <span>Open source · free for all · free forever</span>
        <a href={freeCrmRepositoryUrl} target="_blank" rel="noreferrer">GitHub ↗</a>
      </footer>
    </main>
  );
}
