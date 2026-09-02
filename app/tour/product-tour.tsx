'use client';

import { useState } from 'react';

import { syntheticTour } from '@/lib/public-demo';

const views = [
  { id: 'focus', label: 'Today' },
  { id: 'people', label: 'Customer 360' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'agent', label: 'Agent receipt' },
] as const;

type View = (typeof views)[number]['id'];

export default function ProductTour() {
  const [view, setView] = useState<View>('focus');

  return (
    <section className="tour-product" aria-labelledby="tour-product-title">
      <header>
        <div><p>READ-ONLY PRODUCT TOUR</p><h2 id="tour-product-title">{syntheticTour.workspace}</h2></div>
        <span><i aria-hidden="true" /> {syntheticTour.notice}</span>
      </header>
      <div className="tour-product-layout">
        <nav aria-label="Tour views" role="tablist">
          {views.map((item) => <button key={item.id} type="button" role="tab" aria-selected={view === item.id} aria-controls={`tour-panel-${item.id}`} onClick={() => setView(item.id)}><span>{item.label}</span><i aria-hidden="true">→</i></button>)}
        </nav>

        <div className="tour-canvas" id={`tour-panel-${view}`} role="tabpanel" aria-live="polite">
          {view === 'focus' && <div className="tour-focus">
            <div className="tour-metrics">{syntheticTour.metrics.map((metric) => <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small></article>)}</div>
            <article className="tour-next"><p>NEXT BEST MOVE</p><h3>Close the loop with Mosaic Coffee.</h3><span>A fictional launch was due yesterday. Review the contact timeline before drafting a check-in.</span><button type="button" onClick={() => setView('people')}>Open synthetic context →</button></article>
          </div>}

          {view === 'people' && <div className="tour-people">
            <header><div><span>AS</span><div><p>CONTACT · SYNTHETIC</p><h3>Avery Sample</h3><small>Mosaic Coffee — fictional</small></div></div><b>Customer</b></header>
            <div className="tour-context-grid"><article><span>Last touch</span><b>Launch review · 3 days ago</b></article><article><span>Open value</span><b>$4,800 sample opportunity</b></article><article><span>Consent</span><b>Example status: direct contact</b></article><article><span>Next step</span><b>Check launch outcome</b></article></div>
            <ol aria-label="Synthetic relationship timeline"><li><span>Today</span><p><b>Follow-up due</b> · no action has been sent</p></li><li><span>3 days</span><p><b>Launch review logged</b> · fictional meeting note</p></li><li><span>2 weeks</span><p><b>Quote accepted</b> · synthetic receipt #Q-104</p></li></ol>
          </div>}

          {view === 'pipeline' && <div className="tour-pipeline">{syntheticTour.pipeline.map((deal) => <section key={deal.stage}><header><span>{deal.stage}</span><b>1</b></header><article><p>{deal.name}</p><strong>{deal.value}</strong><small>Fictional opportunity</small></article></section>)}</div>}

          {view === 'agent' && <div className="tour-agent">
            <div className="tour-agent-path" aria-hidden="true"><span>AGENT</span><i /><b>HUMAN GATE</b><i /><span>CRM</span></div>
            <p>SIMULATED ACTION RECEIPT</p><h3>{syntheticTour.receipt.proposal}</h3>
            <dl><div><dt>Granted scope</dt><dd>{syntheticTour.receipt.scope}</dd></div><div><dt>Policy decision</dt><dd>{syntheticTour.receipt.decision}</dd></div><div><dt>External result</dt><dd>{syntheticTour.receipt.result}</dd></div></dl>
            <aside><strong>Why it stopped</strong><span>The tour demonstrates the approval boundary. It cannot call a provider, mutate a CRM record, or send a message.</span></aside>
          </div>}
        </div>
      </div>
    </section>
  );
}
