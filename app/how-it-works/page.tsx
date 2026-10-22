/* eslint-disable @next/next/no-html-link-for-pages -- Vinext production prefetch is intentionally avoided for reliable navigation. */
import { T, LocalizedAttributes } from '@/app/localized-text';
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
      <a className="skip-link" href="#how-content"><T text="Skip to how FREE CRM works" /></a>
      <div className="how-flag-line" aria-hidden="true"><i /><i /><i /></div>
      <header className="how-header">
        <a className="how-brand" href="/"><span>FREE</span> CRM</a>
        <LocalizedAttributes names={["aria-label"]}><nav aria-label="How it works navigation">
          <a href="/"><T text="Home" /></a>
          <a href="/platform"><T text="Platform" /></a>
          <a href="/tour"><T text="Tour" /></a>
          <a href="/insights"><T text="Insights" /></a>
          <a href="/deploy"><T text="Deploy" /></a>
          <a className="how-open" href="/workspace"><T text="Open workspace " /><span>→</span></a>
        </nav></LocalizedAttributes>
      </header>

      <div id="how-content" tabIndex={-1}>
      <section className="how-hero">
        <p><T text="How FREE CRM works" /></p>
        <h1><T text="From first hello" /><br /><em><T text="to everything after." /></em></h1>
        <div className="how-hero-bottom">
          <p><T text="One private operating system connects your customers, selling, delivery, billing, service, and decisions. You bring the work. FREE CRM keeps the whole story intact." /></p>
          <a href="#flow"><T text="Follow the flow " /><span>↓</span></a>
        </div>
      </section>

      <section className="how-flow" id="flow" aria-labelledby="flow-title">
        <div className="how-section-head">
          <p><T text="The operating loop" /></p>
          <h2 id="flow-title"><T text="Four moves." /><br /><T text="One source of truth." /></h2>
        </div>
        <div className="how-step-list">
          {steps.map((step) => (
            <article className="how-step" key={step.number}>
              <span>{step.number}</span>
              <div>
                <p><T text={step.label} /></p>
                <h3><T text={step.title} /></h3>
              </div>
              <p><T text={step.copy} /></p>
              <small><T text={step.detail} /></small>
            </article>
          ))}
        </div>
      </section>

      <section className="how-planes" aria-labelledby="planes-title">
        <div className="how-section-head how-section-head-light">
          <p><T text="Built like a real platform" /></p>
          <h2 id="planes-title"><T text="Simple in front." /><br /><em><T text="Serious underneath." /></em></h2>
        </div>
        <div className="how-plane-grid">
          <article>
            <span><T text="01 / CONTROL PLANE" /></span>
            <h3><T text="You decide how it runs." /></h3>
            <p><T text="Workspace settings, identity, modules, integration previews, workflows, audit history, portable snapshots, and recovery guidance stay in one governed layer." /></p>
          </article>
          <article>
            <span><T text="02 / DATA PLANE" /></span>
            <h3><T text="Your work stays connected." /></h3>
            <p><T text="Customer records, relationships, transactions, activities, files, reports, and events share one durable model instead of becoming isolated app data." /></p>
          </article>
          <article className="how-plane-result">
            <span><T text="03 / CUSTOMER 360" /></span>
            <h3><T text="One record. Useful context." /></h3>
            <p><T text="Open a record to see its key fields, explicit connected records, notes, and invoice payment receipts when applicable." /></p>
          </article>
        </div>
      </section>

      <section className="how-ownership" aria-labelledby="ownership-title">
        <div>
          <p><T text="Free means yours" /></p>
          <h2 id="ownership-title"><T text="Run it where" /><br /><em><T text="you trust it." /></em></h2>
        </div>
        <div className="how-deploy-choices">
          <article><b><T text="On this device" /></b><span><T text="One command, local database, local files, zero cloud credentials." /></span></article>
          <article><b><T text="In Docker" /></b><span><T text="A portable container with persistent volumes you control." /></span></article>
          <article><b><T text="In your cloud" /></b><span><T text="Guided deployment using your account and your credentials—never ours." /></span></article>
        </div>
      </section>

      <section className="how-profiles" aria-labelledby="how-profiles-title">
        <div><p><T text="One platform, five perspectives" /></p><h2 id="how-profiles-title"><T text="Solo to enterprise." /><br /><em><T text="Human to agent." /></em></h2></div>
        <div><p><T text="Personal, business, and enterprise remain workspace profiles in one codebase. Agentic CRM is a guarded capability layer; CRM for Agents is the research path—not a collection of disconnected product forks." /></p><a href="/platform"><T text="Explore profiles and honest limits " /><span>→</span></a><a href="/tour"><T text="Open the synthetic product tour" /></a></div>
      </section>

      <section className="how-final">
        <p><T text="No trial clock. No rented customer list." /></p>
        <h2><T text="Your relationships deserve" /><br /><em><T text="a permanent home." /></em></h2>
        <div>
          <a href="/workspace"><T text="Open FREE CRM " /><span>→</span></a>
          <a href="/deploy"><T text="Choose your deployment" /></a>
        </div>
      </section>
      </div>

      <footer className="how-footer">
        <a href="/">FREE CRM</a>
        <span><T text="Open source · free for all · free forever" /></span>
        <a href={freeCrmRepositoryUrl} target="_blank" rel="noreferrer"><T text="GitHub ↗" /></a>
      </footer>
    </main>
  );
}
