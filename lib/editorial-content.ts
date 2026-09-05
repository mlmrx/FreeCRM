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
  {
    slug: 'first-free-crm-contribution-friction-to-patch',
    kind: 'Field guide',
    category: 'Open CRM',
    title: 'Your first FREE CRM contribution: turn a friction report into a merged patch',
    description: 'A welcoming, security-aware path from a reproducible problem to a small reviewed change that improves the open CRM for everyone.',
    publishedAt: '2026-09-02',
    readMinutes: 6,
    takeaways: [
      'Report a reproducible user friction with safe fixtures and observable expected-versus-actual behavior before proposing a grand redesign.',
      'Choose the smallest complete vertical slice: implementation, regression coverage, documentation, and security review together.',
      'Make a pull request legible to a stranger with a focused diff, validation evidence, source links, and explicit risks.',
    ],
    sections: [
      {
        heading: 'Start with a reproducible friction, not a grand roadmap',
        paragraphs: [
          'The most valuable first contribution is often a precise account of something that made a relationship workflow harder. “The workspace feels confusing” is a useful signal, but it is not yet an actionable issue. Name the route or command, the safe steps that reproduce the problem, what you expected, what happened instead, and who is affected. A short screen recording or a redacted fixture can help a maintainer see the same thing you saw.',
          'Keep the report free of credentials, tokens, private keys, and real customer records. Replace names, messages, and identifiers with synthetic examples that preserve the shape of the problem. Include operating-system, browser, and deployment details only when they change the result. If the report might expose a security vulnerability, use the project’s private security channel instead of a public issue. A trustworthy open project makes the safe path easy to find.',
          'GitHub’s contribution flow is deliberately incremental: familiarize yourself with the repository, create an isolated branch or fork, make a focused change, and open a pull request for feedback. That sequence keeps an experiment reversible and gives other people a clear place to review the proposed behavior before it reaches the default branch.',
        ],
        bullets: [
          'Describe one observable friction and the smallest user outcome that would resolve it.',
          'Attach synthetic fixtures, not copied customer conversations or production exports.',
          'Separate a public bug report from a private vulnerability disclosure.',
          'Search existing issues and the roadmap before opening a duplicate request.',
        ],
      },
      {
        heading: 'Choose the smallest complete vertical slice',
        paragraphs: [
          'A small patch is not the same as an incomplete patch. Prefer a narrow vertical slice that carries the behavior from input to durable result: the UI or API change, the domain rule, a regression test, and the user-facing explanation. If the request is too large to validate in one review, split it into an ordered series with a useful state at every step. A contributor can always follow up; a reviewer should not have to reverse-engineer an unfinished architecture from one enormous diff.',
          'Use tests to describe the contract, not just the implementation. For a CRM workflow, test the normal path and the boundary that protects people: tenant isolation, authorization, idempotency, redaction, emergency stop, or a failed integration. Run the repository’s required checks locally and include the result in the pull request. If a check cannot run on your device, say why and provide the closest reproducible evidence rather than implying it passed.',
          'Documentation is part of the change. Update the relevant guide, command example, FAQ, or deployment note when behavior changes. Explain defaults, failure modes, and how an operator can recover. Open-source users should be able to understand a feature from the source and the docs without depending on a private conversation with the original contributor.',
        ],
        bullets: [
          'Keep the diff narrow enough that a reviewer can explain every changed line.',
          'Pair happy-path coverage with the security or reliability boundary it could cross.',
          'Run and record the project checks; report blocked checks honestly.',
          'Treat documentation, migration notes, and recovery guidance as deliverables.',
        ],
      },
      {
        heading: 'Make review easy for strangers',
        paragraphs: [
          'A good pull request is a compact argument: here is the user problem, here is the chosen behavior, here is the evidence, and here are the remaining risks. Start with a descriptive title and a short summary. Link the issue or discussion. Call out any compatibility, privacy, performance, or operational trade-off. Include screenshots or a short capture when visual behavior changed, and explain how to reproduce the result from a clean checkout.',
          'GitHub issue and pull-request templates exist for exactly this reason: maintainers can request structured context, while contributors get a checklist that prevents avoidable back-and-forth. Fill every relevant field and remove placeholders. Review your own diff as if you did not write it. Look for accidental debug output, broad permissions, hidden network calls, generated files, and claims that the tests do not support.',
          'The first contribution is successful when another person can review it, learn from it, and safely run it—not only when it merges. GitHub’s review workflow supports line comments, suggestions, approvals, and requested changes so the conversation stays attached to concrete code. Respond with small follow-up commits, keep the branch focused, and thank reviewers for finding the edge case that makes the next release safer.',
        ],
        bullets: [
          'Write the pull request as a problem, behavior, evidence, and risk summary.',
          'Use the repository templates and delete every irrelevant placeholder.',
          'Self-review for secrets, debug output, permissions, generated files, and unsupported claims.',
          'Treat review feedback as reusable project knowledge, not a private detour.',
        ],
      },
    ],
    sources: [
      { label: 'Contributing to a project', publisher: 'GitHub', url: 'https://docs.github.com/en/get-started/exploring-projects-on-github/contributing-to-a-project' },
      { label: 'Using templates to encourage useful issues and pull requests', publisher: 'GitHub', url: 'https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests' },
      { label: 'Quickstart for reviewing pull requests', publisher: 'GitHub', url: 'https://docs.github.com/en/pull-requests/get-started/reviewing-pull-requests-quickstart' },
    ],
  },
  {
    slug: 'solopreneur-crm-promises-from-possibilities',
    kind: 'Field guide',
    category: 'Solopreneur CRM',
    title: 'Solopreneur CRM: separate promises from possibilities',
    description: 'A calm, practical pipeline for one-person businesses that keeps commitments visible without turning every conversation into a sales forecast.',
    publishedAt: '2026-09-03',
    readMinutes: 6,
    takeaways: [
      'Track promises with an owner, next action, date, and evidence; keep possibilities in a separate, low-pressure view.',
      'Use one short weekly review to surface due, waiting, and at-risk commitments before they become forgotten work.',
      'Let agents draft reminders and summaries, but require human intent and policy checks before sending or changing a commitment.',
    ],
    sections: [
      {
        heading: 'A promise is not a pipeline stage',
        paragraphs: [
          'A one-person business usually has more relationships than it has hours to manage. The danger is not a lack of ambition; it is losing the small promises that make trust compound: “I will send the estimate Tuesday,” “I will introduce you to my designer,” or “I will check whether that renewal still fits.” A conventional sales pipeline can hide these commitments among speculative leads and make every card look like a forecast.',
          'Give promises their own first-class record. Capture the person or organization, the exact commitment, the next action, the date it matters, the owner, and the evidence that created it. A possibility can stay lightweight: a source, a rough need, and a reason to revisit. When a possibility becomes a promise, promote it deliberately instead of pretending the distinction never existed.',
          'The U.S. Small Business Administration describes CRM as a way to track leads, support follow-up, and keep opportunities and commitments from falling through gaps. That is a useful starting point, but a solopreneur can make the model kinder: optimize for reliable relationship work rather than a large volume of stages, scores, and reminders.',
        ],
        bullets: [
          'Record the exact promise in the person’s language when possible.',
          'Separate exploratory possibilities from commitments someone is relying on.',
          'Give every active promise one next action, one owner, and one meaningful date.',
          'Keep evidence attached so future-you can recover the context without guessing.',
        ],
      },
      {
        heading: 'Run a 30-minute weekly promise review',
        paragraphs: [
          'A weekly review should reduce cognitive load, not become another administrative project. Start with three views: due soon, waiting on someone else, and at risk. Open each item, read the latest evidence, and choose one of four outcomes: do the next action, schedule it, renegotiate the promise, or close it with a reason. If there is no clear next action, the record is not ready to remain active.',
          'Keep the review bounded. A solopreneur does not need to perfect every contact or classify every lead. Work the promises that protect trust first, then spend the remaining minutes on possibilities with a clear reason to return. Archive stale possibilities instead of letting them inflate an imaginary pipeline. A small, honest list is more useful than a full database that asks to be maintained every day.',
          'Use a simple aging signal: how long since the last meaningful change, not how many times the record was opened. A promise that has sat untouched for ten days deserves a question. The question might be to yourself—“Do I still intend to do this?”—or to the other person—“Has the need changed?” Either answer is progress because the relationship is no longer running on an invisible assumption.',
        ],
        bullets: [
          'Review due, waiting, and at-risk commitments in that order.',
          'Choose do, schedule, renegotiate, or close for every active promise.',
          'Age records by meaningful change rather than clicks or page views.',
          'Archive stale possibilities so the active list stays trustworthy.',
        ],
      },
      {
        heading: 'Keep automation subordinate to trust',
        paragraphs: [
          'An agent can make a one-person CRM feel lighter when it handles preparation instead of pretending to be the business owner. Let it summarize a thread, propose the next action, find promises with missing dates, or draft a gentle check-in. Show the evidence it used and mark every suggestion as a proposal until the person confirms the intent and channel.',
          'Do not let a model silently convert “maybe later” into a sales chase or send a reminder because a timer expired. Before an external message or record change, check identity, scope, consent, policy, and whether the promise is still current. When a person renegotiates a date, preserve the old commitment and record the new one with a reason. History makes the relationship legible when memory is imperfect.',
          'Personal-data duties still apply to a one-person operation. Business.gov.uk advises businesses to identify what customer and contact data they hold, collect only what is needed, and audit how it is used. Keep the promise record purpose-specific, restrict access, and provide an export or deletion path. The point of a solopreneur CRM is to help you show up reliably without turning a small practice into a surveillance system.',
        ],
        bullets: [
          'Use agents for summaries and drafts; keep intent and sending under human control.',
          'Show the evidence and policy result behind every automated suggestion.',
          'Preserve renegotiated commitments as attributable history, not silent overwrites.',
          'Collect only the relationship data needed for the stated purpose and retention period.',
        ],
      },
    ],
    sources: [
      { label: '3 Biggest Problems Implementing a CRM System, and What to Do About Them', publisher: 'U.S. Small Business Administration', url: 'https://www.sba.gov/blog/2016/2016-07/3-biggest-problems-implementing-crm-system-what-do-about-them/' },
      { label: 'Customer Relationship Management (CRM)', publisher: 'U.S. Small Business Administration', url: 'https://legacy.sba.gov/document/report-customer-relationship-management-crm' },
      { label: 'Data protection in your business', publisher: 'Business.gov.uk', url: 'https://www.business.gov.uk/support/regulations-and-licensing/data-protection-in-your-business/' },
    ],
  },
  {
    slug: 'customer-360-data-contracts-before-dashboards',
    kind: 'Research note',
    category: 'Customer 360',
    title: 'Customer 360 starts with a data contract, not a dashboard',
    description: 'A practical research note for making unified customer context useful, explainable, and privacy-aware before another connector adds another field.',
    publishedAt: '2026-09-03',
    readMinutes: 7,
    takeaways: [
      'Define the decision, purpose, owner, source, freshness, and retention of a signal before connecting it to a customer view.',
      'Keep facts, observations, and inferences distinct, with provenance and correction paths visible at the point of use.',
      'Default human and agent views to the least context needed, then make access, deletion, and review routine operations.',
    ],
    sections: [
      {
        heading: 'Name the decision before the data',
        paragraphs: [
          'A Customer 360 project often starts with a connector catalogue: billing, support, marketing, product events, enrichment. The more useful starting point is a decision catalogue. Which relationship decision should improve, for whom, and what is the smallest trustworthy context that would help? A service lead may need an open case and the customer’s preferred channel; they rarely need every clickstream event. A renewal review may need an invoice status and a dated commitment, not an unbounded behavioral history.',
          'Write a small data contract for each signal before it enters the shared profile. Record its purpose, accountable owner, source system, observed time, expected freshness, retention period, sensitivity, and the roles or agents allowed to use it. This turns “we might need it someday” into an explicit trade-off that can be reviewed when the purpose changes. A contract also gives an operator something concrete to remove when a connector is retired.',
        ],
        bullets: [
          'Start from a relationship decision and its minimum useful context.',
          'Assign an owner and purpose to every imported or derived signal.',
          'Set freshness and retention expectations before the first sync.',
          'Reject fields whose purpose, source, or access boundary cannot be named.',
        ],
      },
      {
        heading: 'Make provenance visible at the point of use',
        paragraphs: [
          'A unified profile becomes dangerous when it looks more certain than its inputs. A phone number supplied by a customer, an address imported from a billing system, and a model-generated “likely decision maker” label are different kinds of statements. They should not collapse into one undifferentiated contact card. Show the source, observed time, actor or process that produced the value, and whether the value is a fact, observation, or inference.',
          'The W3C PROV model is a useful vocabulary for this work because it describes the entities, activities, and agents involved in producing or changing data. In product terms, provenance is not a footnote: it is what lets a person decide whether to trust a field, challenge it, or ask the system to stop using it. When two systems disagree, preserve both assertions, explain the conflict, and route a correction instead of silently overwriting history.',
        ],
        bullets: [
          'Render source, observed time, and assertion type beside sensitive values.',
          'Keep customer-provided facts separate from enrichment and model inference.',
          'Expose disagreements as review items with an attributable resolution.',
          'Preserve prior assertions so corrections do not erase relationship history.',
        ],
      },
      {
        heading: 'Ship privacy-friendly defaults',
        paragraphs: [
          'Privacy is easiest to defend when the default path already limits exposure. The European Data Protection Board describes data protection by design and by default as an ongoing discipline: build safeguards into the system from the start, and make the default settings protective. For a CRM, that means narrow role-based views, explicit purpose tags, short-lived agent context, and connectors that synchronize only approved fields rather than copying an entire source system.',
          'The Information Commissioner’s Office describes data minimisation as collecting and holding only what is needed, with processes that demonstrate why it is needed. Make that demonstrable in the product: let an operator inspect a field’s contract, revoke a connector, export the relationship record, and delete or redact data according to its retention rule. Agents should receive a scoped projection of the Customer 360—not an unfiltered dump—and every external action should carry the policy result and a receipt.',
          'A trustworthy Customer 360 is therefore a living set of bounded contracts, not a permanent warehouse of everything observed. Review the contracts when a workflow, integration, or agent changes. If a signal no longer earns its place in a real decision, remove it. Less data, clearly explained, gives people more confidence to use the context that remains.',
        ],
        bullets: [
          'Default every human and agent view to least-privilege context.',
          'Synchronize approved fields, not entire connected systems by habit.',
          'Make inspect, revoke, export, redact, and delete first-class operations.',
          'Re-review each contract when a purpose, connector, or agent capability changes.',
        ],
      },
    ],
    sources: [
      { label: 'Principle (c): Data minimisation', publisher: 'Information Commissioner\'s Office', url: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/?q=privacy' },
      { label: 'Privacy by design and by default', publisher: 'European Data Protection Board', url: 'https://www.edpb.europa.eu/topics/ai-and-technology/privacy-by-design-and-by-default_en' },
      { label: 'PROV Model Primer', publisher: 'W3C', url: 'https://www.w3.org/TR/prov-primer/' },
    ],
  },
  {
    slug: 'agentic-crm-tool-changes-trust-gate',
    kind: 'Research note',
    category: 'Agentic CRM',
    title: 'Agentic CRM: make every tool change pass a trust gate',
    description: 'A release discipline for CRM agents that treats tools, skills, memory, and context as part of the attack surface instead of trusted plumbing.',
    publishedAt: '2026-09-03',
    readMinutes: 7,
    takeaways: [
      'Inventory each agent tool by the data it can read, the side effects it can cause, the identity it uses, and the tenant boundary it must respect.',
      'Test tool descriptions, skills, memory, and retrieved context as untrusted inputs that can redirect a plan or widen a request.',
      'Make versioned policy evidence, staged evaluation, human approval, and rollback part of the release gate for every new capability.',
    ],
    sections: [
      {
        heading: 'Inventory the blast radius',
        paragraphs: [
          'A CRM agent rarely becomes risky because of one dramatic model failure. Risk accumulates as a harmless-looking tool gains a broader query, a new connector, or permission to write outside the workspace. Before enabling a capability, describe the operation in the same concrete terms you would use for a database migration: which records it can read, which fields it can change, which external systems it can call, which identity and credentials it presents, and what happens when the dependency is unavailable.',
          'Use that inventory to draw a small blast-radius map. Connect the agent identity to its workspace, tools, data classes, external effects, and accountable owner. MITRE ATLAS offers a threat-informed vocabulary for reasoning about how an adversary could reach or manipulate an AI-enabled system; the useful adaptation for CRM is to map each tool to the consequence a relationship could experience, not merely to a model category.',
        ],
        bullets: [
          'Record read scope, write scope, tenant fence, identity, and external side effects.',
          'Name the owner who can revoke the capability and the condition that triggers revocation.',
          'Map dependencies and failure modes before the tool reaches production data.',
          'Describe the worst plausible relationship harm, not just the happy-path outcome.',
        ],
      },
      {
        heading: 'Test the instructions around the tool',
        paragraphs: [
          'The tool implementation is only one part of the agent’s input. A description, skill package, memory entry, retrieved document, or connector response can also influence what the agent believes it is allowed to do. OWASP’s Top 10 for Agentic Applications frames these instruction and integration boundaries as distinct risks, including the possibility that untrusted content redirects planning or causes an agent to overreach. Treat every one of those inputs as data to validate, not as authority to obey.',
          'Build deterministic fixtures that attempt the failure modes you care about: a tool description that quietly changes a write scope, a memory note that asks the agent to skip approval, a document that embeds an instruction to disclose another tenant’s data, and a connector response with an unexpected schema. The expected result may be refusal or escalation. Capture the policy decision and the tool version in the receipt so a reviewer can reproduce why the action stopped.',
        ],
        bullets: [
          'Fuzz descriptions, skills, memory, and retrieved content for scope-changing instructions.',
          'Reject connector responses that violate the declared schema or tenant boundary.',
          'Test refusal, escalation, and redaction paths alongside successful actions.',
          'Include tool and policy versions in every evaluation result and receipt.',
        ],
      },
      {
        heading: 'Make release approval a product surface',
        paragraphs: [
          'A new tool should move through a visible trust gate, not appear as a checkbox in an admin panel. Start with static contract checks, run the deterministic safety and tenant-isolation fixtures, then rehearse the capability in shadow mode or a synthetic workspace. Require a named human to approve the promotion, define the rollback action, and set an emergency stop that blocks new proposals if the signal turns bad. The same gate should apply when a tool changes its schema, dependency, prompt-facing description, or credential scope.',
          'OWASP’s Agentic Skills guidance highlights that the dependency and skill layer can expose sensitive data or execute unintended operations. Keep that layer replaceable: pin versions, review changes, limit network and file access, and make the operator’s decision auditable. A release receipt should say what changed, which fixtures ran, who approved it, what budget and workspace limits apply, and how to undo it. This is slower than silently adding another integration, but it gives people a trustworthy way to expand agent capability without surrendering the CRM’s memory.',
        ],
        bullets: [
          'Promote capabilities through static checks, deterministic tests, rehearsal, and explicit approval.',
          'Version tool schemas, descriptions, dependencies, credentials, policies, and evaluation fixtures.',
          'Keep rollback and emergency stop reachable without asking the agent for permission.',
          'Publish a release receipt that makes the change and its remaining risk legible.',
        ],
      },
    ],
    sources: [
      { label: 'OWASP Top 10 for Agentic Applications for 2026', publisher: 'OWASP GenAI Security Project', url: 'https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/' },
      { label: 'MITRE ATLAS', publisher: 'MITRE', url: 'https://atlas.mitre.org/' },
      { label: 'OWASP Agentic Skills Top 10', publisher: 'OWASP Foundation', url: 'https://owasp.org/www-project-agentic-skills-top-10/' },
    ],
  },
  {
    slug: 'crm-agents-need-context-leases',
    kind: 'Research note',
    category: 'CRM for Agents',
    title: 'CRM agents need context leases, not permanent memory',
    description: 'A practical contract for giving an agent the minimum relationship context it needs, for one purpose and a limited time, with provenance and revocation built in.',
    publishedAt: '2026-09-03',
    readMinutes: 7,
    takeaways: [
      'Issue agent context as a purpose-bound lease that names the workspace, records, fields, allowed actions, and expiry instead of copying a permanent memory bundle.',
      'Assemble each context view from attributable facts, recent events, and clearly marked inferences so an agent can explain what informed its proposal.',
      'Re-evaluate the lease before every side effect, revoke it when the task or relationship changes, and retain only a compact receipt of what the agent actually used.',
    ],
    sections: [
      {
        heading: 'Turn context into a contract',
        paragraphs: [
          'A useful CRM agent needs more than a contact name, but it does not need an unrestricted copy of the customer record forever. Give it a context lease: a short-lived, machine-readable contract that says why the agent is working, which workspace and relationships are in scope, which fields it may read, which actions it may propose, and when the grant expires. The phrase context lease is a product pattern proposed here, not a term from the standards below.',
          'OAuth Rich Authorization Requests offers a helpful analogy. RFC 9396 replaces coarse permission strings with structured authorization details that can name actions, locations, and other constraints. A CRM can apply the same discipline internally even when OAuth is not involved: represent “prepare a renewal brief from this account and its last three activities” as data, rather than quietly treating “can use CRM” as permission to inspect every record.',
          'Keep the lease separate from the prompt. The control plane should mint it after policy evaluation, the data plane should enforce it when building the view, and the agent plane should receive only the resulting projection. A prompt may request more context, but it cannot widen its own lease. That boundary makes local-first and self-hosted deployments safer because the operator can inspect the contract without trusting a model provider’s hidden state.',
        ],
        bullets: [
          'Name the purpose, workspace, actor, record set, readable fields, allowed actions, and expiry.',
          'Treat the lease as policy data enforced outside the model conversation.',
          'Fail closed when a field, action, or relationship is not explicitly covered.',
          'Let an agent request an extension, but require the control plane to decide it.',
        ],
      },
      {
        heading: 'Build a view the agent can account for',
        paragraphs: [
          'The leased view should not flatten every signal into one authoritative biography. Assemble it from small assertions: a customer-provided fact, an imported event, a human note, or a model inference. Carry the source, observation time, confidence or assertion type, and current status beside each item. When two sources disagree, preserve the disagreement instead of letting the newest connector silently overwrite the relationship history.',
          'The W3C PROV model separates entities, activities, and agents so a system can describe what produced or influenced a result. A CRM does not need to expose the entire PROV vocabulary in its interface, but the distinction is valuable: show which record was used, which import or edit produced it, and which human, service, or agent was responsible. That provenance lets a reviewer decide whether an apparently useful recommendation rests on a signed contract, a stale email, or an unverified guess.',
          'Compose the smallest useful view at execution time rather than maintaining a second, agent-only customer database. The source CRM remains the system of record; the leased projection is disposable. This reduces stale duplication and gives a self-hoster a concrete answer to “what did the agent see?” without logging an unbounded prompt transcript full of relationship data.',
        ],
        bullets: [
          'Keep facts, events, notes, and inferences distinguishable in the context schema.',
          'Attach source, observed time, and responsible actor to every consequential assertion.',
          'Preserve conflicts as reviewable state instead of resolving them invisibly.',
          'Generate disposable projections from the source CRM instead of permanent shadow profiles.',
        ],
      },
      {
        heading: 'Expire access, preserve the receipt',
        paragraphs: [
          'A time limit is useful only if the system checks it. Before an agent sends a message, changes a forecast, creates an invoice, or calls a connector, evaluate the current lease again. Confirm that it is unexpired, that the relationship still belongs to the workspace, that the proposed action remains allowed, and that any required human approval still matches the exact payload. A cached plan is not durable authority.',
          'NIST SP 800-53 treats least privilege, access control, and auditability as system controls rather than suggestions to a user. The CRM adaptation is straightforward: narrow the agent’s available context and actions to what the task requires, then record the enforcement result. Revocation should stop new reads and side effects immediately when a human pauses the agent, a connector is removed, the record changes tenant, or the stated purpose ends.',
          'Do not keep the whole leased projection merely because the run finished. Preserve a compact receipt containing the lease identifier and version, policy decision, hashes or stable identifiers for material inputs, approved action, outcome, timestamps, and accountable actors. Keep only the relationship data needed for audit and recovery under the operator’s retention rules. The memory that survives should explain the work—not become a permanent copy of everyone the CRM has ever known.',
        ],
        bullets: [
          'Re-check lease, tenant, action, payload, approval, and budget immediately before execution.',
          'Revoke on emergency stop, connector removal, tenant change, or completion of purpose.',
          'Store a bounded receipt with stable evidence references rather than the full context payload.',
          'Let operator-owned retention rules delete expired projections without erasing the audit trail.',
        ],
      },
    ],
    sources: [
      { label: 'OAuth 2.0 Rich Authorization Requests (RFC 9396)', publisher: 'IETF RFC Editor', url: 'https://www.rfc-editor.org/rfc/rfc9396.html' },
      { label: 'Security and Privacy Controls for Information Systems and Organizations (SP 800-53 Rev. 5)', publisher: 'NIST', url: 'https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final' },
      { label: 'PROV Model Primer', publisher: 'W3C', url: 'https://www.w3.org/TR/prov-primer/' },
    ],
  },
  {
    slug: 'build-a-fictional-crm-universe',
    kind: 'Field guide',
    category: 'Open CRM',
    title: 'Build a fictional CRM universe before inviting contributors',
    description: 'A practical guide to giving an open-source CRM realistic, repeatable test data without copying customer identities, conversations, files, or credentials.',
    publishedAt: '2026-09-04',
    readMinutes: 7,
    takeaways: [
      'Create CRM fixtures from invented relationship stories rather than masking or sampling a production database.',
      'Model the awkward edges—tenant collisions, duplicate identities, consent changes, failed imports, and denied agent actions—not just a polished demo account.',
      'Make the fictional universe deterministic, conspicuously synthetic, and rebuildable with one local command so every contributor can reproduce a bug safely.',
    ],
    sections: [
      {
        heading: 'Invent the relationships; do not launder production data',
        paragraphs: [
          'An open CRM needs data before a contributor can understand the product. Empty tables hide the shape of the work, while a copy of a real workspace can expose names, addresses, notes, attachments, message fragments, access tokens, and relationship history. Replacing a few obvious fields does not make that copy safe. The remaining dates, rare combinations, free text, and graph structure may still point back to a person or organization.',
          'NIST’s de-identification guidance warns that de-identified information can sometimes be re-identified. For a public development fixture, take the stronger path: start with invented actors and events that have no one-to-one source records. Give every visible value an unmistakable synthetic marker, keep email domains reserved for examples, and exclude production files and credentials entirely. The goal is not to imitate a customer; it is to express the behaviors the product must support.',
          'Write a short story for the fixture before writing rows. A sole consultant meets a buyer, records a consent preference, creates an opportunity, promises a follow-up, attaches a fictional brief, and later corrects an imported phone number. That narrative gives contributors a coherent relationship to follow across screens and APIs without putting a real relationship into the repository.',
        ],
        bullets: [
          'Generate new actors and events instead of transforming a production export.',
          'Use conspicuous labels such as SYNTHETIC and reserved example domains.',
          'Keep secrets, message archives, customer files, and production identifiers out of fixtures.',
          'Document the invented story so a contributor knows what each record is meant to prove.',
        ],
      },
      {
        heading: 'Model failures and boundaries, not a perfect demo',
        paragraphs: [
          'A beautiful sample pipeline proves very little. The useful fictional universe contains the edges where CRM architecture earns trust: two tenants with the same external contact identifier, two people sharing an email alias, a stale connector observation, a corrected fact that must not erase its provenance, an overdue promise, an expired consent basis, and an attachment whose checksum does not match. Each scenario should name the invariant it exercises.',
          'Agentic scenarios belong in the same model. Include a proposal that is allowed, one that exceeds a budget, one that requests an ungranted tool, one whose context lease has expired, and one stopped before an external side effect. Keep humans, organizations, services, and agents distinguishable so the fixture tests the shared relationship graph rather than creating a separate toy product for automation.',
          'Seeded generators can help create repeatable values, but a seed alone is not the contract. Faker’s documentation notes that generated results can change across library versions and that relative dates require a fixed reference time. Pin the generator version, fix the seed and clock, and assert the important identifiers and relationships explicitly. A contributor should be able to rerun the same failure tomorrow and after an unrelated change.',
        ],
        bullets: [
          'Name a product or security invariant for every fixture scenario.',
          'Include tenant, identity, provenance, lifecycle, connector, and agent-policy edge cases.',
          'Pin generator versions and set both a stable seed and a fixed reference time.',
          'Assert durable relationships directly instead of snapshotting every incidental generated value.',
        ],
      },
      {
        heading: 'Make reset and proof part of the contributor contract',
        paragraphs: [
          'Package the universe behind one documented seed-and-reset command. It should create an empty local store, apply the current migrations, load only synthetic records, and finish with counts and invariant checks. SQLite’s in-memory database mode is useful for fast isolated tests; a file-backed local database is better when a contributor needs to inspect the result across application restarts. Both should be disposable and should default to disabled outbound integrations.',
          'Test the fixture as product code. Verify that every row belongs to the intended workspace, cross-tenant reads fail, append-only records cannot be rewritten, referenced files exist, exports preserve the relationship graph, and agent actions still pass policy evaluation. Add a canary string that identifies the dataset as synthetic and fail the seed if a destination looks like production. A reset should never require cloud credentials.',
          'The payoff is larger than easier onboarding. A stable fictional universe gives maintainers a common language for bug reports, lets security researchers reproduce boundary failures without requesting customer data, and turns screenshots and documentation into reviewable artifacts. Open source becomes more open when the smallest safe example is also a faithful version of the real architecture.',
        ],
        bullets: [
          'Create, migrate, seed, verify, and reset through documented local commands.',
          'Disable outbound connectors and side effects in every fixture environment.',
          'Fail closed if the destination resembles production or the synthetic canary is missing.',
          'Run tenant, audit, export, file, and agent-policy checks against the seeded graph in CI.',
        ],
      },
    ],
    sources: [
      { label: 'De-Identification of Personal Information (NIST IR 8053)', publisher: 'NIST', url: 'https://csrc.nist.gov/pubs/ir/8053/final' },
      { label: 'Faker usage and reproducible results', publisher: 'Faker', url: 'https://fakerjs.dev/guide/usage.html' },
      { label: 'In-Memory Databases', publisher: 'SQLite', url: 'https://www.sqlite.org/inmemorydb.html' },
    ],
  },
  {
    slug: 'solopreneur-crm-needs-three-clocks',
    kind: 'Field guide',
    category: 'Solopreneur CRM',
    title: 'A one-person CRM needs three clocks, not one pipeline',
    description: 'A practical way to separate relationship timing, delivery promises, and payment timing so a solopreneur can see what needs attention without turning CRM into accounting software.',
    publishedAt: '2026-09-04',
    readMinutes: 7,
    takeaways: [
      'Track the next meaningful relationship moment, the next delivery commitment, and the next money event as separate clocks with separate owners and states.',
      'Link conversations, promises, invoices, and evidence through stable relationship records without pretending that one pipeline stage describes all of them.',
      'Review mismatched clocks each week: work due before a decision, invoices detached from delivery, and follow-ups scheduled before new evidence exists.',
    ],
    sections: [
      {
        heading: 'The relationship clock asks when contact will be useful',
        paragraphs: [
          'A conventional pipeline makes every relationship look as if it should move toward a sale on the same timetable. A one-person business has a wider mix: an active buyer, a former client worth checking on next quarter, a referral partner waiting for an introduction, and a prospect who asked not to hear back until a budget meeting. Their next dates mean different things. Collapsing them into “follow up” creates a noisy queue and teaches the owner to ignore reminders.',
          'Give the relationship clock three small fields: the last meaningful interaction, the next review date, and the reason that date exists. The reason matters more than a generic task label. “Review after the September board meeting” is a cue tied to new evidence; “touch base in 14 days” is usually just pressure transferred to the future. Let a person move the review date without rewriting the relationship history.',
          'This clock should govern attention, not permission. A review date does not override consent, channel preferences, or a do-not-contact state. If an agent helps prepare the review, it may summarize the approved context and propose a next step, but it should not convert the date into authority to send a message.',
        ],
        bullets: [
          'Store last meaningful interaction, next review date, and review reason separately.',
          'Prefer an evidence-based cue over a recurring “just checking in” reminder.',
          'Keep consent and channel rules independent from scheduling.',
          'Let agents prepare context while a human or explicit policy controls external contact.',
        ],
      },
      {
        heading: 'The commitment clock protects the work already promised',
        paragraphs: [
          'The commitment clock begins when somebody promises an outcome, not when an opportunity changes stage. Record who made the promise, to whom, the exact deliverable, its due date, its current state, and the evidence that will count as complete. A proposal due Friday and a project deliverable due Friday compete for the same pair of hands even if they live in different pipeline columns.',
          'Connect each commitment to the relationship and, when relevant, to an opportunity or service record. Do not bury it inside a note. A small capacity view can then show promised work by week, overdue decisions blocking delivery, and commitments that lack a clear owner. This is more honest than multiplying deal value by probability and calling the result a plan.',
          'Close the loop explicitly. Mark whether the promise was delivered, renegotiated, declined, or canceled, and retain the reason and timestamp. That history helps a solopreneur learn which kinds of work expand beyond the estimate and which customers need earlier checkpoints. An agent can flag collisions or draft a renegotiation, but changing a customer-facing promise should remain an approved action with a receipt.',
        ],
        bullets: [
          'Represent promised outcomes as first-class records rather than prose inside notes.',
          'Capture accountable actor, recipient, deliverable, due date, state, and completion evidence.',
          'View capacity across proposals, delivery, service, and relationship obligations.',
          'Require approval before an agent changes or communicates a customer-facing commitment.',
        ],
      },
      {
        heading: 'The cash clock connects the relationship to the books without replacing them',
        paragraphs: [
          'The cash clock follows a different sequence: price discussed, invoice expected, invoice issued, payment due, payment received, or exception raised. Store only the operational status the relationship needs, plus a reference to the source document or accounting record. The CRM can remind the owner that delivered work has not been invoiced; it should not invent a paid state because a deal was marked won.',
          'Official small-business guidance makes the distinction concrete. The IRS describes records as useful for monitoring progress, preparing financial statements, and identifying the source of receipts, while GOV.UK guidance distinguishes money owed but not yet received from commitments to spend that have not yet been paid. Those are not interchangeable events. Retain the supporting invoice or authoritative link according to the rules that apply to the business, and treat the CRM view as an operational projection rather than the sole accounting ledger.',
          'The U.S. Small Business Administration emphasizes looking at money in and money out and using cash-flow projections to maintain a sustainable balance. A CRM can make that practical at relationship level without becoming a financial system: show expected amount, due date, current status, source, and last synchronization time; keep banking credentials outside the record; and reconcile exceptions against the owner-controlled accounting source.',
          'Once a week, compare all three clocks. Look for delivery promised before the buyer decides, completed work with no invoice event, payment overdue while an automatic outreach is queued, or a relationship review scheduled before anything can change. The value is not a more elaborate dashboard. It is one calm list of contradictions the owner can resolve before they become broken promises or a cash surprise.',
        ],
        bullets: [
          'Keep expected, issued, due, paid, and disputed states distinct.',
          'Reference authoritative documents and systems instead of duplicating a shadow ledger.',
          'Store source and synchronization time, never shared banking or provider credentials.',
          'Review cross-clock contradictions weekly and turn each one into a clear decision.',
        ],
      },
    ],
    sources: [
      { label: 'Publication 583: Starting a Business and Keeping Records', publisher: 'Internal Revenue Service', url: 'https://www.irs.gov/publications/p583' },
      { label: 'Business records if you are self-employed: what records to keep', publisher: 'GOV.UK', url: 'https://www.gov.uk/self-employed-records/what-records-to-keep' },
      { label: 'Manage your business: manage your finances', publisher: 'U.S. Small Business Administration', url: 'https://www.sba.gov/counseling/manage-your-business/' },
    ],
  },
  {
    slug: 'customer-360-needs-reversible-identity-links',
    kind: 'Research note',
    category: 'Customer 360',
    title: 'Customer 360 needs reversible identity links, not a golden record',
    description: 'A practical design for joining customer records with evidence, review thresholds, and a safe way to undo the merge when two people were mistaken for one.',
    publishedAt: '2026-09-04',
    readMinutes: 7,
    takeaways: [
      'Model every proposed match as an evidence-backed identity link; do not erase source records to manufacture one unquestionable profile.',
      'Route uncertain links to review, measure both false merges and missed matches, and test thresholds whenever sources or populations change.',
      'Make splitting a mistaken identity a first-class workflow that repairs timelines, consent, segments, agent context, and downstream copies.',
    ],
    sections: [
      {
        heading: 'A merge is a claim about identity',
        paragraphs: [
          'Two records with the same name are not necessarily the same person. Neither are two records that share a household phone number, a role-based inbox, a recycled address, or a device. Customer 360 becomes brittle when a matching rule converts those clues into one permanent “golden record” and discards the disagreement that produced it.',
          'Keep each source record intact and connect it to a stable actor through a versioned identity link. The link should name the source identifiers, matching method, evidence considered, confidence or decision class, time, and the human or process responsible. A deterministic provider identifier can support a different decision than a fuzzy name-and-address match. Both should remain inspectable.',
          'NIST’s current digital identity guidance separates resolution, validation, and verification and calls for the minimum attributes needed for the context. A CRM match is not formal identity proofing, but the separation is useful: finding a likely record, checking its evidence, and proving a person controls an identity are different claims. Do not let a convenient match silently inherit more assurance than its inputs provide.',
        ],
        bullets: [
          'Preserve source records and their original identifiers after linking.',
          'Store method, evidence, decision class, timestamp, and responsible actor on the link.',
          'Distinguish a likely CRM match from verified account ownership or legal identity.',
          'Collect no extra attribute merely because it could make matching easier someday.',
        ],
      },
      {
        heading: 'Give uncertain matches somewhere honest to go',
        paragraphs: [
          'An identity resolver needs at least three outcomes: link, do not link, and review. The review lane prevents a scoring threshold from hiding ambiguity behind a clean interface. Show the two records side by side, the agreeing and conflicting attributes, source freshness, and the consequences of joining them. A reviewer should be able to defer the decision without losing either relationship.',
          'The U.S. Census Bureau’s record-linkage quality standard requires explicit criteria, scoring parameters and cutoffs, verification, testing, monitoring, corrective action, and documentation. FREE CRM does not perform census statistics, but those controls translate well to relationship data. Test the resolver on representative fictional fixtures, measure false links as well as missed links, and re-evaluate it when a connector changes formatting or begins sending a new population.',
          'Tune for the cost of the mistake, not for an impressive merge rate. Failing to combine two duplicate newsletter records may be annoying. Combining two different customers can expose private correspondence, misapply a service history, or let an agent act on the wrong person. High-impact workflows deserve a higher evidence bar and human review.',
        ],
        bullets: [
          'Define auto-link, review, and reject thresholds for each matching context.',
          'Display conflicts and downstream impact before a reviewer approves a link.',
          'Track false-link, missed-link, reversal, and reviewer-disagreement rates.',
          'Re-test after connector, schema, normalization, or population changes.',
        ],
      },
      {
        heading: 'A split must repair the relationship graph',
        paragraphs: [
          'Undoing a bad merge is not just removing an edge. The system must decide which person owns each conversation, address, consent record, opportunity, invoice reference, service case, file, derived score, and agent receipt. Build a guided split that previews those assignments, leaves disputed items unresolved, records the decision, and sends idempotent repair jobs to connected systems.',
          'Channel choice must survive identity work. The UK Information Commissioner’s Office warns that people may use different email addresses to manage different relationships and that appending another address for direct marketing can work against that choice. Linking evidence therefore must not combine consent or contact permissions by default. Keep purpose, channel, and provenance attached to the assertion that supplied them.',
          'After a split, invalidate summaries, segments, embeddings, cached Customer 360 projections, and pending agent context that depended on the old link. Pause high-impact actions until the repair completes, then issue an audit receipt listing what changed, what failed, and what still requires review. A trustworthy Customer 360 is not one that never makes a matching mistake. It is one that can explain the match, reverse it safely, and prove the wrong identity stopped propagating.',
        ],
        bullets: [
          'Preview ownership of every related object before completing a split.',
          'Never transfer consent or channel permission merely because records were linked.',
          'Invalidate derived and agent-facing context that depended on the mistaken identity.',
          'Verify downstream repairs and retain a security-safe, append-only receipt.',
        ],
      },
    ],
    sources: [
      { label: 'Identity Proofing Overview, Digital Identity Guidelines SP 800-63A-4', publisher: 'NIST', url: 'https://pages.nist.gov/800-63-4/sp800-63a/proofing/' },
      { label: 'Statistical Quality Standard C4: Linking Data Records', publisher: 'U.S. Census Bureau', url: 'https://www.census.gov/about/policies/quality/standards/standardc4.html' },
      { label: 'Collect information and generate leads', publisher: "Information Commissioner's Office", url: 'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-guidance/collect-information-and-generate-leads/' },
    ],
  },
  {
    slug: 'agentic-crm-needs-an-interruption-budget',
    kind: 'Field guide',
    category: 'Agentic CRM',
    title: 'Agentic CRM needs an interruption budget, not an infinite inbox',
    description: 'A practical design for routing agent questions, approvals, and warnings without turning safe human oversight into a second full-time job.',
    publishedAt: '2026-09-04',
    readMinutes: 7,
    takeaways: [
      'Budget human attention separately from tokens and tool calls; an agent that saves compute while creating approval fatigue is not efficient.',
      'Route interruptions by urgency, reversibility, relationship impact, and evidence freshness, then batch everything that can safely wait.',
      'Measure dismissals, corrections, response time, and unresolved risk so the system improves its routing without silently expanding autonomy.',
    ],
    sections: [
      {
        heading: 'Oversight can become the bottleneck',
        paragraphs: [
          'A cautious CRM agent can still be a bad colleague. If it asks for approval before every harmless note, reports the same connector warning in five places, and marks every uncertainty urgent, the operator becomes a queue processor. Eventually the person clicks through without reading or disables the agent entirely. More prompts for human review do not automatically produce better oversight.',
          'Treat an interruption as a scarce operational event. Record what decision is needed, why it matters now, which relationship may be affected, the latest safe response time, the evidence behind the proposal, and what happens if nobody responds. That packet should be understandable without opening a long chat transcript. If no decision is actually required, place the information in a digest or activity stream instead of manufacturing an approval.',
          'A token budget constrains machine cost. An action budget constrains side effects. An interruption budget protects human attention. Keep all three visible because optimizing one can damage another: a cheap agent may ask repetitive questions, while a low-action agent may fill the owner’s inbox with proposals it was never likely to execute.',
        ],
        bullets: [
          'Create an interruption only when a named decision or response is required.',
          'Include deadline, consequence of silence, evidence, and affected relationship.',
          'Send informational events to a digest rather than an approval queue.',
          'Track token, action, and human-attention budgets independently.',
        ],
      },
      {
        heading: 'Route by consequence, then batch by time',
        paragraphs: [
          'Score the interruption using operational facts rather than the agent’s prose. Is the proposed action reversible? Is a customer waiting? Could delay break a promise, expose data, spend money, or cross a consent boundary? How fresh is the underlying context? A high-impact, time-sensitive decision may page the accountable owner. A reversible edit due tomorrow can wait for the next review block. Several questions about one relationship should arrive as one case.',
          'Give every workspace quiet hours, a daily review window, per-channel limits, and an accountable fallback. When the ordinary budget is exhausted, the control plane should defer or consolidate low-impact items. It should not let the model relabel them as emergencies. Reserve a narrow exception path for explicit incident classes such as suspected cross-tenant exposure or an action already underway that must be stopped.',
          'The UK government’s current Data and AI Ethics Framework says human oversight should name responsible roles and weigh risks and impacts where reviewing every automated output is impractical. That is a useful product constraint: match the review mechanism to the consequence. Human involvement should be deliberate and effective, not a decorative confirmation step applied uniformly to everything.',
        ],
        bullets: [
          'Page now for high-impact decisions whose safe response window is short.',
          'Queue reversible work for a scheduled review block and consolidate by relationship.',
          'Enforce quiet hours and caps in policy, outside the model’s control.',
          'Define the emergency classes and fallback owner before enabling the workflow.',
        ],
      },
      {
        heading: 'Measure whether the interruption earned attention',
        paragraphs: [
          'Each interruption should end with a small receipt: approved, changed, deferred, dismissed, expired, or escalated. Capture the time to decision, whether the evidence was sufficient, and which part needed correction. A high approval rate is not automatically success; it can mean the proposals are good, or that the person has learned to click through. Pair outcomes with sampled review, correction rate, repeat-question rate, and signs that urgent items were missed.',
          'Microsoft Research’s Guidelines for Human-AI Interaction emphasize efficient dismissal and correction, scoping behavior when uncertain, explaining system actions, granular feedback, and global controls. Applied to CRM, the approval surface should make “not useful,” “wrong person,” “wrong time,” and “needs more evidence” quick to express. Those signals should improve routing and evaluation fixtures, not quietly become permission for broader autonomous action.',
          'NIST’s AI Risk Management Framework calls for defined human-AI roles, documented oversight, context-relevant measurement, production monitoring, and tracking impacts over time. Review the interruption policy as a living system: compare teams and workflows, investigate sudden changes, and reduce privileges when fatigue hides meaningful review. The goal is not zero interruptions. It is a small, trusted queue in which every item has earned the human judgment it requests.',
        ],
        bullets: [
          'Record outcome, response time, correction, evidence gap, and repeat-question status.',
          'Sample approvals to distinguish good proposals from habitual click-through.',
          'Turn recurring corrections into fixtures, policy changes, or narrower capability.',
          'Keep global pause and emergency stop available outside the agent conversation.',
        ],
      },
    ],
    sources: [
      { label: 'Data and AI Ethics Framework: maintain human oversight', publisher: 'GOV.UK', url: 'https://www.gov.uk/government/publications/data-ethics-framework/data-and-ai-ethics-framework' },
      { label: 'Guidelines for Human-AI Interaction', publisher: 'Microsoft Research', url: 'https://www.microsoft.com/en-us/research/project/guidelines-for-human-ai-interaction/' },
      { label: 'AI Risk Management Framework Core', publisher: 'NIST', url: 'https://airc.nist.gov/airmf-resources/airmf/5-sec-core/' },
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
