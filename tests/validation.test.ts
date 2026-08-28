import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { getRequestIdentity } from '@/server/request-context';
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
  it('uses the trusted gateway identity in hosted mode and a fixed owner locally', () => {
    delete env.FREE_CRM_LOCAL_MODE;
    const hosted = getRequestIdentity(new Request('https://free-crm.example.test', {
      headers: {
        'oai-authenticated-user-id': 'hosted-user',
        'oai-authenticated-user-email': 'owner@example.test',
        'oai-authenticated-user-full-name': 'Ada%20Lovelace',
        'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
      },
    }));
    expect(hosted).toMatchObject({ userId: 'hosted-user', email: 'owner@example.test', displayName: 'Ada Lovelace' });

    env.FREE_CRM_LOCAL_MODE = 'true';
    const local = getRequestIdentity(new Request('http://localhost:3477', {
      headers: {
        'oai-authenticated-user-id': 'spoofed-user',
        'oai-authenticated-user-email': 'spoofed@example.test',
      },
    }));
    expect(local).toMatchObject({ userId: 'local-development-user', email: 'owner@free-crm.local' });
    delete env.FREE_CRM_LOCAL_MODE;
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
