/* eslint-disable @next/next/no-html-link-for-pages -- Vinext production prefetch is intentionally avoided for reliable navigation. */
import type { Metadata } from 'next';

import ProductTour from './product-tour';

export const metadata: Metadata = {
  title: 'FREE CRM product tour — Synthetic and read-only',
  description: 'Explore a fictional FREE CRM workspace without signing in, calling an API, saving data, or touching a customer record.',
};

export default function TourPage() {
  return (
    <div className="tour-shell">
      <a className="skip-link" href="#tour-content">Skip to product tour</a>
      <div className="tour-flag-line" aria-hidden="true"><i /><i /><i /></div>
      <header className="tour-header"><a className="tour-brand" href="/"><span>FREE</span> CRM</a><nav aria-label="Product tour navigation"><a href="/platform">Platform</a><a href="/how-it-works">How it works</a><a className="tour-deploy" href="/deploy">Deploy yours <span>→</span></a></nav></header>
      <main id="tour-content" tabIndex={-1}>
        <section className="tour-hero" aria-labelledby="tour-title"><p>Safe to explore</p><h1 id="tour-title">A real product shape.<br /><em>Entirely unreal data.</em></h1><div><p>This public tour is rendered from frozen examples in the codebase. It has no authentication, API, database, connector, browser-storage, or customer-data access.</p><span>NO SIGN-IN · NO WRITES · NO TRACKING</span></div></section>
        <ProductTour />
        <section className="tour-final" aria-labelledby="tour-final-title"><p>Ready for your own records?</p><h2 id="tour-final-title">Choose where they live.<br /><em>Keep the keys.</em></h2><div><a href="/deploy/readiness">Run the readiness checklist <span>→</span></a><a href="/platform">Compare platform profiles</a></div></section>
      </main>
      <footer className="tour-footer"><a href="/">FREE CRM</a><span>Public demo · synthetic data only</span><a href="/contribute">Inspect and contribute →</a></footer>
    </div>
  );
}
