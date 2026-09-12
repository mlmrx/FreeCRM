export type GlossaryTerm = {
  id: string;
  term: string;
  meaning: string;
  inFreeCrm: string;
  documentation: { path: string; label: string };
};

const operations = { path: 'docs/OPERATIONS_REFERENCE.md#implemented-capabilities', label: 'Implemented capabilities' };
const architecture = { path: 'docs/MULTI_EDITION_ARCHITECTURE.md#plane-boundaries', label: 'Platform architecture' };
const agentSafety = { path: 'docs/AGENT_SAFETY_EVALUATIONS.md', label: 'Agent controls and safety checks' };
const adaptive = { path: 'docs/ADAPTIVE-CRM.md', label: 'Adaptive CRM guide' };
const brain = { path: 'docs/SECOND-BRAIN.md', label: 'Second brain guide' };

// One source for glossary definitions; essays and FAQs remain in editorial-content.ts.
export const glossaryTerms: readonly GlossaryTerm[] = [
  {
    id: 'activity', term: 'Activity',
    meaning: 'A recorded interaction or event, such as a call, meeting, or follow-up.',
    inFreeCrm: 'Activities live alongside tasks and CRM records. Calendar export is available; live calendar synchronization is not included.',
    documentation: operations,
  },
  {
    id: 'adaptive-crm', term: 'Adaptive CRM',
    meaning: 'An approach that adjusts assistance as a person’s work and preferences change.',
    inFreeCrm: 'Today builds a briefing from workspace evidence. Learning and automatic adaptation start off and use explicit feedback when enabled; they do not train a shared model.',
    documentation: adaptive,
  },
  {
    id: 'agent', term: 'Agent',
    meaning: 'Software that can pursue a goal by selecting steps and using tools within granted limits.',
    inFreeCrm: 'The agent layer stores identities, proposals, permissions, and execution evidence. Its executable tool is a local simulator, not an external service or autonomous customer outreach.',
    documentation: agentSafety,
  },
  {
    id: 'approval', term: 'Approval',
    meaning: 'A person’s decision to allow a particular proposed action.',
    inFreeCrm: 'An agent proposal can require review before it may run. Approval is not execution: the simulator is run separately and current permissions, budget, and stop controls are checked again.',
    documentation: agentSafety,
  },
  {
    id: 'audit-trail', term: 'Audit trail',
    meaning: 'A history that helps explain who did what and when.',
    inFreeCrm: 'Security-sensitive operations write audit events. Database rules prevent changing or deleting those events through ordinary application operations; this is not a claim of independent security certification.',
    documentation: { path: 'docs/MULTI_EDITION_ARCHITECTURE.md#security-decisions', label: 'Security boundaries' },
  },
  {
    id: 'capability', term: 'Capability',
    meaning: 'A feature or set of actions that a workspace can make available.',
    inFreeCrm: 'Profiles select capability defaults, and owners can override them. Turning off a capability hides its entry points without deleting its records.',
    documentation: { path: 'docs/MULTI_EDITION_ARCHITECTURE.md#profiles-and-capabilities', label: 'Profiles and capabilities' },
  },
  {
    id: 'connector', term: 'Connector',
    meaning: 'An adapter that moves information between systems according to defined rules.',
    inFreeCrm: 'CSV import/export and an authenticated inbound webhook simulator provide reference paths. Provider account synchronization and OAuth connectors are not implemented.',
    documentation: { path: 'docs/MULTI_EDITION_ARCHITECTURE.md#storage-and-deployment', label: 'Current connector boundaries' },
  },
  {
    id: 'control-plane', term: 'Control plane',
    meaning: 'The part of a system that governs configuration, access, and policy.',
    inFreeCrm: 'Workspace profiles, capabilities, role checks, policy, and audit belong here. Customer records belong to the data plane.',
    documentation: architecture,
  },
  {
    id: 'customer-360', term: 'Customer 360',
    meaning: 'A view that brings useful context about a customer or relationship together.',
    inFreeCrm: 'A record view brings together its fields, notes, explicit connected records, and invoice payment receipts where applicable. It does not automatically collect everything about a person.',
    documentation: operations,
  },
  {
    id: 'data-plane', term: 'Data plane',
    meaning: 'The part of a system that stores and handles the information people work with.',
    inFreeCrm: 'CRM records, relationships, activities, and related data are scoped to a workspace in SQLite/D1. PostgreSQL is a roadmap item, not a selectable adapter today.',
    documentation: architecture,
  },
  {
    id: 'emergency-stop', term: 'Emergency stop',
    meaning: 'A control that blocks further execution when something needs immediate attention.',
    inFreeCrm: 'The agent stop control prevents further local simulated execution. Clearing the stop leaves the agent paused; it does not undo earlier completed work.',
    documentation: agentSafety,
  },
  {
    id: 'export', term: 'Export',
    meaning: 'A copy of selected information in a format that can be used outside the application.',
    inFreeCrm: 'CSV, calendar, and JSON exports serve different purposes. The portable JSON snapshot excludes document bytes and some operational evidence, so it is not a full recovery backup and has no restore command.',
    documentation: { path: 'docs/OPERATIONS_REFERENCE.md#backups-and-exports', label: 'Export and backup limits' },
  },
  {
    id: 'grant', term: 'Grant',
    meaning: 'An explicit permission to use a resource or perform a defined action.',
    inFreeCrm: 'An agent’s tool grant defines allowed use and can expire or be revoked. A grant does not bypass policy, approval, budget, or emergency-stop checks.',
    documentation: { path: 'docs/AGENT_SAFETY_EVALUATIONS.md#manage-a-tool-grant', label: 'Tool grant management' },
  },
  {
    id: 'idempotency', term: 'Idempotency',
    meaning: 'Making a retry have the same effect as doing the operation once.',
    inFreeCrm: 'Supported writes use an idempotency key and a stored result to recognize retries. Reusing a key with a different request is rejected; callers must follow each endpoint’s retention and retry rules.',
    documentation: { path: 'SECURITY.md', label: 'Retry and data-integrity boundaries' },
  },
  {
    id: 'invoice', term: 'Invoice',
    meaning: 'A request for payment describing work or goods and the amount due.',
    inFreeCrm: 'Quotes can become invoices. Issue and payment transitions are guarded, and recorded payments have receipts. Recording a payment does not charge a card or move money.',
    documentation: operations,
  },
  {
    id: 'lead', term: 'Lead',
    meaning: 'A potential relationship or opportunity that still needs qualification.',
    inFreeCrm: 'A lead holds contact details, status, source, and tags. Conversion creates explicit links to the resulting CRM records, preserving the connection to the starting lead.',
    documentation: operations,
  },
  {
    id: 'lifecycle', term: 'Lifecycle',
    meaning: 'The broad phase of a relationship, such as prospect, customer, or partner.',
    inFreeCrm: 'Records have a lifecycle field alongside their status. It describes the relationship’s context; it is not the same as an opportunity’s sales stage.',
    documentation: operations,
  },
  {
    id: 'local-first', term: 'Local-first',
    meaning: 'An approach that makes running software and keeping data on your own device a primary option.',
    inFreeCrm: 'Device mode uses local SQLite/D1 and file state with a loopback-only owner runtime. The server must be running; the PWA does not cache private workspace data for offline use.',
    documentation: { path: 'docs/CLOUD_DEPLOYMENT.md#device-and-docker', label: 'Device and Docker operation' },
  },
  {
    id: 'opportunity', term: 'Opportunity',
    meaning: 'A possible piece of business with a value and a stage toward completion.',
    inFreeCrm: 'Opportunity records track stage, amount, and probability and feed pipeline reports. Marking one won is not the same as receiving an invoice payment.',
    documentation: operations,
  },
  {
    id: 'pipeline', term: 'Pipeline',
    meaning: 'The collection of potential deals moving through sales stages.',
    inFreeCrm: 'The opportunity board and reports show stages and values. Open pipeline totals exclude won and lost opportunities; those amounts are possibilities, not cash collected.',
    documentation: operations,
  },
  {
    id: 'profile', term: 'Profile',
    meaning: 'A set of defaults that makes a shared application suit a particular way of working.',
    inFreeCrm: 'Personal, business, and enterprise are reversible workspace profiles in one platform. They do not create separate products or enable shared-team administration, which is not yet implemented.',
    documentation: { path: 'docs/MULTI_EDITION_ARCHITECTURE.md#profiles-and-capabilities', label: 'Workspace profile design' },
  },
  {
    id: 'receipt', term: 'Receipt',
    meaning: 'A record of an operation’s outcome, distinct from the intention or permission to perform it.',
    inFreeCrm: 'Payment receipts record entered payments; agent execution receipts record simulator outcomes. An approval alone is not an execution receipt, and neither proves an external service completed work.',
    documentation: agentSafety,
  },
  {
    id: 'relationship-graph', term: 'Relationship graph',
    meaning: 'A view of entities and the connections between them.',
    inFreeCrm: 'CRM and Second brain use explicit links between records and sources. The graph reflects recorded connections, not an automatically verified account of real-world relationships.',
    documentation: brain,
  },
  {
    id: 'second-brain', term: 'Second brain',
    meaning: 'A personal collection of knowledge that helps you remember, connect, and retrieve useful ideas.',
    inFreeCrm: 'The source library stores notes and pasted clips, supports text and Markdown imports, and links sources to CRM records. Search works without AI; optional local AI requires explicit setup and opt-in.',
    documentation: brain,
  },
  {
    id: 'signal', term: 'Signal',
    meaning: 'A piece of evidence that may be worth attention, rather than a conclusion on its own.',
    inFreeCrm: 'Today surfaces record facts, possible interpretations, and opted-in public announcements with their sources. You can inspect, correct, dismiss, or snooze suggestions; an absent completion record does not prove work was missed.',
    documentation: adaptive,
  },
  {
    id: 'tenant', term: 'Tenant',
    meaning: 'An ownership boundary that keeps one customer’s or workspace’s data separate from another’s.',
    inFreeCrm: 'Server-established identity determines the workspace. Storage queries and related-record keys include that workspace boundary; this does not imply shared-team administration or enterprise certification.',
    documentation: { path: 'docs/MULTI_EDITION_ARCHITECTURE.md#security-decisions', label: 'Workspace isolation rules' },
  },
  {
    id: 'webhook', term: 'Webhook',
    meaning: 'An HTTP message one system sends to another when an event happens.',
    inFreeCrm: 'Authenticated inbound webhook ingestion is available on device and protected Cloudflare runtimes. Native Vercel rejects it until a suitable machine-auth boundary exists; storing an event is not external delivery.',
    documentation: { path: 'docs/OPERATIONS_REFERENCE.md#webhook-integration', label: 'Webhook runtime limits' },
  },
  {
    id: 'weighted-forecast', term: 'Weighted forecast',
    meaning: 'An estimate made by multiplying each open deal’s value by its probability, then adding the results.',
    inFreeCrm: 'Reports use the probabilities stored on open opportunities, rounding each contribution to the currency’s stored cents. This is arithmetic on entered assumptions, not an AI prediction or a revenue guarantee.',
    documentation: operations,
  },
  {
    id: 'workflow', term: 'Workflow',
    meaning: 'A repeatable sequence of steps triggered by a defined event or condition.',
    inFreeCrm: 'Automation rules combine triggers, conditions, and actions with enable/pause controls and run history. Implemented task creation is local CRM work, not a promise of arbitrary external automation.',
    documentation: operations,
  },
  {
    id: 'workspace', term: 'Workspace',
    meaning: 'The shared home for a set of records, settings, and permitted actions.',
    inFreeCrm: 'One authenticated owner’s CRM, Second brain, and Today use the same workspace. A deployment needs its own runtime and storage; the public tour uses separate fictional data.',
    documentation: { path: 'docs/OPERATIONS_REFERENCE.md#architecture', label: 'Workspace and runtime architecture' },
  },
];

export const glossaryGroups = [...new Set(glossaryTerms.map(({ term }) => term[0]))].map((letter) => ({
  letter,
  terms: glossaryTerms.filter(({ term }) => term.startsWith(letter)),
}));
