import { moduleCatalog, type CRMSnapshot, type RecordType } from './crm-platform';

export type WorkspaceView = 'dashboard' | RecordType | 'reports' | 'workflows' | 'integrations' | 'agents' | 'admin';
export const moduleCapability = (type: RecordType) => type === 'ticket' ? 'service' : ['lead', 'contact', 'company', 'activity', 'task', 'document'].includes(type) ? 'relationships' : 'sales';

/** Navigation only: server authorization remains authoritative for every operation. */
export function workspaceViewFromQuery(value: string | null, snapshot: Pick<CRMSnapshot, 'capabilities' | 'modules'>): WorkspaceView | null {
  if (!value) return null;
  if (['dashboard', 'reports', 'workflows', 'admin'].includes(value)) return value as WorkspaceView;
  if (value === 'agents') return snapshot.capabilities.agentPlane.enabled ? value : null;
  if (value === 'integrations') return snapshot.capabilities.integrations.enabled ? value : null;
  const entry = moduleCatalog.find((item) => item.key === value);
  if (!entry || !snapshot.capabilities[moduleCapability(entry.key)].enabled || snapshot.modules.find((item) => item.moduleKey === entry.key)?.enabled === false) return null;
  return entry.key;
}
