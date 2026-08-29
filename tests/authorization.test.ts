import { describe, expect, it } from 'vitest';
import { hasPermission, requirePermission } from '@/server/authorization';
import { ApiError } from '@/server/request-context';

describe('least privilege roles', () => {
  it('allows explicit grants', () => {
    expect(hasPermission('owner', 'agents:approve')).toBe(true);
    expect(hasPermission('member', 'records:write')).toBe(true);
    expect(hasPermission('auditor', 'audit:read')).toBe(true);
  });
  it('denies privilege escalation and unknown roles', () => {
    expect(hasPermission('agent', 'records:write')).toBe(false);
    expect(hasPermission('member', 'workspace:manage')).toBe(false);
    expect(hasPermission('superuser', 'workspace:manage')).toBe(false);
    expect(() => requirePermission('agent', 'agents:manage')).toThrow(ApiError);
  });
});
