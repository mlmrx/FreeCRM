import { describe, expect, it, vi } from 'vitest';

import { LocaleSession } from '@/lib/locale-session';
import { resolveLocalePreference } from '@/lib/locale-preference';
import type { SupportedLocale } from '@/lib/i18n';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const detected = resolveLocalePreference(null, '', ['en-US']);

describe('language session ordering', () => {
  it('waits for a catalog before changing or persisting the active language', async () => {
    const loading = deferred();
    const persist = vi.fn();
    const session = new LocaleSession({ load: () => loading.promise, persist, onChange: vi.fn() });
    const result = session.activate({ locale: 'es-ES', explicit: true, source: 'storage' }, true);
    expect(session.state).toEqual({ locale: 'en-US', pendingLocale: 'es-ES', languageError: null });
    expect(persist).not.toHaveBeenCalled();
    loading.resolve();
    expect(await result).toBe(true);
    expect(session.state).toEqual({ locale: 'es-ES', pendingLocale: null, languageError: null });
    expect(persist).toHaveBeenCalledExactlyOnceWith('es-ES');
  });

  it('ignores a slow initial browser language after a person chooses another language', async () => {
    const initial = deferred();
    const choice = deferred();
    const persist = vi.fn();
    const session = new LocaleSession({ load: (locale) => locale === 'fr-FR' ? initial.promise : choice.promise, persist, onChange: vi.fn() });
    const startup = session.initialize(resolveLocalePreference(null, '', ['fr-FR']));
    const selection = session.activate({ locale: 'es-ES', explicit: true, source: 'storage' }, true);
    choice.resolve();
    await selection;
    initial.resolve();
    expect(await startup).toBe(false);
    expect(session.state.locale).toBe('es-ES');
    expect(persist).toHaveBeenCalledExactlyOnceWith('es-ES');
  });

  it('retains the current language and previous persistence after a failed load, then allows retry', async () => {
    const persist = vi.fn();
    const load = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    const session = new LocaleSession({ load, persist, onChange: vi.fn() });
    await session.activate({ locale: 'es-ES', explicit: true, source: 'storage' }, true);
    expect(await session.activate({ locale: 'fr-FR', explicit: true, source: 'storage' }, true)).toBe(false);
    expect(session.state).toEqual({ locale: 'es-ES', pendingLocale: null, languageError: 'language.loadError' });
    expect(persist).toHaveBeenCalledExactlyOnceWith('es-ES');
    expect(await session.activate({ locale: 'fr-FR', explicit: true, source: 'storage' }, true)).toBe(true);
    expect(session.state).toEqual({ locale: 'fr-FR', pendingLocale: null, languageError: null });
  });

  it('does not surface an obsolete load error after a newer selection succeeds', async () => {
    const slow = deferred();
    const session = new LocaleSession({ load: (locale) => locale === 'fr-FR' ? slow.promise : Promise.resolve(), persist: vi.fn(), onChange: vi.fn() });
    const stale = session.initialize(resolveLocalePreference(null, '', ['fr-FR']));
    await session.activate({ locale: 'ar-SA', explicit: true, source: 'storage' }, true);
    slow.reject(new Error('late network error'));
    expect(await stale).toBe(false);
    expect(session.state).toEqual({ locale: 'ar-SA', pendingLocale: null, languageError: null });
  });

  it('preserves a landing-page preference when workspace bootstrap finishes before initialization', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const persist = vi.fn();
    const session = new LocaleSession({ load, persist, onChange: vi.fn() });
    const saved = resolveLocalePreference('ar-SA', 'freecrm_locale=ar-SA', ['en-US']);
    await session.adoptWorkspace('en-US', saved);
    expect(await session.initialize(detected)).toBe(false);
    expect(await session.adoptWorkspace('fr-FR', detected)).toBe(false);
    expect(session.state.locale).toBe('ar-SA');
    expect(load).toHaveBeenCalledExactlyOnceWith('ar-SA');
    expect(persist).not.toHaveBeenCalled();
  });

  it('adopts workspace defaults only in the absence of an explicit choice', async () => {
    const session = new LocaleSession({ load: async () => undefined, persist: vi.fn(), onChange: vi.fn() });
    await session.initialize(detected);
    await session.adoptWorkspace('de-DE', detected);
    expect(session.state.locale).toBe('de-DE');
    await session.activate({ locale: 'fr-FR', explicit: true, source: 'storage' }, true);
    expect(await session.adoptWorkspace('en-US', detected)).toBe(false);
    expect(session.state.locale).toBe('fr-FR');
  });

  it('restores the same persisted choice on another tab and on reload without writing it back', async () => {
    let stored: SupportedLocale | null = null;
    const persist = vi.fn((locale: SupportedLocale) => { stored = locale; });
    const options = { load: async () => undefined, persist, onChange: vi.fn() };
    const firstTab = new LocaleSession(options);
    const secondTab = new LocaleSession(options);
    await firstTab.initialize(detected);
    await secondTab.initialize(detected);
    await firstTab.activate({ locale: 'ja-JP', explicit: true, source: 'storage' }, true);
    const fromStorageEvent = resolveLocalePreference(stored, '', ['en-US']);
    await secondTab.activate(fromStorageEvent);
    const reloadedTab = new LocaleSession(options);
    await reloadedTab.initialize(resolveLocalePreference(stored, '', ['en-US']));
    await reloadedTab.adoptWorkspace('en-US', detected);
    expect(secondTab.state.locale).toBe('ja-JP');
    expect(reloadedTab.state.locale).toBe('ja-JP');
    expect(persist).toHaveBeenCalledExactlyOnceWith('ja-JP');
  });

  it('keeps a session-only choice over stale external stores but accepts a newer cross-tab preference', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const persist = vi.fn((locale: SupportedLocale) => ({ locale, updatedAt: 101 }));
    const session = new LocaleSession({ load, persist, onChange: vi.fn() });
    await session.initialize({ locale: 'en-US', explicit: true, source: 'cookie', updatedAt: 100 });
    await session.activate({ locale: 'es-ES', explicit: true, source: 'storage' }, true);
    expect(session.preference).toMatchObject({ locale: 'es-ES', updatedAt: 101 });
    expect(await session.sync({ locale: 'en-US', explicit: true, source: 'cookie', updatedAt: 100 })).toBe(false);
    expect(await session.sync({ locale: 'en-US', explicit: true, source: 'storage' })).toBe(false);
    expect(session.state.locale).toBe('es-ES');
    expect(load).toHaveBeenCalledTimes(2);
    load.mockRejectedValueOnce(new Error('Unavailable catalog'));
    expect(await session.activate({ locale: 'ja-JP', explicit: true, source: 'storage' }, true)).toBe(false);
    expect(session.preference).toMatchObject({ locale: 'es-ES', updatedAt: 101 });
    expect(await session.sync({ locale: 'en-US', explicit: true, source: 'cookie', updatedAt: 100 })).toBe(false);
    expect(session.state.locale).toBe('es-ES');
    expect(await session.sync({ locale: 'fr-FR', explicit: true, source: 'storage', updatedAt: 102 })).toBe(true);
    expect(session.state.locale).toBe('fr-FR');
    expect(persist).toHaveBeenCalledExactlyOnceWith('es-ES');
  });
});
