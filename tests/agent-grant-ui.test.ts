import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const workspace = readFileSync(join(root, 'app', 'crm-app.tsx'), 'utf8');
const css = readFileSync(join(root, 'app', 'globals.css'), 'utf8');

describe('agent grant management UI', () => {
  it('shows expiry state and exposes explicit renewal, no-expiry, and irreversible revocation actions', () => {
    expect(workspace).toContain("isAgentToolGrantUsable(tool, clock)");
    expect(workspace).toContain("operation: 'grant.expiry.set'");
    expect(workspace).toContain("operation: 'grant.revoke'");
    expect(workspace).toContain('Renew 30 days');
    expect(workspace).toContain('No expiry · manual revocation required');
    expect(workspace).toContain('cannot be undone for this agent. Type REVOKE');
    expect(workspace).toContain('earlier proposals were cancelled for safety');
  });

  it('uses validated idempotent clients and preserves the current workspace after a committed refresh failure', () => {
    expect(workspace).toContain("return setAgentToolGrantExpiry(");
    expect(workspace).toContain("return revokeAgentToolGrant(");
    expect(workspace).toContain('refresh={refreshAfterCommittedImport}');
    expect(workspace).toContain('The receipt is saved, but refresh failed; reload before another agent action.');
  });

  it('keeps grant controls readable and reachable on narrow screens', () => {
    expect(css).toContain('.agent-grant-row { min-height: 76px; display: grid;');
    expect(css).toContain('.agent-grant-actions button,.agent-grant-actions .danger-button { min-height:44px;');
    expect(css).toContain('.agent-grant-row > .status-chip,.agent-grant-actions { grid-column:2; }');
  });
});
