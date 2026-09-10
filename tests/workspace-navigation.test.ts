import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { moduleCatalog, type CRMSnapshot } from '@/lib/crm-platform';
import { resolveCapabilities } from '@/lib/multi-edition';
import { moduleCapability, workspaceViewFromQuery } from '@/lib/workspace-navigation';

const snapshot: Pick<CRMSnapshot, 'capabilities' | 'modules'> = { capabilities: resolveCapabilities('business'), modules: [] };
describe('workspace presentation deep links', () => {
  it('accepts all implemented, enabled CRM and utility destinations', () => {
    for (const entry of moduleCatalog) expect(workspaceViewFromQuery(entry.key, snapshot)).toBe(entry.key);
    for (const view of ['dashboard', 'reports', 'workflows', 'agents', 'integrations', 'admin']) expect(workspaceViewFromQuery(view, snapshot)).toBe(view);
  });
  it('rejects unknown views and honors profile/capability/module switches', () => {
    for (const view of [null, '', 'constructor', '__proto__', 'Contact', '/admin', 'javascript:bad']) expect(workspaceViewFromQuery(view, snapshot)).toBeNull();
    expect(workspaceViewFromQuery('ticket', { ...snapshot, capabilities: resolveCapabilities('personal') })).toBeNull();
    const disabled = { ...snapshot, capabilities: resolveCapabilities('business', { relationships: false, sales: false, agentPlane: false, integrations: false }) };
    for (const view of ['contact', 'opportunity', 'agents', 'integrations']) expect(workspaceViewFromQuery(view, disabled)).toBeNull();
    expect(workspaceViewFromQuery('contact', { ...snapshot, modules: [{ moduleKey: 'contact', enabled: false, position: 0, config: {} }] })).toBeNull();
    expect(moduleCapability('ticket')).toBe('service');
    expect(moduleCapability('invoice')).toBe('sales');
    expect(moduleCapability('task')).toBe('relationships');
  });
  it('resolves after authenticated loading while keeping record links higher priority', () => {
    const source = readFileSync('app/crm-app.tsx', 'utf8');
    const load = source.indexOf('loadCloudSnapshot().then');
    const view = source.indexOf("workspaceViewFromQuery(params.get('view'), data)");
    const record = source.indexOf('setView(linked.objectType)');
    expect(view).toBeGreaterThan(load);
    expect(record).toBeGreaterThan(view);
    expect(source).toContain('That view is unavailable in this workspace. Showing the dashboard.');
  });
});
