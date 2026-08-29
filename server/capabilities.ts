import { resolveCapabilities, type CapabilityKey, type CapabilityOverride } from '@/lib/multi-edition';
import type { WorkspaceContext } from './control-plane';
import { ApiError } from './request-context';

export async function getWorkspaceCapabilities(db: D1Database, context: WorkspaceContext) {
  const rows = await db.prepare('SELECT capability_key, enabled FROM capability_overrides WHERE workspace_id = ?').bind(context.workspaceId).all<{ capability_key: CapabilityKey; enabled: number }>();
  return resolveCapabilities(context.workspace.profile, Object.fromEntries(rows.results.map((row) => [row.capability_key, Boolean(row.enabled)])) as CapabilityOverride);
}

export async function requireCapability(db: D1Database, context: WorkspaceContext, key: CapabilityKey) {
  const capability = (await getWorkspaceCapabilities(db, context))[key];
  if (!capability.enabled) throw new ApiError(403, 'capability_disabled', `${capability.label} is disabled for this workspace.`);
  return capability;
}
