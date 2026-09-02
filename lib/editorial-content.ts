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
  {
    slug: 'run-a-crm-exit-drill-before-you-need-one',
    kind: 'Field guide',
    category: 'Open CRM',
    title: 'Run a CRM exit drill before you need one',
    description: 'A practical test for proving that customer records, relationships, files, and operating context can survive a provider outage or a deliberate move.',
    publishedAt: '2026-09-01',
    readMinutes: 4,
    takeaways: [
      'Data ownership becomes credible only when an operator can export, inspect, and restore the working relationship graph.',
      'A useful CRM exit package includes stable identifiers, links, timestamps, provenance, files, and configuration—not only a contacts CSV.',
      'Test recovery in an empty, isolated environment and record the gaps while the original system is still available.',
    ],
    sections: [
      {
        heading: 'An export button is not an exit plan',
        paragraphs: [
          'A contacts CSV may preserve names and email addresses while losing the structure that made the CRM useful: which people belong to an organization, which promise belongs to an opportunity, which note explains a decision, and which file proves the latest agreement. A real exit test asks whether the work can resume, not merely whether rows can be downloaded.',
          'Start by naming the operating minimum. For many small teams it includes actors, relationship links, opportunities, tasks, notes, consent or preference history, audit timestamps, attachment metadata, and the files themselves. Export stable identifiers and timestamps so that another system can reconnect the graph without guessing from display names.',
        ],
        bullets: [
          'Keep a manifest describing the export format and schema version.',
          'Include stable record identifiers and relationship keys.',
          'Preserve source, author, and observed-at timestamps where they matter.',
          'List every attachment with its record link, media type, size, and checksum.',
        ],
      },
      {
        heading: 'Restore somewhere deliberately empty',
        paragraphs: [
          'A backup that has never been restored is an assumption. On a regular cadence, take a dated export and load it into an empty non-production environment that cannot send customer messages or trigger integrations. Measure how long it takes before a person can find a contact, follow an opportunity to its notes and tasks, and open a representative attachment.',
          'Validate counts, but do not stop there. Sample old and new records, follow links in both directions, recalculate file checksums, and confirm that deleted or restricted information did not reappear. Record every manual repair and every undocumented dependency; those observations are the real output of the drill.',
        ],
      },
      {
        heading: 'Separate recovery from portability',
        paragraphs: [
          'Provider recovery features and portable exports protect against different failures. Cloudflare D1 Time Travel, for example, can restore a database to an earlier point within its retention window. That is valuable after an accidental change, but it does not by itself prove that an operator can leave the provider or reconstruct linked files and configuration elsewhere.',
          'SQLite also exposes supported backup mechanisms for creating a consistent copy of a live database. Whichever storage path is used, keep an off-platform copy under the operator’s control, document the restore procedure, and repeat the exercise after meaningful schema or integration changes.',
        ],
        bullets: [
          'Record the export time, application version, schema version, and responsible operator.',
          'Keep credentials outside the archive and document how replacements are supplied.',
          'Disable outbound integrations in the recovery environment before importing records.',
          'Treat a failed drill as a product defect, not as an operator embarrassment.',
        ],
      },
    ],
    sources: [
      { label: 'Contingency Planning Guide for Federal Information Systems', publisher: 'NIST', url: 'https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final' },
      { label: 'Time Travel and backups', publisher: 'Cloudflare', url: 'https://developers.cloudflare.com/d1/reference/time-travel/' },
      { label: 'SQLite Backup API', publisher: 'SQLite', url: 'https://www.sqlite.org/backup.html' },
    ],
  },
  {
    slug: 'the-agent-is-not-the-user',
    kind: 'Research note',
    category: 'CRM for Agents',
    title: 'The agent is not the user: model delegated authority in CRM',
    description: 'A practical identity model for showing who authorized CRM work, which agent acted, what it was allowed to do, and when that authority ends.',
    publishedAt: '2026-09-01',
    readMinutes: 5,
    takeaways: [
      'Keep the accountable principal, acting agent, software client, and target workspace distinguishable in every consequential request.',
      'Delegation should be narrow, time-bound, audience-bound, revocable, and explicit about permitted actions and records.',
      'An agent receipt should preserve the delegation and policy decision that existed when the side effect occurred.',
    ],
    sections: [
      {
        heading: 'A shared login destroys the evidence',
        paragraphs: [
          'When an agent reuses a person’s browser session or long-lived personal token, the CRM can see an authenticated user but cannot reliably explain who performed the work. A later audit may show that the owner changed a deal, sent a message, or exported contacts even when software made the decision and executed the action.',
          'A safer record keeps several roles separate: the principal on whose behalf work is being done, the agent that is acting, the client or runtime presenting the request, and the workspace and resource being touched. Authentication can establish identities; authorization must still decide whether this specific delegation permits this specific action.',
        ],
      },
      {
        heading: 'Turn delegation into a bounded object',
        paragraphs: [
          'A delegation should be inspectable data, not an implication hidden in a prompt. At minimum it needs an issuer, principal, acting agent, target audience, workspace, allowed operations, valid time window, and revocation state. Higher-risk work can add record filters, field limits, spend or volume budgets, and approval requirements.',
          'OAuth Token Exchange defines a standards-based way to represent delegation and an acting party, including an actor claim. OAuth Rich Authorization Requests shows how structured authorization details can describe finer-grained actions and resources than a flat scope string. FREE CRM does not need to copy either protocol internally, but it should preserve the same distinctions at its API and audit boundaries.',
        ],
        bullets: [
          'Name the exact workspace, resource types, and permitted commands.',
          'Bind the grant to the intended API or tool audience.',
          'Set short expiry and make revocation effective before the next command.',
          'Require a new approval when an agent requests broader authority.',
        ],
      },
      {
        heading: 'Identity proof is not permission to act',
        paragraphs: [
          'NIST’s federation guidance requires relying parties to validate assertions, including their issuer, audience, subject, signature, and time window. Those checks help establish who is present in a transaction; they do not answer every business authorization question. A valid identity assertion should therefore enter the CRM policy engine as evidence, not as an automatic grant to read or change customer data.',
          'After execution, the receipt should bind the principal, agent, delegation identifier, requested command, policy result, approval when required, idempotency key, and observed outcome. Expiring the token later must not erase that historical explanation. This is how CRM for Agents remains accountable to the humans whose relationships it serves.',
        ],
        bullets: [
          'Reject tokens intended for another audience or workspace.',
          'Evaluate current revocation and emergency-stop state before execution.',
          'Store immutable receipts separately from mutable agent configuration.',
          'Show people both the represented principal and the agent that acted.',
        ],
      },
    ],
    sources: [
      { label: 'OAuth 2.0 Token Exchange', publisher: 'IETF RFC Editor', url: 'https://www.rfc-editor.org/rfc/rfc8693.html' },
      { label: 'OAuth 2.0 Rich Authorization Requests', publisher: 'IETF RFC Editor', url: 'https://www.rfc-editor.org/rfc/rfc9396.html' },
      { label: 'Federation and Assertions', publisher: 'NIST', url: 'https://pages.nist.gov/800-63-4/sp800-63c.html' },
    ],
  },
  {
    slug: 'write-the-cue-not-just-the-task',
    kind: 'Research note',
    category: 'Solopreneur CRM',
    title: 'Write the cue, not just the task: a solopreneur CRM for future intentions',
    description: 'A research-backed way to turn vague follow-ups into reliable cues that reconnect the right action, relationship context, and moment.',
    publishedAt: '2026-09-01',
    readMinutes: 5,
    takeaways: [
      'A reliable follow-up records the cue, the action, and the relationship context—not merely a due date.',
      'Use event cues when customer activity should trigger attention and time cues when a promise has a real deadline.',
      'Treat reminders as user-owned operating data that can be inspected, exported, and recovered with the rest of the relationship record.',
    ],
    sections: [
      {
        heading: 'A follow-up is a delayed intention',
        paragraphs: [
          'A solo operator often knows what needs to happen but cannot keep every future intention active while selling, delivering, billing, and supporting customers. Research on cognitive offloading describes the practical response: move some memory work into an external aid so attention can return to the work in front of you.',
          'The useful CRM unit is therefore not a generic task such as “follow up.” It is a delayed intention with a retrieval cue: when a date arrives or a meaningful event occurs, bring back the specific action and enough relationship context to perform it well. The record should reduce reconstruction, not create another mystery for your future self.',
        ],
      },
      {
        heading: 'Store the trigger and the action together',
        paragraphs: [
          'Time-based cues fit promises with a real clock: send the proposal Friday, check an invoice three days after it is due, or prepare a renewal review thirty days before expiry. Event-based cues fit changes in the relationship: a customer replies, a document is signed, a service issue closes, or an opportunity has no next action.',
          'Whichever cue you choose, keep it beside the actor and the work it serves. A reminder detached from the relationship can tell you that something is due while withholding why it matters. A compact, useful intention record includes:',
        ],
        bullets: [
          'The person or organization the action serves.',
          'A specific time or event that should bring the intention back.',
          'One concrete action, written as a verb and observable outcome.',
          'The minimum note, message, document, or decision needed to act.',
          'A completion signal so the reminder cannot linger ambiguously.',
        ],
      },
      {
        heading: 'Make the reminder survive the tool',
        paragraphs: [
          'External memory is only helpful while it remains available and trustworthy. An open CRM should let the owner inspect why a reminder exists, change its cue without losing history, and export the due time, time zone, recurrence, source record, completion state, and relationship links in documented formats.',
          'A reminder should also remain distinct from an automated side effect. Surfacing “send the renewal note” is not the same as sending it. If an agent may perform the action, policy, approval, idempotency, and a receipt still belong between the cue and the customer-facing consequence.',
          'This is the quiet value of CRM for a one-person business: it makes future promises retrievable without pretending that every next step should be automatic. Your attention becomes lighter, while judgment and relationship ownership remain yours.',
        ],
      },
    ],
    sources: [
      { label: 'A role for metamemory in cognitive offloading', publisher: 'PubMed Central', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6838677/' },
      { label: 'Outsourcing memory to external tools: a review of intention offloading', publisher: 'PubMed Central', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9971128/' },
    ],
  },
  {
    slug: 'customer-360-needs-a-correction-queue',
    kind: 'Field guide',
    category: 'Customer 360',
    title: 'Customer 360 needs a correction queue, not a silent overwrite',
    description: 'A practical workflow for challenging, reviewing, propagating, and preserving corrections across source systems and agent-generated context.',
    publishedAt: '2026-09-01',
    readMinutes: 6,
    takeaways: [
      'Treat a correction as a governed case with evidence, scope, a decision, propagation, and verification—not a direct field overwrite.',
      'Keep facts, opinions, and model inferences distinguishable so each challenge receives the right review.',
      'Prevent corrected data from being re-imported by connectors or reused by agents without its dispute status.',
    ],
    sections: [
      {
        heading: 'A correction is a workflow, not an edit',
        paragraphs: [
          'A Customer 360 view can repeat one wrong value across a contact, organization, timeline, segment, report, and agent context. Replacing the visible field may make the screen look right while leaving the source record, derived profiles, and connected systems unchanged. The next synchronization can quietly restore the error.',
          'Open a correction case instead. Capture the challenged assertion, the person or authorized representative raising it, its source and observed time, supporting evidence, the purposes for which it is used, and every known copy or derived output. For consequential use, mark the value as disputed while it is reviewed instead of presenting an uncertain claim as settled fact.',
          'California’s current privacy rules describe correction as more than changing one database: businesses must consider the nature and source of the information, correct relevant systems, direct service providers or contractors to do the same, and take steps so corrected data stays corrected. That is a useful engineering standard even where a particular legal regime does not apply.',
        ],
      },
      {
        heading: 'Review facts, opinions, and inferences differently',
        paragraphs: [
          'A misspelled legal name, a salesperson’s account note, and a model-generated likelihood score are not the same kind of claim. The Information Commissioner’s Office distinguishes the accuracy of personal data from the statistical accuracy of an AI system and warns that an inference can still be personal data without being a fact. A correction queue should preserve that distinction rather than forcing every challenge through a single overwrite control.',
          'Use an explicit case state such as received, authority verified, impact scoped, source reviewed, decided, propagated, and verified. Accepting, partly accepting, or denying a request should produce a reason that a person can inspect. Preserve the historical value in restricted audit history when necessary, but do not let that history leak back into ordinary search, reports, or agent prompts.',
        ],
        bullets: [
          'Link the case to the affected actor, field, assertion, and source.',
          'Record evidence, the old and proposed values, provenance, and observed times.',
          'List downstream systems, derived attributes, reports, and agent memories that may be affected.',
          'Store the decision, responsible reviewer, due date, propagation attempts, and verification receipt.',
        ],
      },
      {
        heading: 'Propagate the decision and prevent recontamination',
        paragraphs: [
          'When a correction is accepted, update the authoritative record and create a versioned correction marker that connectors understand. A source mapping, suppression rule, or correction tombstone can stop an older upstream value from winning on the next import. Queue downstream updates, record failures and retries, and verify the result rather than treating a successful API call as proof that every copy changed.',
          'European data-protection law also pairs rectification with communicating it to recipients in applicable circumstances. Product teams should therefore make affected destinations visible and give operators a defensible propagation record. Exact obligations vary by jurisdiction and context; this field guide is a product-design pattern, not a claim that one workflow satisfies every law.',
          'Agents need the same protection. Disputed information should carry machine-readable status, corrected information should supersede stale context, and high-impact actions should pause for human review when the truth is unresolved. The goal is not a perfectly clean portrait. It is a Customer 360 that can admit uncertainty, repair mistakes, and show that the repair held.',
        ],
        bullets: [
          'Make connector conflict policy explicit: source priority alone must not reverse an accepted correction.',
          'Invalidate or rebuild derived segments, scores, summaries, and embeddings that used the old value.',
          'Show failed propagation attempts to an operator and retry them idempotently.',
          'Keep correction status available to policy checks before an agent reads or acts on the data.',
        ],
      },
    ],
    sources: [
      { label: 'California Consumer Privacy Act and regulations, effective January 1, 2026', publisher: 'California Privacy Protection Agency', url: 'https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf' },
      { label: 'Accuracy and statistical accuracy in AI', publisher: 'Information Commissioner’s Office', url: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/artificial-intelligence/guidance-on-ai-and-data-protection/what-do-we-need-to-know-about-accuracy-and-statistical-accuracy/' },
      { label: 'General Data Protection Regulation, Articles 16 and 19', publisher: 'EUR-Lex', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?qid=1696001039870&uri=CELEX%3A32016R0679' },
    ],
  },
  {
    slug: 'shadow-mode-before-agent-autonomy',
    kind: 'Research note',
    category: 'Agentic CRM',
    title: 'Shadow mode before autonomy: rehearse CRM agents without touching customers',
    description: 'A practical evaluation ladder that separates platform safety, model behavior, and business usefulness before an agent receives consequential CRM tools.',
    publishedAt: '2026-09-02',
    readMinutes: 6,
    takeaways: [
      'Test deterministic platform controls separately from probabilistic model behavior and real business outcomes.',
      'Use synthetic test records, with every outbound or destructive tool replaced by a recordable stub.',
      'Promote one narrow capability at a time against named thresholds; shadow-mode evidence never grants production authority by itself.',
    ],
    sections: [
      {
        heading: 'Three different questions are often called an evaluation',
        paragraphs: [
          'A CRM agent can fail in at least three distinct ways. The platform may fail to enforce a tenant boundary, approval, budget, tool scope, idempotency key, or emergency stop. The model may misunderstand the relationship and propose the wrong next step. Or a technically correct workflow may create more review work than value for the person running the business. One benchmark score cannot answer all three questions.',
          'Start with deterministic platform invariants that do not need a model at all. A prohibited tool call should be denied every time. A replay should not repeat a side effect. A stopped agent should not create new work. These are software contracts, so treat any violation as a release failure rather than averaging it into a quality score.',
          'Evaluate model behavior on a separate, versioned task set: recovering relevant context, distinguishing fact from inference, choosing when to abstain, drafting an appropriate proposal, and escalating ambiguity. Then assess usefulness with people in the actual workflow. NIST’s Generative AI Profile frames risk work across the system lifecycle and recommends evaluations that reflect deployment context; applying that idea to CRM means measuring the model, the control boundary, and the human outcome without pretending they are interchangeable.',
        ],
      },
      {
        heading: 'Shadow mode should create evidence, not consequences',
        paragraphs: [
          'In shadow mode, the agent sees a realistic but isolated stream of CRM situations and produces the work it would have proposed. Consequential tools are replaced with stubs. The system may record that the agent wanted to send a renewal note, change an opportunity stage, merge two contacts, or schedule a meeting, but it does not send, change, merge, or schedule anything.',
          'Build the rehearsal set from synthetic actors and deliberately constructed edge cases. Include duplicate names, stale notes, disputed fields, missing consent, conflicting time zones, ambiguous company relationships, expired grants, exhausted budgets, and requests that cross workspace boundaries. When production reveals a useful failure pattern, reconstruct its logic as a synthetic fixture containing no customer content. Keep any governed real-data research outside this rehearsal path and subject it to separate privacy, legal, and access controls.',
          'Each sample should preserve the input fixture version, model and prompt configuration, tools offered, policy result, proposed action, expected outcome, scorer output, and trace. Inspect, the open-source evaluation framework developed by the UK AI Security Institute and Meridian Labs, illustrates this composable structure through datasets, agents, tools, scorers, logs, and sandboxed execution. A CRM team can adopt the pattern without adopting a particular framework: make every result repeatable enough to investigate and compare.',
        ],
        bullets: [
          'Disable network delivery and destructive adapters at the environment boundary, not only in the prompt.',
          'Score correct refusal and escalation alongside successful task completion.',
          'Keep fixtures free of credentials and uncontrolled customer information.',
          'Review the full trace for high-impact failures instead of trusting an aggregate score.',
        ],
      },
      {
        heading: 'Promotion is a ladder, not a single autonomy switch',
        paragraphs: [
          'Promote capabilities individually. An agent that reliably summarizes a timeline has not thereby earned permission to email a customer. A useful ladder begins with deterministic control tests, moves to proposal-only fixtures, then to shadow tool calls, and only then reaches a small supervised pilot for a reversible, low-impact operation. Higher-impact actions can remain approval-only indefinitely.',
          'Write the promotion rule before running the evaluation. Safety invariants need zero known violations. Quality thresholds should name the task set, scorer, acceptable error classes, number of repeated runs, model and prompt versions, and the person responsible for reviewing failures. Add every confirmed failure to a durable regression set so a future model, tool, or policy change cannot quietly erase the lesson.',
          'Shadow mode is evidence for a decision, not the decision itself. Production execution still needs current identity, policy, scope, approval, budget, idempotency, and stop checks. If monitoring finds a regression, downgrade only the affected capability and preserve the traces that explain why. The goal is not to make autonomy inevitable. It is to make every increase—or decrease—in authority deliberate, narrow, and recoverable.',
        ],
        bullets: [
          'Level 0: deterministic tenant, policy, replay, budget, and stop invariants.',
          'Level 1: model proposals over versioned fixtures with no tool execution.',
          'Level 2: shadow tool calls captured by non-delivering, non-destructive stubs.',
          'Level 3: supervised use of one reversible capability with named rollback criteria.',
        ],
      },
    ],
    sources: [
      { label: 'Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile', publisher: 'NIST', url: 'https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf' },
      { label: 'Inspect: an open-source framework for large language model evaluations', publisher: 'UK AI Security Institute', url: 'https://inspect.aisi.org.uk/' },
      { label: 'AI measurement and evaluation', publisher: 'NIST', url: 'https://www.nist.gov/ai-measurement-and-evaluation' },
    ],
  },
  {
    slug: 'crm-agents-need-uncertainty-fields',
    kind: 'Field guide',
    category: 'CRM for Agents',
    title: 'CRM for Agents needs uncertainty fields, not false precision',
    description: 'A practical contract for exposing unknown, stale, conflicted, and inferred relationship data so agents can pause safely and people can correct it.',
    publishedAt: '2026-09-02',
    readMinutes: 6,
    takeaways: [
      'Model important CRM facts with state, provenance, observed time, and responsible actor instead of returning a bare value.',
      'Make agents distinguish unknown, stale, conflicted, withheld, and inferred information before they draft or execute consequential work.',
      'Turn ambiguity into a reviewable correction workflow with fixtures, receipts, and explicit human resolution—not a hidden confidence score.',
    ],
    sections: [
      {
        heading: 'A blank value hides several different truths',
        paragraphs: [
          'When an agent reads a missing phone number, the safest interpretation is not always “there is no phone number.” The field may never have been collected, may have expired, may be withheld by consent, or may be present in a source the workspace has not connected. A single null value erases those distinctions and invites the model to fill the gap with a guess.',
          'CRM-for-Agents interfaces should expose an explicit state alongside each important fact. Useful states include unknown, observed, stale, conflicted, withheld, and inferred. “Observed” means a source asserted the value at a known time; “inferred” means a system derived it and must not present it as a customer statement. “Conflicted” means two relevant assertions disagree and need a resolution path. These states are relationship data, not implementation trivia.',
          'The W3C PROV-O model is a useful mental model: entities, activities, and agents can be connected into a provenance chain, with responsibility attached to what happened. A CRM does not need to adopt RDF to benefit from the idea. It does need to preserve where a fact came from, when it was observed, what transformed it, and which actor or integration is accountable for the assertion.',
        ],
        bullets: [
          'Never convert “not connected” into “not available.”',
          'Keep customer-stated facts separate from model-generated inferences.',
          'Treat consent and retention limits as visible states, not silent deletion.',
          'Expose conflicts instead of choosing the newest value without evidence.',
        ],
      },
      {
        heading: 'Use a response contract that keeps uncertainty visible',
        paragraphs: [
          'A machine-readable relationship response can carry a value with its evidence: a stable field identifier, state, source actor, observedAt timestamp, provenance reference, and—when relevant—a freshness or expiry rule. The point is not to make every response verbose. The point is to ensure an agent cannot mistake a convenient projection for an unconditional fact.',
          'Use a standards-based timestamp such as RFC 3339 for observedAt, expiresAt, and resolvedAt. Give integrations a way to report “not authorized to disclose” separately from “no value exists.” Preserve the source record or receipt identifier when policy permits, and expose a human-readable explanation for why a field is stale, conflicted, or withheld. If an agent cannot explain the state of a fact, it should not use that fact for a high-impact action.',
          'Do not replace evidence with a single confidence number. A 0.92 score does not tell a person whether the source was a customer, a billing system, an old import, or a model inference. Scores can help prioritize review, but the contract should make provenance, time, authority, and disagreement inspectable first. This is consistent with W3C Data on the Web Best Practices, which treats metadata and source citation as part of making data understandable and trustworthy to both people and software.',
        ],
        bullets: [
          'Return state and provenance in the same payload as the projected value.',
          'Use standards-based timestamps and document the clock and timezone assumptions.',
          'Separate access denial, missing data, expiry, and disagreement.',
          'Use confidence only as a review signal, never as permission to act.',
        ],
      },
      {
        heading: 'Turn ambiguity into a workflow, not a silent fallback',
        paragraphs: [
          'Uncertainty becomes useful when the platform gives it a next step. A renewal agent that sees two conflicting renewal dates should create a review item with both sources, their observed times, the proposed resolution, and the policy that blocked sending. A service agent that finds an expired consent state should ask for a permitted channel rather than quietly selecting an email address. A merge assistant should propose a relationship link while leaving the original records and evidence intact until a person confirms.',
          'Build these cases into deterministic fixtures: duplicate organizations, stale contact details, missing consent, conflicting time zones, revoked grants, and an integration that reports incomplete provenance. The expected outcome is not always a successful task. Sometimes it is a refusal, an escalation, or a correction request. Record the decision as a receipt so the same ambiguity can be replayed, audited, and used to improve the connector or policy.',
          'A CRM for Agents earns trust when uncertainty narrows safely over time. Let a human resolve a conflict with a reason and source, then preserve that correction as a new assertion rather than overwriting history. Agents may suggest the next question, but they should not manufacture certainty to keep a workflow moving. The relationship remains healthier when “I do not know yet” is a precise, actionable state.',
        ],
        bullets: [
          'Block consequential actions when required facts are conflicted, stale, or withheld.',
          'Show the competing assertions and the policy reason for escalation.',
          'Persist corrections as new, attributable assertions with receipts.',
          'Regression-test refusal and escalation paths alongside successful resolutions.',
        ],
      },
    ],
    sources: [
      { label: 'PROV-O: The PROV Ontology', publisher: 'W3C', url: 'https://www.w3.org/TR/prov-o/' },
      { label: 'Data on the Web Best Practices', publisher: 'W3C', url: 'https://www.w3.org/TR/dwbp/' },
      { label: 'Date and Time on the Internet: Timestamps', publisher: 'IETF RFC Editor', url: 'https://www.rfc-editor.org/rfc/rfc3339.html' },
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
