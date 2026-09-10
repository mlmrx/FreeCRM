/** Public presentation content. Never import a private workspace snapshot here. */
export type DemoChapter = {
  id: string; label: string; eyebrow: string; title: string; accent: string;
  description: string; points: readonly string[]; route: string; launch: string;
  note: string; steps: readonly string[]; boundary: string;
};

export const demoChapters: readonly DemoChapter[] = [
  { id: 'overview', label: 'The idea', eyebrow: 'A RELATIONSHIP OPERATING SYSTEM', title: 'Less scattered.', accent: 'More connected.', description: 'Your customers, your knowledge, and your next good move. Together in one open-source workspace that belongs to you.', points: ['Run the relationship, not just the record.', 'Give your knowledge somewhere to connect.', 'Keep the data. Keep the keys. Keep the choice.'], route: '/tour', launch: 'Explore the safe tour', note: '“Most tools remember a record. FREE CRM connects the work around it—and gives you ownership of the whole system.” Start with the synthetic tour if your audience should not see private records.', steps: ['Open the safe tour.', 'Show the connected workspace.', 'Return here for the next chapter.'], boundary: 'This presentation uses illustrative, synthetic examples. It does not read your CRM or change any data.' },
  { id: 'relationships', label: 'Relationships', eyebrow: 'CUSTOMER 360', title: 'A person.', accent: 'Not a row.', description: 'Put the conversation, the company, the opportunity, and the next commitment around the same relationship.', points: ['Capture leads, contacts, and companies.', 'Connect records, notes, tags, and lifecycle.', 'Open Customer 360 to see the relationship in context.'], route: '/workspace?view=contact', launch: 'Open relationships', note: '“The contact is only the beginning. The real value is what we know, what we promised, and what happens next.” Use a synthetic contact and show its notes and explicit connected records.', steps: ['Open Contacts.', 'Select a synthetic contact.', 'Show notes, lifecycle, and connected records.'], boundary: 'Connections are explicit records you create. Missing activity is not proof that a customer relationship is inactive.' },
  { id: 'business', label: 'The business', eyebrow: 'TWELVE CONNECTED CRM MODULES', title: 'From hello', accent: 'to follow-through.', description: 'Sales, delivery, billing, service, and reporting share one workspace—not another collection of disconnected subscriptions.', points: ['Move from opportunity to quote and invoice.', 'Organize tasks, activities, campaigns, and support.', 'Read pipeline, revenue, aging, and service reports.'], route: '/workspace?view=opportunity', launch: 'Open the pipeline', note: '“The whole relationship lifecycle is here.” Show an opportunity, then quotes or invoices, then Reports. Payment receipts record accounting events; they are not a payment processor.', steps: ['Show an opportunity and its stage.', 'Switch to Quotes or Invoices.', 'Open Reports for the operational picture.'], boundary: 'Invoice payments are recorded, not charged. Campaign records do not send marketing emails. Documents use the configured private storage.' },
  { id: 'brain', label: 'Second brain', eyebrow: 'KNOWLEDGE THAT BELONGS TO YOU', title: 'Capture a thought.', accent: 'Connect a world.', description: 'Turn notes and text into a linked knowledge library. Connect ideas to each other—and to the relationships they explain.', points: ['Capture notes, clips, and Markdown or text imports.', 'Explore explicit knowledge and CRM connections.', 'Search passages or ask optional local AI with citations.'], route: '/brain', launch: 'Open second brain', note: '“This is not a chat box floating above your business. It is your own knowledge, connected to the work.” Capture a synthetic note, link it to a contact, and ask a source-grounded question.', steps: ['Capture or open a synthetic note.', 'Show Connections and a linked CRM record.', 'Ask: “What did I promise, and where is the source?”'], boundary: 'AI requires device-local Ollama and explicit opt-in. Keyword search works without a model. PDF/OCR, automatic ingestion, and inferred graph links are not shipped.' },
  { id: 'adaptive', label: 'A living CRM', eyebrow: 'CONTEXT → FEEDBACK → BETTER DEFAULTS', title: 'A little more useful.', accent: 'A little more you.', description: 'A daily briefing that learns from deliberate feedback, keeps the evidence close, and leaves consequential decisions with you.', points: ['Review contextual signals from current notes and records.', 'Inspect, pin, pause, or forget learned preferences.', 'Discover public releases and prepare reviewed feature proposals.'], route: '/today', launch: 'Open your daily briefing', note: '“Learning should be something you can inspect and undo.” Show why a signal appeared, review a follow-up before creating it, then open Learning & controls. Public release discovery is a separate opt-in.', steps: ['Expand a signal’s source evidence.', 'Review a follow-up; confirm only in a demo workspace.', 'Show Learning & controls and Capability library.'], boundary: 'Learning uses explicit feedback, not passive surveillance. New vendor features become proposals—not automatically installed code. Cloud scheduling needs operator setup.' },
  { id: 'agents', label: 'Guarded agents', eyebrow: 'ASSISTANCE WITH ACCOUNTABILITY', title: 'Give agents a role.', accent: 'Not the keys.', description: 'A separate agent plane makes scope, approval, budget, and accountability visible before an action can run.', points: ['Evaluate policies and time-bounded tool grants.', 'Require human approval for guarded actions.', 'Inspect execution receipts—or hit emergency stop.'], route: '/workspace?view=agents', launch: 'Open the agent plane', note: '“The important demo is not an agent doing everything. It is an agent being unable to do what it was not allowed to do.” Walk through the local simulator’s proposal, approval, receipt, and stop controls.', steps: ['Choose a local simulator agent.', 'Inspect scope, budget, and approval.', 'Show a receipt and the emergency stop.'], boundary: 'Execution is a local simulator. External tool execution is blocked. A general autonomous CRM agent and external agent transport are not released.' },
  { id: 'connections', label: 'Connections', eyebrow: 'OPEN AT THE EDGES', title: 'Bring work in.', accent: 'Take it anywhere.', description: 'Useful interoperability begins with portable data and honest connection status—not logos pretending to be integrations.', points: ['Preview CSV imports before committing records.', 'Export CSV, JSON, and calendar ICS.', 'Use reviewed webhook and connector foundations.'], route: '/workspace?view=integrations', launch: 'Open integrations', note: '“You should be able to leave with your data.” Show an import preview or export, then distinguish the implemented reference connector from external providers that are not connected.', steps: ['Show Integrations and its connection states.', 'Preview a CSV without committing it.', 'Show the available export paths.'], boundary: 'Production email/calendar OAuth adapters are not shipped. Native Vercel machine webhook ingress is disabled; device/Cloudflare ingress uses workspace authentication.' },
  { id: 'ownership', label: 'Ownership', eyebrow: 'LOCAL FIRST. CLOUD BY CHOICE.', title: 'Your workspace.', accent: 'Your infrastructure.', description: 'Start on a device, run with Docker, or deploy to your own cloud account. Credentials and customer data remain under your control.', points: ['Run locally without an AI provider account.', 'Use your own cloud identity, database, and storage.', 'Keep tenant boundaries, audit trails, and exportability.'], route: '/deploy', launch: 'Open deployment guide', note: '“Free software does not mean somebody else secretly owns the infrastructure.” Explain the local path, then user-owned cloud deployment. The owner supplies credentials and activates authentication.', steps: ['Show local and Docker options.', 'Open the cloud deployment instructions.', 'Explain credentials, authentication, and backups.'], boundary: 'The software is MIT-licensed. Hardware, hosting, and optional services can cost money. Cloud deployment and migrations require an operator; no production changes happen from this page.' },
  { id: 'profiles', label: 'Who it serves', eyebrow: 'ONE PLATFORM. NO PRODUCT FORKS.', title: 'Start with one.', accent: 'Grow with intention.', description: 'Personal, business, and enterprise are workspace profiles. Agentic capabilities sit across them, in one shared codebase.', points: ['Personal and solo work is the current operating focus.', 'Business and enterprise share the same foundation.', 'Humans, organizations, services, and agents have a place.'], route: '/platform', launch: 'Explore platform profiles', note: '“These are not five abandoned forks.” Show the shared platform and be explicit: the current release is single-owner; business/team administration and enterprise controls are not complete.', steps: ['Compare the five perspectives.', 'Point out the delivery labels.', 'Open Find my path for guided choices.'], boundary: 'SMB is a foundation, enterprise an architecture preview, and CRM for Agents a research path. Team invitations, SSO/SCIM, native iOS/Android apps, and an APK are not shipped.' },
  { id: 'open', label: 'Open forever', eyebrow: 'CELEBRATE OPEN SOURCE', title: 'Build relationships.', accent: 'Not a walled garden.', description: 'Read the code. Run your own copy. Improve it for everyone. The platform grows through useful contributions, shared research, and real relationship work.', points: ['MIT-licensed source, issues, and contribution guidance.', 'CRM field guides, research, FAQs, and Insights RSS.', 'One community building one shared platform.'], route: 'https://github.com/mlmrx/FreeCRM', launch: 'Open the source', note: '“Ownership is the feature that makes every other feature matter.” Finish on the repository. Invite people to try the safe tour, deploy their own copy, or choose a community issue.', steps: ['Open the repository.', 'Show issues and contribution guidance.', 'Invite the audience to find their own path.'], boundary: 'Open source is available now. Roadmap items are invitations to contribute, not promises of completed functionality.' },
] as const;

export type DemoFeature = { name: string; group: string; description: string; route: string; status: 'Implemented' | 'Optional setup' | 'Guarded preview' | 'Roadmap' };
export const demoFeatures: readonly DemoFeature[] = [
  ...[
    ['Leads', 'lead', 'Capture, qualify, convert, tag, and track lifecycle.'],
    ['Contacts', 'contact', 'Relationship records, notes, archive, and Customer 360.'],
    ['Companies', 'company', 'Organization context and explicit connected records.'],
    ['Opportunities', 'opportunity', 'Stages, amount, probability, and pipeline views.'],
    ['Activities', 'activity', 'Scheduled relationship work and calendar export.'],
    ['Tasks', 'task', 'Ownership, priority, due dates, and completion.'],
    ['Campaigns', 'campaign', 'Campaign planning and records; no outbound email sending.'],
    ['Products', 'product', 'Products and commercial context in your CRM.'],
    ['Quotes', 'quote', 'Create quotes and convert them into invoices.'],
    ['Invoices', 'invoice', 'Guarded issue/payment transitions and recorded payment receipts.'],
    ['Support tickets', 'ticket', 'Service context, status, and resolution history.'],
    ['Documents', 'document', 'Document records and configured private object storage.'],
  ].map(([name, view, description]) => ({ name, group: 'CRM modules', description, route: `/workspace?view=${view}`, status: 'Implemented' as const })),
  { name: 'Customer 360', group: 'Intelligence', description: 'A record, its notes, lifecycle, and explicitly connected work.', route: '/workspace?view=contact', status: 'Implemented' },
  { name: 'Reports & analytics', group: 'Intelligence', description: 'Pipeline, forecast, revenue, source, activity, aging, and support.', route: '/workspace?view=reports', status: 'Implemented' },
  { name: 'Workflow automation', group: 'Intelligence', description: 'Audited trigger/condition/action rules, task creation, and pause.', route: '/workspace?view=workflows', status: 'Implemented' },
  { name: 'Knowledge library', group: 'Second brain', description: 'Notes, clips, Markdown/text imports, tags, search, and portable export.', route: '/brain', status: 'Implemented' },
  { name: 'Knowledge graph', group: 'Second brain', description: 'Explicit source-to-source and source-to-CRM connections.', route: '/brain', status: 'Implemented' },
  { name: 'Source-cited conversations', group: 'Second brain', description: 'Saved source search and optional device-local grounded chat.', route: '/brain', status: 'Implemented' },
  { name: 'Local AI & semantic indexing', group: 'Second brain', description: 'User-opted Ollama chat and embeddings; no cloud key required.', route: '/brain/help', status: 'Optional setup' },
  { name: 'Daily briefing', group: 'Adaptive CRM', description: 'Current, evidence-backed signals and explicitly reviewed follow-ups.', route: '/today', status: 'Implemented' },
  { name: 'Inspectable learning', group: 'Adaptive CRM', description: 'Opt-in feedback, bounded ranking, pinning, pause, and forgetting.', route: '/today', status: 'Implemented' },
  { name: 'Capability library', group: 'Adaptive CRM', description: 'Five bundled packs with real behavior changes and activation undo.', route: '/today', status: 'Implemented' },
  { name: 'Public release radar', group: 'Adaptive CRM', description: 'Curated official repositories, relevance cues, and local proposals.', route: '/today', status: 'Optional setup' },
  { name: 'Background release watcher', group: 'Adaptive CRM', description: 'Explicit local process or operator-deployed Cloudflare cron.', route: 'https://github.com/mlmrx/FreeCRM/blob/7c6df4adf79122aab8da3c67589b1cc1bf61991e/docs/ADAPTIVE-CRM.md', status: 'Optional setup' },
  { name: 'Agent policy & receipts', group: 'Agent plane', description: 'Scoped grants, budgets, approvals, local simulation, and emergency stop.', route: '/workspace?view=agents', status: 'Guarded preview' },
  { name: 'CSV / JSON / ICS portability', group: 'Connections', description: 'Preview-first CSV import, record exports, and calendar output.', route: '/workspace?view=integrations', status: 'Implemented' },
  { name: 'Webhook & connector foundation', group: 'Connections', description: 'Workspace-authenticated ingress and cursor/idempotency reference sync.', route: '/workspace?view=integrations', status: 'Optional setup' },
  { name: 'Administration & audit', group: 'Ownership', description: 'Profiles, capability controls, identity boundary, and security history.', route: '/workspace?view=admin', status: 'Implemented' },
  { name: 'Device, Docker & own cloud', group: 'Ownership', description: 'Deployment guidance with operator-owned credentials and data.', route: '/deploy', status: 'Optional setup' },
  { name: 'Installable web app', group: 'Ownership', description: 'Responsive PWA shell; private workspace/API data stays network-only.', route: '/how-it-works', status: 'Implemented' },
  { name: 'Guided path finder', group: 'Community', description: 'Conversational-style guidance for choosing a profile and deployment.', route: '/start', status: 'Implemented' },
  { name: 'Insights & RSS', group: 'Community', description: 'Original CRM field guides, research, FAQs, and source-linked articles.', route: '/insights', status: 'Implemented' },
  { name: 'Community contribution', group: 'Community', description: 'MIT source, issue templates, contribution guidance, and shared roadmap.', route: '/contribute', status: 'Implemented' },
  { name: 'Enterprise & native mobile', group: 'Roadmap', description: 'Team administration, SSO/SCIM, native iOS/Android, and APK distribution are not shipped.', route: '/platform', status: 'Roadmap' },
  { name: 'Autonomous external agents', group: 'Roadmap', description: 'External execution, universal feature auto-installation, and agent transport are not released.', route: '/platform#persona-agents', status: 'Roadmap' },
];

/** Accept an installation origin, not a redirect path, credentials, or executable URL. */
export function normalizeDemoOrigin(value: string): string | null {
  if (!value.trim()) return '';
  try {
    const raw = value.trim();
    if (raw.length > 300 || /[\\\s]/.test(raw) || !/^https?:\/\//i.test(raw)) return null;
    const url = new URL(raw);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    const loopback = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?\/?$/i.test(raw);
    if (url.protocol !== 'https:' && !loopback) return null;
    return url.origin;
  } catch { return null; }
}

export function demoHref(route: string, origin = ''): string {
  if (route.startsWith('https://')) return route;
  if (!route.startsWith('/') || route.startsWith('//') || /[\\\r\n]/.test(route)) return '/demo';
  const safe = normalizeDemoOrigin(origin);
  return `${safe ?? ''}${route}`;
}

export function chapterFromHash(hash: string): number {
  const index = demoChapters.findIndex((chapter) => `#${chapter.id}` === hash);
  return index < 0 ? 0 : index;
}

export function demoKeyboardAction(key: string): 'previous' | 'next' | 'notes' | null {
  if (key === 'ArrowRight' || key === 'PageDown') return 'next';
  if (key === 'ArrowLeft' || key === 'PageUp') return 'previous';
  return key.toLowerCase() === 'n' ? 'notes' : null;
}

export function filterDemoFeatures(query: string, group = 'All'): readonly DemoFeature[] {
  const term = query.trim().toLowerCase().slice(0, 100);
  return demoFeatures.filter((feature) => (group === 'All' || feature.group === group) && `${feature.name} ${feature.description} ${feature.status} ${feature.group}`.toLowerCase().includes(term));
}
