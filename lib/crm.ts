export type RelationshipState = 'strong' | 'warm' | 'drifting';
export type OpportunityStage = 'Exploring' | 'Qualified' | 'Proposal' | 'Won';

export interface Person {
  id: string;
  name: string;
  role: string;
  companyId: string;
  email: string;
  phone?: string;
  location: string;
  tags: string[];
  strength: number;
  lastContact: string;
  cadenceDays: number;
  notes: string;
  source: string;
  color: 'coral' | 'violet' | 'mint' | 'sky' | 'sand' | 'rose';
}

export interface Company {
  id: string;
  name: string;
  domain: string;
  industry: string;
  description: string;
}

export interface FollowUp {
  id: string;
  title: string;
  personId?: string;
  dueDate: string;
  completed: boolean;
  reason: string;
}

export interface Interaction {
  id: string;
  personId: string;
  type: 'Meeting' | 'Email' | 'Call' | 'Note';
  summary: string;
  occurredAt: string;
  source: string;
}

export interface Opportunity {
  id: string;
  name: string;
  companyId: string;
  personId: string;
  value: number;
  stage: OpportunityStage;
  nextStep: string;
}

export interface WorkspaceEvent {
  id: string;
  label: string;
  detail: string;
  occurredAt: string;
  kind: 'person' | 'task' | 'import' | 'note' | 'deal';
}

export interface CRMWorkspace {
  version: 1;
  userName: string;
  people: Person[];
  companies: Company[];
  followUps: FollowUp[];
  interactions: Interaction[];
  opportunities: Opportunity[];
  events: WorkspaceEvent[];
  updatedAt: string;
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

export function makeSeedWorkspace(): CRMWorkspace {
  return {
    version: 1,
    userName: 'Maya',
    companies: [
      // Synthetic demo records use reserved .example domains and do not identify real people.
      { id: 'co-northstar', name: 'Northstar Labs', domain: 'northstar.example', industry: 'Climate software', description: 'Carbon accounting tools for mid-market operators.' },
      { id: 'co-arc', name: 'Arc Ventures', domain: 'arc.example', industry: 'Venture capital', description: 'Seed fund investing in resilient infrastructure.' },
      { id: 'co-looma', name: 'Looma', domain: 'looma.example', industry: 'Future of work', description: 'Async collaboration for distributed creative teams.' },
      { id: 'co-patch', name: 'Patchwork', domain: 'patchwork.example', industry: 'Health technology', description: 'Care coordination for community health teams.' },
      { id: 'co-forma', name: 'Forma Studio', domain: 'forma.example', industry: 'Design', description: 'Independent product and brand design practice.' },
      { id: 'co-tide', name: 'Tidepool AI', domain: 'tidepool.example', industry: 'Applied AI', description: 'Evaluation infrastructure for domain-specific AI.' },
    ],
    people: [
      { id: 'p-aisha', name: 'Aisha Malik', role: 'Founder', companyId: 'co-northstar', email: 'aisha@northstar.example', phone: '+1 415 555 0132', location: 'San Francisco', tags: ['Founder', 'Climate', 'Friend'], strength: 92, lastContact: daysAgo(8), cadenceDays: 30, notes: 'Met at South Park Commons. Aisha is hiring her first growth lead and just launched Northstar 2.0.', source: 'Imported note · Mar 2026', color: 'coral' },
      { id: 'p-jon', name: 'Jon Chen', role: 'Partner', companyId: 'co-arc', email: 'jon@arc.example', location: 'Palo Alto', tags: ['Investor', 'Climate'], strength: 84, lastContact: daysAgo(18), cadenceDays: 21, notes: 'Interested in climate infrastructure. Offered to introduce Maya to Elena at Gridline.', source: 'Meeting note · Aug 2026', color: 'violet' },
      { id: 'p-sofia', name: 'Sofia Reyes', role: 'VP Growth', companyId: 'co-looma', email: 'sofia@looma.example', location: 'New York', tags: ['Operator', 'Growth'], strength: 76, lastContact: daysAgo(27), cadenceDays: 30, notes: 'Asked for the customer discovery deck. Previously worked with Maya at Brightline.', source: 'Email note · Jul 2026', color: 'mint' },
      { id: 'p-priya', name: 'Priya Nair', role: 'Chief of Staff', companyId: 'co-patch', email: 'priya@patchwork.example', location: 'Oakland', tags: ['Healthcare', 'Operator'], strength: 68, lastContact: daysAgo(53), cadenceDays: 45, notes: 'Organizing a small healthcare founders dinner in September.', source: 'Calendar note · Jun 2026', color: 'sky' },
      { id: 'p-leo', name: 'Leo Martins', role: 'Design Director', companyId: 'co-forma', email: 'leo@forma.example', location: 'Lisbon', tags: ['Designer', 'Collaborator'], strength: 61, lastContact: daysAgo(72), cadenceDays: 60, notes: 'Collaborated on the Orbit launch. Loves editorial systems and cycling.', source: 'Imported note · May 2026', color: 'sand' },
      { id: 'p-nora', name: 'Nora Okafor', role: 'Co-founder', companyId: 'co-tide', email: 'nora@tidepool.example', location: 'London', tags: ['Founder', 'AI'], strength: 88, lastContact: daysAgo(12), cadenceDays: 30, notes: 'Building eval infrastructure for legal teams. Looking for two US design partners.', source: 'Call note · Aug 2026', color: 'rose' },
    ],
    followUps: [
      { id: 't-aisha', title: 'Congratulate Aisha on the Northstar launch', personId: 'p-aisha', dueDate: daysFromNow(0), completed: false, reason: 'Launch mentioned in your last note' },
      { id: 't-jon', title: 'Follow up with Jon on the Gridline intro', personId: 'p-jon', dueDate: daysFromNow(0), completed: false, reason: 'Promised during your August 9 meeting' },
      { id: 't-sofia', title: 'Send Sofia the customer discovery deck', personId: 'p-sofia', dueDate: daysFromNow(-2), completed: false, reason: 'Open loop from your last email' },
      { id: 't-priya', title: 'Reply about the founders dinner', personId: 'p-priya', dueDate: daysFromNow(3), completed: false, reason: 'Relationship is beginning to drift' },
      { id: 't-nora', title: 'Introduce Nora to a US design partner', personId: 'p-nora', dueDate: daysFromNow(6), completed: false, reason: 'You offered during your last call' },
      { id: 't-leo', title: 'Check in on Leo’s studio launch', personId: 'p-leo', dueDate: daysFromNow(9), completed: true, reason: 'Quarterly personal cadence' },
    ],
    interactions: [
      { id: 'i-aisha-1', personId: 'p-aisha', type: 'Email', summary: 'Aisha shared the Northstar 2.0 launch and asked about growth leaders.', occurredAt: daysAgo(8), source: 'Imported email summary' },
      { id: 'i-jon-1', personId: 'p-jon', type: 'Meeting', summary: 'Discussed climate infrastructure; Jon offered a Gridline introduction.', occurredAt: daysAgo(18), source: 'Calendar + your note' },
      { id: 'i-sofia-1', personId: 'p-sofia', type: 'Email', summary: 'Sofia asked for Maya’s latest customer discovery deck.', occurredAt: daysAgo(27), source: 'Imported email summary' },
      { id: 'i-priya-1', personId: 'p-priya', type: 'Call', summary: 'Caught up on Patchwork and the September healthcare founders dinner.', occurredAt: daysAgo(53), source: 'Manual note' },
      { id: 'i-leo-1', personId: 'p-leo', type: 'Meeting', summary: 'Orbit retrospective and a conversation about Leo’s new studio.', occurredAt: daysAgo(72), source: 'Calendar note' },
      { id: 'i-nora-1', personId: 'p-nora', type: 'Call', summary: 'Nora is seeking two US design partners for Tidepool AI.', occurredAt: daysAgo(12), source: 'Manual note' },
    ],
    opportunities: [
      { id: 'o-northstar', name: 'Growth advisory sprint', companyId: 'co-northstar', personId: 'p-aisha', value: 18000, stage: 'Qualified', nextStep: 'Scope the 6-week sprint' },
      { id: 'o-looma', name: 'Research workshop', companyId: 'co-looma', personId: 'p-sofia', value: 7500, stage: 'Proposal', nextStep: 'Send revised proposal Friday' },
      { id: 'o-tide', name: 'Design partner program', companyId: 'co-tide', personId: 'p-nora', value: 12000, stage: 'Exploring', nextStep: 'Make two partner introductions' },
      { id: 'o-patch', name: 'Team offsite facilitation', companyId: 'co-patch', personId: 'p-priya', value: 9000, stage: 'Won', nextStep: 'Confirm September dates' },
    ],
    events: [
      { id: 'e-1', label: 'Northstar Labs updated', detail: 'Aisha’s launch note raised her relationship score.', occurredAt: daysAgo(1), kind: 'note' },
      { id: 'e-2', label: 'Follow-up completed', detail: 'You checked in with Leo Martins.', occurredAt: daysAgo(3), kind: 'task' },
      { id: 'e-3', label: 'New person added', detail: 'Nora Okafor joined from a manual note.', occurredAt: daysAgo(12), kind: 'person' },
      { id: 'e-4', label: 'Opportunity advanced', detail: 'Looma research workshop moved to Proposal.', occurredAt: daysAgo(14), kind: 'deal' },
      { id: 'e-5', label: 'Demo workspace created', detail: 'Six people and their context were added.', occurredAt: daysAgo(30), kind: 'import' },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function relationshipState(person: Person): RelationshipState {
  const daysSince = Math.floor((Date.now() - new Date(person.lastContact).getTime()) / 86_400_000);
  if (daysSince > person.cadenceDays * 1.25 || person.strength < 65) return 'drifting';
  if (daysSince > person.cadenceDays * 0.7 || person.strength < 82) return 'warm';
  return 'strong';
}

export function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

export function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
