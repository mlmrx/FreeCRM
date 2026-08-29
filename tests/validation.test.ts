import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { getRequestIdentity, normalizeAccessTeamDomain, readJsonObject } from '@/server/request-context';
import {
  assertRecordType,
  cleanDate,
  cleanEmail,
  cleanInteger,
  cleanRecordInput,
  cleanText,
  cleanUrl,
  parseCommand,
  requireId,
  requireVersion,
} from '@/server/validation';

function expectCode(run: () => unknown, code: string) {
  try {
    run();
    throw new Error('Expected an API error');
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

describe('command validation boundary', () => {
  it('uses the trusted gateway identity in hosted mode and a fixed owner locally', async () => {
    delete env.FREE_CRM_LOCAL_MODE;
    env.FREE_CRM_AUTH_MODE = 'sites';
    const hosted = await getRequestIdentity(new Request('https://free-crm.example.test', {
      headers: {
        'oai-authenticated-user-id': 'hosted-user',
        'oai-authenticated-user-email': 'owner@example.test',
        'oai-authenticated-user-full-name': 'Ada%20Lovelace',
        'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
      },
    }));
    expect(hosted).toMatchObject({ userId: 'hosted-user', email: 'owner@example.test', displayName: 'Ada Lovelace' });

    env.FREE_CRM_LOCAL_MODE = 'true';
    const local = await getRequestIdentity(new Request('http://localhost:3477', {
      headers: {
        'cf-connecting-ip': '127.0.0.1',
        'oai-authenticated-user-id': 'spoofed-user',
        'oai-authenticated-user-email': 'spoofed@example.test',
      },
    }));
    expect(local).toMatchObject({ userId: 'local-development-user', email: 'owner@free-crm.local' });
    await expect(getRequestIdentity(new Request('https://free-crm.example.workers.dev', {
      headers: { 'cf-connecting-ip': '203.0.113.5' },
    }))).rejects.toMatchObject({ status: 403, code: 'local_mode_denied' });
    delete env.FREE_CRM_LOCAL_MODE;
    delete env.FREE_CRM_AUTH_MODE;
  });

  it('keeps BYOC sealed and rejects spoofed Sites headers without an Access JWT', async () => {
    env.FREE_CRM_AUTH_MODE = 'cloudflare-access';
    delete env.FREE_CRM_ACCESS_TEAM_DOMAIN;
    delete env.FREE_CRM_ACCESS_AUD;
    delete env.FREE_CRM_OWNER_EMAIL;
    await expect(getRequestIdentity(new Request('https://free-crm.example.workers.dev', {
      headers: {
        'oai-authenticated-user-id': 'spoofed-user',
        'oai-authenticated-user-email': 'spoofed@example.test',
      },
    }))).rejects.toMatchObject({ status: 503, code: 'deployment_locked' });

    env.FREE_CRM_ACCESS_TEAM_DOMAIN = 'https://my-team.cloudflareaccess.com';
    env.FREE_CRM_ACCESS_AUD = 'access-audience_123';
    env.FREE_CRM_OWNER_EMAIL = 'owner@example.com';
    await expect(getRequestIdentity(new Request('https://free-crm.example.workers.dev', {
      headers: {
        'oai-authenticated-user-id': 'spoofed-user',
        'oai-authenticated-user-email': 'spoofed@example.test',
      },
    }))).rejects.toMatchObject({ status: 401, code: 'authentication_required' });
    delete env.FREE_CRM_AUTH_MODE;
    delete env.FREE_CRM_ACCESS_TEAM_DOMAIN;
    delete env.FREE_CRM_ACCESS_AUD;
    delete env.FREE_CRM_OWNER_EMAIL;
  });

  it('maps a verified Cloudflare Access subject to a stable CRM identity', async () => {
    env.FREE_CRM_AUTH_MODE = 'cloudflare-access';
    env.FREE_CRM_ACCESS_TEAM_DOMAIN = 'my-team.cloudflareaccess.com';
    env.FREE_CRM_ACCESS_AUD = 'access-audience_123';
    env.FREE_CRM_OWNER_EMAIL = 'owner@example.com';
    const identity = await getRequestIdentity(new Request('https://free-crm.example.workers.dev', {
      headers: {
        'cf-access-jwt-assertion': 'signed-token',
        'oai-authenticated-user-id': 'ignored-spoof',
        'oai-authenticated-user-email': 'ignored@example.test',
      },
    }), async (token, config) => {
      expect(token).toBe('signed-token');
      expect(config).toMatchObject({ issuer: 'https://my-team.cloudflareaccess.com', audience: 'access-audience_123', ownerEmail: 'owner@example.com' });
      return { sub: 'access-subject', email: 'Owner@Example.com', name: 'Owner Name' };
    });
    expect(identity).toMatchObject({ email: 'owner@example.com', displayName: 'Owner Name' });
    expect(identity.userId).toMatch(/^cloudflare:[a-f0-9]{64}$/);
    await expect(getRequestIdentity(new Request('https://free-crm.example.workers.dev', {
      headers: { 'cf-access-jwt-assertion': 'signed-token' },
    }), async () => ({ sub: 'other-subject', email: 'other@example.com' }))).rejects.toMatchObject({ status: 403, code: 'access_denied' });
    delete env.FREE_CRM_AUTH_MODE;
    delete env.FREE_CRM_ACCESS_TEAM_DOMAIN;
    delete env.FREE_CRM_ACCESS_AUD;
    delete env.FREE_CRM_OWNER_EMAIL;
  });

  it('validates the Access issuer and fails closed on a rejected token', async () => {
    expect(normalizeAccessTeamDomain('team.cloudflareaccess.com')).toBe('https://team.cloudflareaccess.com');
    expect(() => normalizeAccessTeamDomain('https://example.com')).toThrowError(expect.objectContaining({ code: 'deployment_locked' }));
    expect(() => normalizeAccessTeamDomain('https://team.cloudflareaccess.com/path')).toThrowError(expect.objectContaining({ code: 'deployment_locked' }));
    env.FREE_CRM_AUTH_MODE = 'cloudflare-access';
    env.FREE_CRM_ACCESS_TEAM_DOMAIN = 'team.cloudflareaccess.com';
    env.FREE_CRM_ACCESS_AUD = 'access-audience';
    env.FREE_CRM_OWNER_EMAIL = 'owner@example.com';
    await expect(getRequestIdentity(new Request('https://free-crm.example.workers.dev', {
      headers: { 'cf-access-jwt-assertion': 'forged-token' },
    }), async () => { throw new Error('bad signature'); })).rejects.toMatchObject({ status: 403, code: 'access_denied' });
    delete env.FREE_CRM_AUTH_MODE;
    delete env.FREE_CRM_ACCESS_TEAM_DOMAIN;
    delete env.FREE_CRM_ACCESS_AUD;
    delete env.FREE_CRM_OWNER_EMAIL;
  });

  it('parses supported commands and rejects malformed envelopes', () => {
    expect(parseCommand({ type: 'record.create', payload: { objectType: 'contact', name: 'Aisha' } })).toEqual({ type: 'record.create', payload: { objectType: 'contact', name: 'Aisha' } });
    expect(parseCommand({ type: 'demo.reset' })).toEqual({ type: 'demo.reset', payload: {} });
    expectCode(() => parseCommand(null), 'invalid_payload');
    expectCode(() => parseCommand({ type: 'magic', payload: {} }), 'unsupported_command');
    expectCode(() => parseCommand({ type: 'record.create', payload: [] }), 'invalid_payload');
  });

  it('cleans text, integers, identifiers, and versions', () => {
    expect(cleanText('  hello  ', 'name', 20, true)).toBe('hello');
    expect(cleanInteger(undefined, 'count', 0, 5, 3)).toBe(3);
    expect(cleanInteger('4', 'count', 0, 5)).toBe(4);
    expect(requireId({ id: ' rec-1 ' })).toBe('rec-1');
    expect(requireVersion({ version: 2 })).toBe(2);
    expectCode(() => cleanText('', 'name', 20, true), 'validation_error');
    expectCode(() => cleanText('abcdef', 'name', 5), 'validation_error');
    expectCode(() => cleanInteger(1.2, 'count', 0, 5), 'validation_error');
    expectCode(() => requireVersion({ version: 0 }), 'validation_error');
  });

  it('validates dates, email addresses, and secure connector URLs', () => {
    expect(cleanDate('2026-08-27', 'dueAt')).toBe('2026-08-27T00:00:00.000Z');
    expect(cleanDate('', 'dueAt')).toBeNull();
    expect(cleanEmail(' USER@Example.com ')).toBe('user@example.com');
    expect(cleanEmail('')).toBeNull();
    expect(cleanUrl('https://hooks.example.test/path', 'webhookUrl')).toBe('https://hooks.example.test/path');
    expect(cleanUrl('', 'webhookUrl')).toBeNull();
    expectCode(() => cleanDate('tomorrowish', 'dueAt'), 'validation_error');
    expectCode(() => cleanEmail('bad@'), 'validation_error');
    expectCode(() => cleanUrl('http://example.test', 'webhookUrl'), 'validation_error');
    expectCode(() => cleanUrl('not a url', 'webhookUrl'), 'validation_error');
    const embeddedCredentialUrl = `https://${['user', 'password'].join(':')}@hooks.example.test/path`;
    expectCode(() => cleanUrl(embeddedCredentialUrl, 'webhookUrl'), 'validation_error');
    expectCode(() => cleanUrl('https://hooks.example.test/path?access_token=credential', 'webhookUrl'), 'validation_error');
    expectCode(() => cleanUrl('https://hooks.example.test/path?api-key=credential', 'webhookUrl'), 'validation_error');
    expectCode(() => cleanUrl('https://hooks.example.test/path#token=credential', 'webhookUrl'), 'validation_error');
  });

  it('normalizes full and partial CRM record inputs', () => {
    expect(cleanRecordInput({
      objectType: 'opportunity',
      name: '  Northstar renewal ',
      status: 'proposal',
      email: 'OWNER@EXAMPLE.COM',
      amountCents: 10000,
      currency: 'usd',
      probability: 65,
      dueAt: '2026-09-01',
      fields: { nextAction: 'Send quote' },
      tags: 'Warm, Renewal, Warm',
    })).toMatchObject({
      objectType: 'opportunity',
      name: 'Northstar renewal',
      status: 'proposal',
      email: 'owner@example.com',
      amountCents: 10000,
      currency: 'USD',
      probability: 65,
      tags: ['Warm', 'Renewal'],
    });
    expect(cleanRecordInput({ status: 'active', phone: null }, true)).toMatchObject({ objectType: undefined, name: undefined, status: 'active', phone: null });
    expectCode(() => cleanRecordInput({ name: 'Missing type' }), 'validation_error');
    expectCode(() => cleanRecordInput({ objectType: 'contact', name: 'Name', status: 'won' }), 'validation_error');
    expectCode(() => cleanRecordInput({ objectType: 'contact', name: 'Name', fields: [] }), 'invalid_payload');
  });

  it('only allows declared record types', () => {
    expect(assertRecordType('ticket')).toBe('ticket');
    expectCode(() => assertRecordType('membership'), 'validation_error');
  });
});

describe('bounded JSON request parsing', () => {
  it('accepts objects and rejects malformed, array, and oversized bodies', async () => {
    await expect(readJsonObject(new Request('https://example.test', { method: 'POST', body: '{"ok":true}' }))).resolves.toEqual({ ok: true });
    await expect(readJsonObject(new Request('https://example.test', { method: 'POST', body: '{broken' }))).rejects.toMatchObject({ status: 400, code: 'invalid_json' });
    await expect(readJsonObject(new Request('https://example.test', { method: 'POST', body: '[]' }))).rejects.toMatchObject({ status: 400, code: 'invalid_payload' });
    await expect(readJsonObject(new Request('https://example.test', { method: 'POST', body: '{"long":true}', headers: { 'content-length': '999' } }), 10)).rejects.toMatchObject({ status: 413, code: 'request_too_large' });
  });
});
