export type EditorialSource = {
  label: string;
  publisher: string;
  url: string;
};

export type EditorialSection = {
  heading: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
};

export type EditorialArticle = {
  slug: string;
  kind: 'Essay' | 'Field guide' | 'Research note' | 'News brief';
  category: 'Open CRM' | 'Agentic CRM' | 'CRM for Agents' | 'Customer 360' | 'Solopreneur CRM';
  title: string;
  description: string;
  publishedAt: string;
  readMinutes: number;
  featured?: boolean;
  sections: readonly EditorialSection[];
  takeaways: readonly string[];
  sources: readonly EditorialSource[];
};

export const editorialArticles: readonly EditorialArticle[] = [
  {
    slug: 'the-free-crm-manifesto',
    kind: 'Essay',
    category: 'Open CRM',
    title: 'The FREE CRM manifesto: relationships should not be rented',
    description: 'A case for CRM that is open source, self-hostable, useful on one device, and built around data ownership instead of subscription captivity.',
    publishedAt: '2026-08-31',
    readMinutes: 7,
    featured: true,
    takeaways: [
      'Freedom means source access, usable exports, and a credible path to run the product yourself.',
      'A free CRM should remain operational without a permanent connection to its original vendor.',
      'Open infrastructure is not enough; the everyday product must still feel considered and complete.',
    ],
    sections: [
      {
        heading: 'CRM holds the memory of a business',
        paragraphs: [
          'Customer records are not ordinary application data. They contain the history of trust: what was promised, what changed, who needs help, and which relationship deserves attention next. When that memory can only be reached through a subscription, the business is renting access to its own past.',
          'FREE CRM begins with a different premise. The person or organization doing the work should be able to inspect the code, keep the data, choose the infrastructure, and leave without asking permission.',
        ],
      },
      {
        heading: 'Free is an operating model, not a price badge',
        paragraphs: [
          'A zero-dollar tier can still be a funnel into lock-in. Durable freedom needs local operation, documented deployment, portable records, replaceable integrations, and credentials supplied by the owner rather than hidden inside a hosted service.',
          'That standard also creates responsibility. Security boundaries, upgrades, recovery, and honest capability labels have to be understandable to a solo operator—not only to a platform team.',
        ],
        bullets: [
          'Run on a device without surrendering customer data.',
          'Deploy to a cloud account the owner controls.',
          'Export records and files in useful, documented forms.',
          'Invite contribution without weakening tenant or agent safety.',
        ],
      },
      {
        heading: 'Celebrate the craft of keeping promises',
        paragraphs: [
          'CRM should not make relationships feel like rows in a pipeline. Its best work is quieter: recovering context before a call, surfacing an overdue promise, connecting service history to a renewal, and making the next humane action obvious.',
          'That is what we mean by celebrating open source and FREE CRM. The software is shared, but the relationship remains yours.',
        ],
      },
    ],
    sources: [
      { label: 'FREE CRM source repository', publisher: 'GitHub', url: 'https://github.com/mlmrx/FreeCRM' },
      { label: 'Open Source Definition', publisher: 'Open Source Initiative', url: 'https://opensource.org/osd' },
    ],
  },
  {
    slug: 'agentic-crm-needs-a-control-plane',
    kind: 'Research note',
    category: 'Agentic CRM',
    title: 'Agentic CRM needs a control plane, not just a clever prompt',
    description: 'Why approvals, budgets, receipts, identity, and an emergency stop belong in the architecture before an agent can touch customer work.',
    publishedAt: '2026-08-31',
    readMinutes: 9,
    takeaways: [
      'An agent proposal and an agent execution should be separate, inspectable events.',
      'Permissions need scope, duration, budget, and a named accountable owner.',
      'Every consequential action should produce a receipt that can be audited later.',
    ],
    sections: [
      {
        heading: 'The action boundary changes the product',
        paragraphs: [
          'A summarizer can be treated like a feature. An agent that sends a message, changes a deal stage, issues a refund, or edits a customer record has crossed into operations. At that point, model quality is only one part of the safety case.',
          'The CRM needs a control plane that decides who or what may act, on which workspace, through which tool, within what budget, and under which approval policy. The data plane should never infer those permissions from a persuasive model response.',
        ],
      },
      {
        heading: 'A minimum trustworthy loop',
        paragraphs: [
          'The useful unit of agent work is not a chat turn. It is a governed transaction: observe, propose, evaluate policy, request approval when needed, execute idempotently, and record the result.',
        ],
        bullets: [
          'Bind every agent to a first-class identity and workspace.',
          'Grant named tools, not ambient access to the whole platform.',
          'Separate read, propose, approve, and execute permissions.',
          'Record inputs, policy decisions, tool calls, outputs, and failures.',
          'Provide an emergency stop that prevents new work immediately.',
        ],
      },
      {
        heading: 'Risk management is continuous',
        paragraphs: [
          'NIST organizes AI risk work around govern, map, measure, and manage. That is a useful reminder for CRM builders: evaluation does not end when the agent ships. Permissions drift, tools change, customer data evolves, and an apparently harmless workflow can become consequential when connected to another system.',
          'A serious Agentic CRM therefore treats policies and receipts as product surfaces. Humans should be able to understand why an action was proposed and stop the system without negotiating with the agent that is being stopped.',
        ],
      },
    ],
    sources: [
      { label: 'AI Risk Management Framework', publisher: 'NIST', url: 'https://www.nist.gov/itl/ai-risk-management-framework' },
      { label: 'A business leader’s guide to working with agents', publisher: 'OpenAI', url: 'https://cdn.openai.com/business-guides-and-resources/a-business-leaders-guide-to-working-with-agents.pdf' },
    ],
  },
  {
    slug: 'crm-for-agents-is-a-relationship-api',
    kind: 'Essay',
    category: 'CRM for Agents',
    title: 'CRM for Agents is a relationship API—not a screen scraper',
    description: 'Agents need explicit actors, durable context, narrow tools, and machine-readable receipts instead of brittle access to a human dashboard.',
    publishedAt: '2026-08-31',
    readMinutes: 8,
    takeaways: [
      'Treat humans, organizations, services, and agents as first-class actors.',
      'Expose narrow relationship operations with stable schemas and idempotency keys.',
      'Return policy decisions and receipts that another system can verify.',
    ],
    sections: [
      {
        heading: 'The dashboard is not the contract',
        paragraphs: [
          'Most CRM interfaces are optimized for a person who can interpret ambiguity. An autonomous client needs something stricter: typed operations, explicit preconditions, stable identifiers, bounded queries, and errors that distinguish authorization from validation and retryable failure.',
          'Giving an agent a browser and hoping it behaves like a careful employee turns presentation markup into an accidental API. It is difficult to secure, hard to test, and nearly impossible to make reliably idempotent.',
        ],
      },
      {
        heading: 'Make relationships legible to machines',
        paragraphs: [
          'A CRM for agents should model who acted, on whose behalf, for which workspace, and toward which actor. It should also distinguish an observation from a claim, a proposed change from an approved one, and an attempted action from a completed one.',
        ],
        bullets: [
          'Actor identity and delegation chain on every request.',
          'Workspace-scoped reads with explicit field and record limits.',
          'Commands with idempotency keys and conflict-safe semantics.',
          'Policy evaluation before external side effects.',
          'Receipts that make consequences visible to people and agents.',
        ],
      },
      {
        heading: 'Human usability remains the test',
        paragraphs: [
          'An agent-native CRM should not exile people. The same underlying record, policy, and audit event should support a calm human interface and a precise machine interface. That shared truth prevents an agent-only shadow system from growing beside the real customer history.',
        ],
      },
    ],
    sources: [
      { label: 'Cybersecurity, privacy, and AI', publisher: 'NIST', url: 'https://www.nist.gov/itl/applied-cybersecurity/cybersecurity-privacy-and-ai' },
      { label: 'Practices for governing agentic AI systems', publisher: 'OpenAI', url: 'https://cdn.openai.com/papers/practices-for-governing-agentic-ai-systems.pdf' },
    ],
  },
  {
    slug: 'customer-360-without-surveillance',
    kind: 'Field guide',
    category: 'Customer 360',
    title: 'Customer 360 without customer surveillance',
    description: 'A practical way to unify relationship context while collecting less, preserving provenance, and keeping sensitive inferences under control.',
    publishedAt: '2026-08-31',
    readMinutes: 7,
    takeaways: [
      'A useful customer view is defined by decisions it supports, not by the amount of data it accumulates.',
      'Provenance, purpose, retention, and access belong beside every sensitive signal.',
      'Derived predictions should never silently become customer facts.',
    ],
    sections: [
      {
        heading: 'Completeness is the wrong goal',
        paragraphs: [
          'Customer 360 is often described as collecting every available signal into one profile. That framing rewards accumulation. A healthier question is: what is the minimum trustworthy context needed to serve this person, keep a promise, or make a fair decision?',
          'The answer is usually smaller than the data warehouse. Contact history, consent, current work, open obligations, service context, and clearly labeled preferences often matter more than an ocean of behavioral exhaust.',
        ],
      },
      {
        heading: 'Keep facts, observations, and predictions separate',
        paragraphs: [
          'A customer-provided address is different from an imported enrichment field. A meeting note is different from a model-generated sentiment score. Combining them without provenance makes the interface look confident while reducing trust.',
        ],
        bullets: [
          'Show where a field came from and when it was observed.',
          'Attach retention and purpose to sensitive data classes.',
          'Label probabilistic inferences and allow correction.',
          'Restrict agent access to the context required for its current task.',
        ],
      },
      {
        heading: 'Design the right to forget into the graph',
        paragraphs: [
          'Deletion and export become difficult when customer identity is copied into disconnected systems. A shared relationship model with explicit links makes it possible to find what must be retained, what may be removed, and what should be redacted from downstream context.',
          'Customer 360 should increase the organization’s accountability to the customer—not merely its visibility into the customer.',
        ],
      },
    ],
    sources: [
      { label: 'Privacy Framework', publisher: 'NIST', url: 'https://www.nist.gov/privacy-framework' },
      { label: 'Cybersecurity, privacy, and AI', publisher: 'NIST', url: 'https://www.nist.gov/itl/applied-cybersecurity/cybersecurity-privacy-and-ai' },
    ],
  },
  {
    slug: 'one-person-crm-daily-loop',
    kind: 'Field guide',
    category: 'Solopreneur CRM',
    title: 'The 20-minute CRM loop for a one-person business',
    description: 'A small daily practice for keeping relationships, opportunities, delivery, billing, and follow-ups honest without becoming a full-time administrator.',
    publishedAt: '2026-08-31',
    readMinutes: 6,
    takeaways: [
      'Start with promises and next actions, not database completeness.',
      'Use one relationship record to connect selling, delivery, billing, and service.',
      'A weekly review should remove stale work rather than manufacture activity.',
    ],
    sections: [
      {
        heading: 'Five minutes: recover the promises',
        paragraphs: [
          'Open overdue tasks, unanswered customer messages, unpaid invoices, and deals without a next step. Do not begin by cleaning every field. Begin with the commitments whose delay changes someone else’s day.',
          'Close work that is truly finished, reschedule work with a reason, and attach the next action to the relationship it serves.',
        ],
      },
      {
        heading: 'Ten minutes: move the live work',
        paragraphs: [
          'Review the few opportunities and projects that can materially move this week. Add the smallest useful note after a conversation, update the stage only when reality changed, and connect the document or invoice that proves the next milestone.',
        ],
        bullets: [
          'Every active opportunity has one dated next action.',
          'Every delivery promise has an owner—even when the owner is you.',
          'Every sent invoice has a due date and a relationship context.',
        ],
      },
      {
        heading: 'Five minutes: make tomorrow lighter',
        paragraphs: [
          'Capture new contacts, merge obvious duplicates, and write one sentence of context that your future self will understand. Then stop. A solo CRM earns its place by reducing cognitive load, not by creating a second job.',
        ],
      },
    ],
    sources: [
      { label: 'FREE CRM product guide', publisher: 'FREE CRM', url: 'https://freecrm.dev/how-it-works' },
    ],
  },
  {
    slug: 'microsoft-agents-move-into-the-flow-of-crm-work',
    kind: 'News brief',
    category: 'Agentic CRM',
    title: 'Signal: Microsoft moves sales and service agents into the flow of CRM work',
    description: 'What Microsoft’s July 2026 Dynamics announcements suggest about context, adoption, and the emerging agentic CRM interface.',
    publishedAt: '2026-08-31',
    readMinutes: 4,
    takeaways: [
      'The competitive surface is moving from a separate assistant to the seller’s existing flow of work.',
      'CRM and communication context are being combined to prepare, summarize, and update records.',
      'Open systems need portable context and governed tools—not a copy of a proprietary assistant.',
    ],
    sections: [
      {
        heading: 'What changed',
        paragraphs: [
          'Microsoft announced general availability for Sales Agent and Service Agent in Microsoft 365 Copilot and for Copilot experiences inside Dynamics 365 Sales and Customer Service. The company describes a shared experience across CRM, Outlook, Teams, and Copilot, grounded in Dynamics data and work context.',
          'A related July post describes extending Dynamics 365 Sales agents through Model Context Protocol, signaling that the tool boundary—not only the model—is becoming a core product surface.',
        ],
      },
      {
        heading: 'Why it matters for open CRM',
        paragraphs: [
          'The strategic direction is clear even if individual product claims still require independent evaluation: agents are moving closer to customer records and closer to consequential actions. Open CRM projects should respond with interoperable context, explicit tool contracts, and policy receipts rather than a proprietary black box.',
        ],
      },
    ],
    sources: [
      { label: 'Moving sales and service organizations forward with agentic CX', publisher: 'Microsoft', url: 'https://www.microsoft.com/en-us/dynamics-365/blog/business-leader/2026/07/07/moving-sales-and-service-organizations-forward-with-agentic-cx-and-microsoft-365-copilot/' },
      { label: 'Extending agentic Dynamics 365 Sales with MCP', publisher: 'Microsoft', url: 'https://www.microsoft.com/en-us/dynamics-365/blog/topic/ai/' },
    ],
  },
  {
    slug: 'hubspot-reframes-crm-as-an-agentic-customer-platform',
    kind: 'News brief',
    category: 'Agentic CRM',
    title: 'Signal: HubSpot reframes CRM as an agentic customer platform',
    description: 'A concise reading of HubSpot’s 2026 platform language—and the questions an open CRM community should ask next.',
    publishedAt: '2026-08-31',
    readMinutes: 4,
    takeaways: [
      'CRM vendors are repositioning the category around agents and shared customer context.',
      'Pricing, portability, and permission boundaries matter as much as feature breadth.',
      'Open CRM can make agent behavior inspectable and replaceable by design.',
    ],
    sections: [
      {
        heading: 'The signal',
        paragraphs: [
          'HubSpot’s 2026 newsroom describes the company as an agentic customer platform and highlights AI agents, deal progression, data unification, and connectors that bring CRM context into external AI tools. This is a category-level shift: CRM is being presented less as a database application and more as a context and action layer.',
        ],
      },
      {
        heading: 'The open-source question',
        paragraphs: [
          'When customer context becomes fuel for many agents, operators need to know which data left the workspace, which model or tool received it, and what happened afterward. An open platform can make those boundaries visible and let a user replace the model, connector, or host without replacing the relationship record.',
        ],
      },
    ],
    sources: [
      { label: 'Introducing the Agentic Customer Platform', publisher: 'HubSpot', url: 'https://www.hubspot.com/company-news/introducing-the-agentic-customer-platform' },
      { label: 'HubSpot company and product newsroom', publisher: 'HubSpot', url: 'https://www.hubspot.com/company-news' },
    ],
  },
  {
    slug: 'salesforce-unifies-agentic-contact-center-and-crm',
    kind: 'News brief',
    category: 'Customer 360',
    title: 'Signal: Salesforce joins contact-center channels, CRM data, and agents',
    description: 'What the Agentforce Contact Center announcement reveals about human handoffs, shared context, and the next CRM control boundary.',
    publishedAt: '2026-08-31',
    readMinutes: 4,
    takeaways: [
      'Voice, digital service, CRM context, and agents are converging into one operating surface.',
      'Human handoff quality depends on preserving the full decision and conversation trail.',
      'Channel unification increases the importance of scoped access and auditable actions.',
    ],
    sections: [
      {
        heading: 'The signal',
        paragraphs: [
          'Salesforce introduced Agentforce Contact Center in March 2026, describing one system for voice, digital channels, CRM data, AI agents, human handoffs, and operational visibility. The announcement reflects a broader CRM movement: service automation is becoming an active participant in the customer record rather than a separate bot at the edge.',
        ],
      },
      {
        heading: 'What to watch',
        paragraphs: [
          'The decisive details will be operational. Can a human see which context shaped an automated answer? Can the organization restrict an agent to the minimum data required? Does the handoff carry decisions, uncertainty, and attempted actions—not just a transcript? Open CRM should make those questions testable.',
        ],
      },
    ],
    sources: [
      { label: 'Introducing the Agentic Contact Center', publisher: 'Salesforce', url: 'https://www.salesforce.com/news/stories/agentforce-contact-center-announcement/' },
    ],
  },
];

export const crmFaqs = [
  {
    question: 'What is CRM?',
    answer: 'Customer relationship management is the practice and system used to remember people, organizations, conversations, opportunities, promises, delivery, billing, and service across the life of a relationship.',
  },
  {
    question: 'What makes FREE CRM free?',
    answer: 'The source is MIT licensed, the product can run locally, and cloud deployment uses credentials and infrastructure controlled by the operator. Hosting providers may still charge for usage beyond their free allowances.',
  },
  {
    question: 'What is open-source CRM?',
    answer: 'An open-source CRM provides source code under an open license so people can inspect, run, modify, and redistribute it. Real operational freedom also requires usable deployment instructions, exports, and replaceable integrations.',
  },
  {
    question: 'What is Agentic CRM?',
    answer: 'Agentic CRM adds governed agents that can observe CRM context, propose next actions, and—within explicit policy—perform work. Safe implementations need scoped tools, approvals, budgets, receipts, audit history, and an emergency stop.',
  },
  {
    question: 'What is CRM for Agents?',
    answer: 'CRM for Agents exposes relationships and business operations through precise, machine-readable contracts. Agents become first-class actors with identity, delegation, permissions, and receipts rather than automating a human screen invisibly.',
  },
  {
    question: 'Can a solopreneur benefit from CRM?',
    answer: 'Yes. A focused CRM reduces the mental cost of remembering follow-ups, proposals, invoices, service history, and the context behind each relationship. It should simplify the day rather than demand constant administration.',
  },
  {
    question: 'Is Customer 360 the same as collecting everything?',
    answer: 'No. A trustworthy customer view collects the minimum useful context, preserves provenance and consent, distinguishes facts from predictions, and limits retention and access according to purpose.',
  },
  {
    question: 'Can FREE CRM run locally?',
    answer: 'Yes. Local-first operation is a product requirement. Docker and cloud paths complement the device-local path; they do not replace it.',
  },
  {
    question: 'Does FREE CRM include shared API keys?',
    answer: 'No. Cloud providers and integrations use credentials supplied by the person deploying the instance. Secrets must stay out of the repository and browser-visible configuration.',
  },
  {
    question: 'How can I contribute an article or research note?',
    answer: 'Open a focused pull request with original writing, primary sources, dates, clear claims, and no customer or credential data. The contribution guide explains the validation and review loop.',
  },
] as const;

export function findEditorialArticle(slug: string) {
  return editorialArticles.find((article) => article.slug === slug);
}

export function listEditorialArticlesNewestFirst() {
  return [...editorialArticles].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || left.title.localeCompare(right.title));
}

export function formatEditorialDate(date: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}
