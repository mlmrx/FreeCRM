import { describe, expect, it } from 'vitest';

import { applyWorkspaceLocale, localeCookie, localeFromCookie, localePreferenceCookie, localePreferenceStorageKey, localeStorageKey, persistLocalePreference, resolveLocalePreference } from '@/lib/locale-preference';

describe('persistent language choice', () => {
  it('keeps a language selected on a public page when a workspace loads or refreshes', () => {
    const preference = resolveLocalePreference('es-ES', 'freecrm_locale=es-ES', ['en-US']);
    expect(applyWorkspaceLocale(preference, 'en-US')).toEqual(preference);
    expect(applyWorkspaceLocale(preference, 'fr-FR')).toEqual(preference);
    expect(preference).toMatchObject({ locale: 'es-ES', explicit: true, source: 'storage' });
  });

  it('restores the cookie preference when local storage is unavailable', () => {
    const preference = resolveLocalePreference(null, 'session=opaque; freecrm_locale=ar-SA; other=value', ['en-US']);
    expect(preference).toMatchObject({ locale: 'ar-SA', explicit: true, source: 'cookie' });
    expect(applyWorkspaceLocale(preference, 'en-US').locale).toBe('ar-SA');
  });

  it('preserves the legacy storage-first contract before timestamped preferences exist', () => {
    expect(resolveLocalePreference('fr-FR', 'freecrm_locale=es-ES', ['en-US']).locale).toBe('fr-FR');
  });

  it('restores the newest successful write rather than stale read-only storage or cookies', () => {
    const olderStorage = JSON.stringify({ locale: 'en-US', updatedAt: 100 });
    const newerCookie = localePreferenceCookie({ locale: 'es-ES', updatedAt: 101 }, false);
    expect(resolveLocalePreference('en-US', newerCookie, ['en-US'], olderStorage)).toEqual({ locale: 'es-ES', updatedAt: 101, explicit: true, source: 'cookie' });
    const newerStorage = JSON.stringify({ locale: 'fr-FR', updatedAt: 102 });
    expect(resolveLocalePreference('en-US', newerCookie, ['en-US'], newerStorage)).toEqual({ locale: 'fr-FR', updatedAt: 102, explicit: true, source: 'storage' });
    expect(resolveLocalePreference('en-US', newerCookie, ['en-US'], JSON.stringify({ locale: 'fr-FR', updatedAt: 101 })).source).toBe('storage');
  });

  it('ignores malformed timestamp records and still accepts legacy choices', () => {
    for (const record of ['null', '{', '{}', '{"locale":"es-ES","updatedAt":0}', '{"locale":"unknown","updatedAt":10}', '{"locale":"es-ES","updatedAt":"10"}', '{"locale":"es-ES","updatedAt":1.5}']) {
      expect(resolveLocalePreference('fr-FR', `freecrm_locale_preference=${encodeURIComponent(record)}`, ['en-US'], record).locale).toBe('fr-FR');
    }
  });

  it('uses the cookie after both storage writes and stale-record removal fail', () => {
    const storage = new Map([[localeStorageKey, 'en-US'], [localePreferenceStorageKey, JSON.stringify({ locale: 'en-US', updatedAt: 100 })]]);
    const cookies: string[] = [];
    persistLocalePreference('es-ES', {
      previous: { locale: 'en-US', explicit: true, source: 'storage', updatedAt: 100 }, now: 90, secure: true,
      writeStorage: () => { throw new Error('read-only'); }, removeStorage: () => { throw new Error('read-only'); },
      writeCookie: (value) => { cookies.push(value.split(';')[0]); },
    });
    expect(resolveLocalePreference(storage.get(localeStorageKey)!, cookies.join('; '), ['en-US'], storage.get(localePreferenceStorageKey)!)).toMatchObject({ locale: 'es-ES', updatedAt: 101, source: 'cookie' });
    expect(cookies).toContain('freecrm_locale=es-ES');
  });

  it('removes stale storage when possible and keeps the cookie authoritative over raw legacy storage', () => {
    const storage = new Map([[localeStorageKey, 'en-US'], [localePreferenceStorageKey, JSON.stringify({ locale: 'en-US', updatedAt: 100 })]]);
    const cookies: string[] = [];
    persistLocalePreference('es-ES', {
      previous: { locale: 'en-US', explicit: true, source: 'storage', updatedAt: 100 }, now: 100, secure: false,
      writeStorage: () => { throw new Error('quota'); }, removeStorage: (key) => { storage.delete(key); },
      writeCookie: (value) => { cookies.push(value.split(';')[0]); },
    });
    expect(storage.size).toBe(0);
    expect(resolveLocalePreference('en-US', cookies.join('; '), ['en-US'])).toMatchObject({ locale: 'es-ES', updatedAt: 101, source: 'cookie' });
  });

  it('keeps the new versioned storage when the raw mirror and cookie writes fail', () => {
    const storage = new Map([[localeStorageKey, 'en-US']]);
    persistLocalePreference('fr-FR', {
      previous: { locale: 'es-ES', explicit: true, source: 'cookie', updatedAt: 100 }, now: 100, secure: false,
      writeStorage: (key, value) => { if (key === localeStorageKey) throw new Error('blocked mirror'); storage.set(key, value); },
      removeStorage: (key) => { storage.delete(key); }, writeCookie: () => { throw new Error('cookies blocked'); },
    });
    const oldCookie = `${localePreferenceCookie({ locale: 'es-ES', updatedAt: 100 }, false)}; freecrm_locale=es-ES`;
    expect(resolveLocalePreference(storage.get(localeStorageKey)!, oldCookie, ['en-US'], storage.get(localePreferenceStorageKey)!)).toMatchObject({ locale: 'fr-FR', updatedAt: 101, source: 'storage' });
  });

  it('writes matching timestamped and legacy copies without extending transport scope', () => {
    const storage = new Map<string, string>();
    const cookies: string[] = [];
    expect(persistLocalePreference('ar-SA', {
      previous: { locale: 'en-US', explicit: false, source: 'browser' }, now: 200, secure: true,
      writeStorage: (key, value) => { storage.set(key, value); }, removeStorage: (key) => { storage.delete(key); },
      writeCookie: (value) => { cookies.push(value); },
    })).toEqual({ locale: 'ar-SA', updatedAt: 200 });
    expect(storage.get(localeStorageKey)).toBe('ar-SA');
    expect(JSON.parse(storage.get(localePreferenceStorageKey)!)).toEqual({ locale: 'ar-SA', updatedAt: 200 });
    expect(cookies).toEqual([localePreferenceCookie({ locale: 'ar-SA', updatedAt: 200 }, true), localeCookie('ar-SA', true)]);
  });

  it('checks all browser languages before falling back to English', () => {
    expect(resolveLocalePreference(null, '', ['zz-ZZ', 'fr-CA', 'es-ES'])).toEqual({ locale: 'fr-FR', explicit: false, source: 'browser' });
    expect(resolveLocalePreference(null, '', ['zz-ZZ'])).toEqual({ locale: 'en-US', explicit: false, source: 'default' });
  });

  it('accepts browser language aliases and preserves Chinese script preferences', () => {
    expect(resolveLocalePreference(null, '', ['no-NO']).locale).toBe('nb-NO');
    expect(resolveLocalePreference(null, '', ['fil-PH']).locale).toBe('tl-PH');
    expect(resolveLocalePreference(null, '', ['zh-Hant-HK']).locale).toBe('zh-TW');
    expect(resolveLocalePreference(null, '', ['zh-Hans-SG']).locale).toBe('zh-CN');
  });

  it('uses the workspace default only before a person explicitly selects a language', () => {
    const detected = resolveLocalePreference(null, '', ['en-US']);
    expect(applyWorkspaceLocale(detected, 'de-DE')).toEqual({ locale: 'de-DE', explicit: false, source: 'workspace' });
    expect(applyWorkspaceLocale(detected, null)).toEqual(detected);
    expect(applyWorkspaceLocale(detected, 'not-a-locale')).toEqual(detected);
  });

  it('ignores invalid preferences and malformed cookies', () => {
    expect(localeFromCookie('freecrm_locale=%E0%A4%A')).toBeNull();
    expect(localeFromCookie('freecrm_locale=unknown')).toBeNull();
    expect(resolveLocalePreference('unknown', 'freecrm_locale=es-ES', ['fr-FR']).locale).toBe('es-ES');
    expect(resolveLocalePreference(null, 'other_freecrm_locale=es-ES', ['de-DE']).locale).toBe('de-DE');
  });

  it('writes an origin-wide persistent cookie with appropriate transport protection', () => {
    expect(localeCookie('es-ES', true)).toBe('freecrm_locale=es-ES; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
    expect(localeCookie('ar-SA', false)).toBe('freecrm_locale=ar-SA; Path=/; Max-Age=31536000; SameSite=Lax');
  });
});
