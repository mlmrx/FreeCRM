export type PublicPersona = {
  id: 'solo' | 'business' | 'enterprise' | 'agentic' | 'agents';
  number: string;
  name: string;
  profile: string;
  delivery: 'Available now' | 'Foundation available' | 'Architecture preview' | 'Guarded preview' | 'Research path';
  headline: string;
  promise: string;
  capabilities: readonly string[];
  boundary: string;
  visualLabel: string;
};

/**
 * Public positioning is deliberately coupled to the product's real delivery
 * envelope. This copy must not be upgraded from preview/roadmap language until
 * the corresponding acceptance tests and production controls exist.
 */
export const publicPersonas: readonly PublicPersona[] = [
  {
    id: 'solo',
    number: '01',
    name: 'Personal + solo',
    profile: 'Personal workspace profile',
    delivery: 'Available now',
    headline: 'One person, one clear relationship rhythm.',
    promise: 'Keep contacts, leads, opportunities, work, billing, service context, files, and decisions in a private workspace you own.',
    capabilities: ['Daily relationship focus', 'Lead-to-cash records', 'Local, Docker, or user-owned cloud'],
    boundary: 'The current release is single-owner. Native mobile wrappers and production email/calendar provider adapters remain roadmap work.',
    visualLabel: 'A single red focus point connected to a private navy relationship orbit.',
  },
  {
    id: 'business',
    number: '02',
    name: 'SMB + business',
    profile: 'Business workspace profile',
    delivery: 'Foundation available',
    headline: 'A shared operating shape, ready for the team layer.',
    promise: 'Use the complete CRM module set, service workflows, reports, audit history, and a larger capability envelope without creating a separate product fork.',
    capabilities: ['Sales, delivery, billing, and service', 'Workflow and connector foundations', 'Reversible workspace profile'],
    boundary: 'Team invitations, shared record ownership, and role administration are not shipped. Operate this profile as a single verified owner today.',
    visualLabel: 'Three relationship points sharing one governed business orbit.',
  },
  {
    id: 'enterprise',
    number: '03',
    name: 'Enterprise',
    profile: 'Enterprise workspace profile',
    delivery: 'Architecture preview',
    headline: 'Governance belongs in the platform, not a fork.',
    promise: 'The shared architecture reserves explicit control, data, integration, and agent planes so enterprise controls can grow without splitting the codebase.',
    capabilities: ['Workspace-scoped storage boundaries', 'Append-only security audit trail', 'Policy capability registry'],
    boundary: 'This is not an enterprise-ready release: SSO/SCIM, multi-user administration, data residency, advanced policy authoring, and recovery automation are not delivered.',
    visualLabel: 'Four bounded platform planes aligned inside one enterprise frame.',
  },
  {
    id: 'agentic',
    number: '04',
    name: 'Agentic CRM',
    profile: 'Capability layer across every profile',
    delivery: 'Guarded preview',
    headline: 'Let agents prepare work without surrendering control.',
    promise: 'Model agent proposals, approvals, policy checks, budgets, emergency stops, and receipts alongside the relationships they affect.',
    capabilities: ['Human approval gates', 'Scoped policy and budget checks', 'Append-only execution receipts'],
    boundary: 'The local simulator is real; external tool execution and production provider connectors are deliberately blocked in this release.',
    visualLabel: 'A red agent signal pauses at a white human approval gate before reaching CRM data.',
  },
  {
    id: 'agents',
    number: '05',
    name: 'CRM for Agents',
    profile: 'Agent actor + API research path',
    delivery: 'Research path',
    headline: 'Relationships that agents can serve—and never silently own.',
    promise: 'Treat humans, organizations, services, and agents as first-class actors with provenance, scoped authority, and durable receipts.',
    capabilities: ['Actor-first kernel foundation', 'Tenant-scoped API boundaries', 'Human-agent relationship model'],
    boundary: 'Scoped external agent identities, grants, MCP transport, and autonomous relationship operations are not released yet.',
    visualLabel: 'Human and agent actors remain distinct while sharing a receipt-backed relationship line.',
  },
] as const;
