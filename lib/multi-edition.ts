/** Stable edition and agent-plane primitives shared by UI, APIs, and repositories. */
export const workspaceProfiles = ['personal', 'business', 'enterprise'] as const;
export type WorkspaceProfile = (typeof workspaceProfiles)[number];

export const workspaceRoles = ['owner', 'admin', 'operator', 'member', 'auditor', 'agent'] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export const autonomyLevels = ['observe', 'suggest', 'prepare', 'approval-required', 'policy-autonomous'] as const;
export type AutonomyLevel = (typeof autonomyLevels)[number];

export const actorKinds = ['human', 'organization', 'service', 'agent'] as const;
export type ActorKind = (typeof actorKinds)[number];

export const capabilities = {
  relationships: { label: 'Relationships', navigation: true, profiles: workspaceProfiles, limit: { personal: 500, business: 1_000, enterprise: 1_000 } },
  sales: { label: 'Sales', navigation: true, profiles: workspaceProfiles, limit: { personal: 250, business: 1_000, enterprise: 1_000 } },
  service: { label: 'Cases', navigation: true, profiles: ['business', 'enterprise'], limit: { personal: 0, business: 500, enterprise: 1_000 } },
  integrations: { label: 'Integrations', navigation: true, profiles: workspaceProfiles, limit: { personal: 3, business: 25, enterprise: null } },
  agentPlane: { label: 'Agents', navigation: true, profiles: workspaceProfiles, limit: { personal: 1, business: 10, enterprise: 100 } },
  advancedPolicies: { label: 'Policy authoring (preview)', navigation: false, profiles: [], limit: { personal: 0, business: 0, enterprise: 0 } },
} as const;

export type CapabilityKey = keyof typeof capabilities;
export type CapabilityOverride = Partial<Record<CapabilityKey, boolean>>;

export function isWorkspaceProfile(value: unknown): value is WorkspaceProfile {
  return typeof value === 'string' && (workspaceProfiles as readonly string[]).includes(value);
}

export function resolveCapabilities(profile: WorkspaceProfile, overrides: CapabilityOverride = {}) {
  return Object.fromEntries(Object.entries(capabilities).map(([key, definition]) => {
    const capability = key as CapabilityKey;
    const profileEnabled = (definition.profiles as readonly string[]).includes(profile);
    return [capability, {
      key: capability,
      label: definition.label,
      enabled: overrides[capability] ?? profileEnabled,
      navigation: definition.navigation,
      limit: definition.limit[profile],
    }];
  })) as Record<CapabilityKey, { key: CapabilityKey; label: string; enabled: boolean; navigation: boolean; limit: number | null }>;
}

export type AgentActionContext = {
  autonomy: AutonomyLevel;
  external: boolean;
  destructive?: boolean;
  paused?: boolean;
  emergencyStopped?: boolean;
  requestedScope: string;
  allowedScopes: readonly string[];
  budgetRemainingCents: number;
  estimatedCostCents: number;
  policyAllowsAutonomous?: boolean;
};

export type AgentDecision = {
  decision: 'deny' | 'observe' | 'suggest' | 'prepare' | 'require-approval' | 'allow';
  reason: string;
  mayExecute: boolean;
};

/** Fail-closed policy evaluation. External action requires approval unless explicitly policy-autonomous. */
export function evaluateAgentAction(context: AgentActionContext): AgentDecision {
  if (context.emergencyStopped) return { decision: 'deny', reason: 'Workspace emergency stop is active.', mayExecute: false };
  if (context.paused) return { decision: 'deny', reason: 'Agent is paused.', mayExecute: false };
  if (!context.allowedScopes.includes(context.requestedScope)) return { decision: 'deny', reason: 'Tool scope is not granted.', mayExecute: false };
  if (context.estimatedCostCents < 0 || context.estimatedCostCents > context.budgetRemainingCents) return { decision: 'deny', reason: 'Agent budget would be exceeded.', mayExecute: false };
  if (context.destructive) return { decision: 'require-approval', reason: 'Destructive actions always require human approval.', mayExecute: false };
  if (context.autonomy === 'observe') return { decision: 'observe', reason: 'Observe-only agents cannot propose or execute actions.', mayExecute: false };
  if (context.autonomy === 'suggest') return { decision: 'suggest', reason: 'Suggestion is ready for a human.', mayExecute: false };
  if (context.autonomy === 'prepare') return { decision: 'prepare', reason: 'Draft is prepared but cannot be executed.', mayExecute: false };
  if (context.external && (context.autonomy !== 'policy-autonomous' || !context.policyAllowsAutonomous)) {
    return { decision: 'require-approval', reason: 'External action requires human approval.', mayExecute: false };
  }
  if (context.autonomy === 'approval-required') return { decision: 'require-approval', reason: 'Agent autonomy requires approval.', mayExecute: false };
  return { decision: 'allow', reason: 'Action satisfies granted scope, budget, and policy.', mayExecute: true };
}

export type ConnectorDefinition = {
  key: string;
  name: string;
  auth: 'oauth2' | 'api-key' | 'simulated';
  scopes: readonly string[];
  supportsWebhooks: boolean;
};

export const referenceConnectors: readonly ConnectorDefinition[] = [
  { key: 'csv', name: 'CSV export simulator', auth: 'simulated', scopes: ['records:read'], supportsWebhooks: false },
  { key: 'webhook-simulator', name: 'Webhook simulator', auth: 'simulated', scopes: ['events:receive'], supportsWebhooks: true },
];

export interface ObjectStorage {
  put(workspaceId: string, key: string, body: ReadableStream | ArrayBuffer): Promise<void>;
  get(workspaceId: string, key: string): Promise<ReadableStream | null>;
  delete(workspaceId: string, key: string): Promise<void>;
}

export interface ConnectorAdapter {
  readonly definition: ConnectorDefinition;
  health(): Promise<'healthy' | 'degraded' | 'disconnected'>;
  sync(cursor: string | null, idempotencyKey: string): Promise<{ cursor: string | null; processed: number }>;
  disconnect(options: { deleteCredential: true }): Promise<void>;
}
