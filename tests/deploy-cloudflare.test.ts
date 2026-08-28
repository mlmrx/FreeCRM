import { describe, expect, it } from 'vitest';
import { assertOwnerOnlyAccess, configFor, isExactEmailRule, redactSensitiveText, scrubChildEnvironment } from '../scripts/deploy-cloudflare.mjs';

const workerTag = 'worker-tag-123';
const ownerEmail = 'owner@example.com';

function application(overrides: Record<string, unknown> = {}) {
  return {
    id: 'app-id',
    type: 'self_hosted',
    aud: 'access-audience',
    destinations: [{ type: 'worker', worker_id: workerTag }],
    ...overrides,
  };
}

function ownerPolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'policy-id',
    decision: 'allow',
    include: [{ email: { email: ownerEmail } }],
    exclude: [],
    require: [],
    ...overrides,
  };
}

describe('Cloudflare deployment safety helpers', () => {
  it('writes an explicit locked config before Access is proven', () => {
    const locked = configFor({
      workerName: 'free-crm',
      databaseName: 'free-crm-db',
      databaseId: '11111111-1111-4111-8111-111111111111',
      bucketName: 'free-crm-files',
    });
    expect(locked.vars).toEqual({ FREE_CRM_AUTH_MODE: 'locked' });

    const active = configFor({
      workerName: 'free-crm',
      databaseName: 'free-crm-db',
      databaseId: '11111111-1111-4111-8111-111111111111',
      bucketName: 'free-crm-files',
      access: { teamDomain: 'team.cloudflareaccess.com', audience: 'audience', ownerEmail },
    });
    expect(active.vars).toEqual({
      FREE_CRM_AUTH_MODE: 'cloudflare-access',
      FREE_CRM_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      FREE_CRM_ACCESS_AUD: 'audience',
      FREE_CRM_OWNER_EMAIL: ownerEmail,
    });
  });

  it('accepts only one exact-email allow policy for one Worker destination', () => {
    expect(isExactEmailRule({ email: { email: ownerEmail } })).toBe(true);
    expect(assertOwnerOnlyAccess(application(), [ownerPolicy()], workerTag, ownerEmail)).toBe('access-audience');
  });

  it.each([
    ['Everyone selector', [ownerPolicy({ include: [{ everyone: {} }] })]],
    ['email-domain selector', [ownerPolicy({ include: [{ email_domain: { domain: 'example.com' } }] })]],
    ['bypass decision', [ownerPolicy({ decision: 'bypass' })]],
    ['different owner', [ownerPolicy({ include: [{ email: { email: 'other@example.com' } }] })]],
    ['extra policy', [ownerPolicy(), ownerPolicy({ id: 'second-policy' })]],
  ])('rejects %s', (_label, policies) => {
    expect(() => assertOwnerOnlyAccess(application(), policies, workerTag, ownerEmail)).toThrow(/locked|exactly/i);
  });

  it('rejects an Access application with any extra destination', () => {
    expect(() => assertOwnerOnlyAccess(application({
      destinations: [
        { type: 'worker', worker_id: workerTag },
        { type: 'public', uri: 'crm.example.com' },
      ],
    }), [ownerPolicy()], workerTag, ownerEmail)).toThrow(/ambiguous/i);
  });

  it('redacts deployment credentials and owner identity from captured tool output', () => {
    const token = ['fixture', 'credential', 'value'].join('-');
    const email = ['private-owner', 'example.invalid'].join('@');
    const accountId = '1234567890abcdef1234567890abcdef';
    const output = `token=${token} owner=${email} account=${accountId} deployment=ready`;
    const redacted = redactSensitiveText(output, {
      CLOUDFLARE_API_TOKEN: token,
      FREE_CRM_OWNER_EMAIL: email,
      CLOUDFLARE_ACCOUNT_ID: accountId,
    });

    expect(redacted).not.toContain(token);
    expect(redacted).not.toContain(email);
    expect(redacted).not.toContain(accountId);
    expect(redacted).toContain('deployment=ready');
  });

  it('limits child processes to the one explicitly allowed deployment credential', () => {
    const cloudflareTokenKey = ['CLOUDFLARE', 'API', 'TOKEN'].join('_');
    const openAiKey = ['OPENAI', 'API', 'KEY'].join('_');
    const awsKey = ['AWS', 'SECRET', 'ACCESS', 'KEY'].join('_');
    const awsKeyId = ['AWS', 'ACCESS', 'KEY', 'ID'].join('_');
    const githubTokenKey = ['GITHUB', 'TOKEN'].join('_');
    const webhookKey = ['FREE', 'CRM', 'WEBHOOK', 'KEY'].join('_');
    const source = {
      PATH: '/usr/bin',
      [cloudflareTokenKey]: ['cloudflare', 'fixture'].join('-'),
      [openAiKey]: ['openai', 'fixture'].join('-'),
      [awsKey]: ['aws', 'fixture'].join('-'),
      [awsKeyId]: ['aws', 'identifier', 'fixture'].join('-'),
      [githubTokenKey]: ['github', 'fixture'].join('-'),
      [webhookKey]: ['webhook', 'fixture'].join('-'),
      FREE_CRM_OWNER_EMAIL: 'owner@example.invalid',
      CLOUDFLARE_ACCOUNT_ID: '1234567890abcdef1234567890abcdef',
    };
    const wrangler = scrubChildEnvironment(source, {
      allowSensitive: ['CLOUDFLARE_API_TOKEN'],
      deny: ['FREE_CRM_OWNER_EMAIL', 'FREE_CRM_WEBHOOK_KEY'],
    });
    expect(wrangler).toEqual({
      PATH: '/usr/bin',
      [cloudflareTokenKey]: ['cloudflare', 'fixture'].join('-'),
      CLOUDFLARE_ACCOUNT_ID: '1234567890abcdef1234567890abcdef',
    });

    const build = scrubChildEnvironment(source, {
      deny: ['CLOUDFLARE_ACCOUNT_ID', 'FREE_CRM_OWNER_EMAIL', 'FREE_CRM_WEBHOOK_KEY'],
    });
    expect(build).toEqual({ PATH: '/usr/bin' });
  });
});
