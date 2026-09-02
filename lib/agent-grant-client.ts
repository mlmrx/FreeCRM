import { sendIdempotentOperation } from './idempotent-client';

export const AGENT_GRANT_RENEWAL_DAYS = 30;

export type AgentGrantExpiryReceipt = {
  agentId: string;
  toolId: string;
  expiresAt: string | null;
  status: 'updated';
  replayed: boolean;
};

export type AgentGrantRevokeReceipt = {
  agentId: string;
  toolId: string;
  status: 'revoked';
  replayed: boolean;
};

export function renewedAgentGrantExpiry(now = Date.now()): string {
  return new Date(now + AGENT_GRANT_RENEWAL_DAYS * 86_400_000).toISOString();
}

export function isAgentToolGrantUsable(
  tool: { enabled: boolean; expiresAt: string | null },
  now = Date.now(),
): boolean {
  if (!tool.enabled) return false;
  if (tool.expiresAt === null) return true;
  const expiry = Date.parse(tool.expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

function isExpiryReceiptFor(agentId: string, toolId: string, expiresAt: string | null) {
  return (value: unknown): value is AgentGrantExpiryReceipt => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const receipt = value as Partial<AgentGrantExpiryReceipt>;
    return receipt.agentId === agentId
      && receipt.toolId === toolId
      && receipt.expiresAt === expiresAt
      && receipt.status === 'updated'
      && typeof receipt.replayed === 'boolean';
  };
}

function isRevokeReceiptFor(agentId: string, toolId: string) {
  return (value: unknown): value is AgentGrantRevokeReceipt => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const receipt = value as Partial<AgentGrantRevokeReceipt>;
    return receipt.agentId === agentId
      && receipt.toolId === toolId
      && receipt.status === 'revoked'
      && typeof receipt.replayed === 'boolean';
  };
}

export function setAgentToolGrantExpiry(agentId: string, toolId: string, expiresAt: string | null) {
  return sendIdempotentOperation<AgentGrantExpiryReceipt>(
    '/api/v1/agents/actions',
    { operation: 'grant.expiry.set', agentId, toolId, expiresAt },
    { validateData: isExpiryReceiptFor(agentId, toolId, expiresAt) },
  );
}

export function revokeAgentToolGrant(agentId: string, toolId: string) {
  return sendIdempotentOperation<AgentGrantRevokeReceipt>(
    '/api/v1/agents/actions',
    { operation: 'grant.revoke', agentId, toolId },
    { validateData: isRevokeReceiptFor(agentId, toolId) },
  );
}
