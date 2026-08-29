import { ApiError } from './request-context';

export type WorkspaceRole = 'owner' | 'admin' | 'operator' | 'member' | 'auditor' | 'agent';
export type Permission = 'workspace:manage' | 'records:read' | 'records:write' | 'audit:read' | 'connectors:manage' | 'agents:manage' | 'agents:approve' | 'agents:act';

const grants: Record<WorkspaceRole, readonly Permission[]> = {
  owner: ['workspace:manage', 'records:read', 'records:write', 'audit:read', 'connectors:manage', 'agents:manage', 'agents:approve'],
  admin: ['workspace:manage', 'records:read', 'records:write', 'audit:read', 'connectors:manage', 'agents:manage', 'agents:approve'],
  operator: ['records:read', 'records:write', 'connectors:manage'],
  member: ['records:read', 'records:write'],
  auditor: ['records:read', 'audit:read'],
  agent: ['records:read', 'agents:act'],
};

export function hasPermission(role: string, permission: Permission): boolean {
  return Object.hasOwn(grants, role) && grants[role as WorkspaceRole].includes(permission);
}

export function requirePermission(role: string, permission: Permission): void {
  if (!hasPermission(role, permission)) throw new ApiError(403, 'forbidden', `Permission ${permission} is required.`);
}
