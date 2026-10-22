import { defaultLocale, normalizeLocale, type SupportedLocale } from './i18n';

export const localeStorageKey = 'freecrm.locale';
export const localeCookieName = 'freecrm_locale';
export const localePreferenceStorageKey = 'freecrm.locale.preference';
export const localePreferenceCookieName = 'freecrm_locale_preference';

export type LocalePreference = {
  locale: SupportedLocale;
  explicit: boolean;
  source: 'storage' | 'cookie' | 'browser' | 'workspace' | 'default';
  updatedAt?: number;
};

export type StoredLocalePreference = { locale: SupportedLocale; updatedAt: number };

function recognizedLocale(value: string | null | undefined): SupportedLocale | null {
  if (!value?.trim()) return null;
  const normalized = normalizeLocale(value);
  // Normalization includes browser aliases such as no/nb and fil/tl. Unknown
  // tags also normalize to English, so only accept that result for English tags.
  if (normalized === defaultLocale && !/^en(?:[-_]|$)/i.test(value.trim())) return null;
  return normalized;
}

function cookieValue(cookies: string, name: string): string | null {
  const cookie = cookies.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch {
    return null;
  }
}

export function localeFromCookie(cookies: string): SupportedLocale | null {
  return recognizedLocale(cookieValue(cookies, localeCookieName));
}

function storedPreference(value: string | null): StoredLocalePreference | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || !('locale' in parsed) || !('updatedAt' in parsed)) return null;
    const locale = typeof parsed.locale === 'string' ? recognizedLocale(parsed.locale) : null;
    return locale && typeof parsed.updatedAt === 'number' && Number.isSafeInteger(parsed.updatedAt) && parsed.updatedAt > 0
      ? { locale, updatedAt: parsed.updatedAt } : null;
  } catch {
    return null;
  }
}

/** Only an explicit choice belongs in storage. Browser detection is a default. */
export function resolveLocalePreference(stored: string | null, cookies: string, browserLanguages: readonly string[], versionedStorage: string | null = null): LocalePreference {
  // Timestamped copies let either successful store win when the other one is
  // readable but refuses writes. Legacy plain-locale keys remain compatible.
  const storagePreference = storedPreference(versionedStorage);
  const cookiePreference = storedPreference(cookieValue(cookies, localePreferenceCookieName));
  if (storagePreference && (!cookiePreference || storagePreference.updatedAt >= cookiePreference.updatedAt)) return { ...storagePreference, explicit: true, source: 'storage' };
  if (cookiePreference) return { ...cookiePreference, explicit: true, source: 'cookie' };
  const storageLocale = recognizedLocale(stored);
  if (storageLocale) return { locale: storageLocale, explicit: true, source: 'storage' };
  const cookieLocale = localeFromCookie(cookies);
  if (cookieLocale) return { locale: cookieLocale, explicit: true, source: 'cookie' };
  for (const language of browserLanguages) {
    const locale = recognizedLocale(language);
    if (locale) return { locale, explicit: false, source: 'browser' };
  }
  return { locale: defaultLocale, explicit: false, source: 'default' };
}

/** A workspace default never replaces the language a person already selected. */
export function applyWorkspaceLocale(preference: LocalePreference, workspaceLocale: string | null | undefined): LocalePreference {
  if (preference.explicit) return preference;
  const locale = recognizedLocale(workspaceLocale);
  return locale ? { locale, explicit: false, source: 'workspace' } : preference;
}

export function localeCookie(locale: SupportedLocale, secure: boolean): string {
  return `${localeCookieName}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function localePreferenceCookie(preference: StoredLocalePreference, secure: boolean): string {
  return `${localePreferenceCookieName}=${encodeURIComponent(JSON.stringify(preference))}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** Keep either successful store authoritative when a browser blocks the other. */
export function persistLocalePreference(locale: SupportedLocale, options: {
  previous: LocalePreference;
  now: number;
  secure: boolean;
  writeStorage: (key: string, value: string) => void;
  removeStorage: (key: string) => void;
  writeCookie: (value: string) => void;
}): StoredLocalePreference {
  const saved = { locale, updatedAt: Math.max(options.now, (options.previous.updatedAt ?? 0) + 1) };
  let versionedStorageSaved = false;
  try { options.writeStorage(localePreferenceStorageKey, JSON.stringify(saved)); versionedStorageSaved = true; } catch {
    try { options.removeStorage(localePreferenceStorageKey); } catch { /* The newer cookie still wins over stale read-only storage. */ }
  }
  if (versionedStorageSaved) {
    try { options.writeStorage(localeStorageKey, locale); } catch { /* Timestamped preference remains authoritative. */ }
  } else {
    try { options.removeStorage(localeStorageKey); } catch { /* Keep the session choice when storage is read-only. */ }
  }
  try { options.writeCookie(localePreferenceCookie(saved, options.secure)); } catch { /* Session or local-storage preference still works. */ }
  try { options.writeCookie(localeCookie(locale, options.secure)); } catch { /* Session preference still works. */ }
  return saved;
}
