import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getD1, requireActivatedRuntime, requireMachineWebhookIngress } = vi.hoisted(() => ({
  getD1: vi.fn(),
  requireActivatedRuntime: vi.fn(),
  requireMachineWebhookIngress: vi.fn(),
}));

vi.mock('@/db', () => ({ getD1 }));
vi.mock('@/server/request-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/request-context')>();
  return { ...actual, requireActivatedRuntime, requireMachineWebhookIngress };
});

import { POST } from '@/app/api/v1/webhooks/[workspaceId]/route';
import { ApiError } from '@/server/request-context';

describe('machine webhook runtime boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireActivatedRuntime.mockResolvedValue(undefined);
    requireMachineWebhookIngress.mockImplementation(() => {
      throw new ApiError(503, 'webhook_ingress_unavailable', 'Unavailable.');
    });
  });

  it('rejects native Vercel ingress before opening the remote database', async () => {
    const response = await POST(new Request('https://freecrm.dev/api/v1/webhooks/workspace-a', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-free-crm-webhook-key': 'w'.repeat(32),
      },
      body: JSON.stringify({ eventId: 'event-a', name: 'Test event' }),
    }), { params: Promise.resolve({ workspaceId: 'workspace-a' }) });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'webhook_ingress_unavailable' } });
    expect(requireMachineWebhookIngress).toHaveBeenCalledOnce();
    expect(getD1).not.toHaveBeenCalled();
  });
});
