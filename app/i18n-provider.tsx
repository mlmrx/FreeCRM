'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { defaultLocale, languageCatalog, localeDirection, normalizeLocale, translate, type SupportedLocale, type TranslationKey } from '@/lib/i18n';

const storageKey = 'freecrm.locale';
const cookieName = 'freecrm_locale';

type I18nContextValue = {
  locale: SupportedLocale;
  direction: 'ltr' | 'rtl';
  setLocale: (locale: SupportedLocale) => void;
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string;
};

const defaultContext: I18nContextValue = {
  locale: defaultLocale,
  direction: 'ltr',
  setLocale: () => undefined,
  t: (key, variables) => translate(defaultLocale, key, variables),
};

const I18nContext = createContext<I18nContextValue>(defaultContext);

function browserLocale(): SupportedLocale {
  if (typeof window === 'undefined') return defaultLocale;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) return normalizeLocale(stored);
  } catch {
    // Storage can be unavailable in hardened browser contexts; language still
    // works for the current session and the workspace remains authoritative.
  }
  return normalizeLocale(window.navigator.languages?.[0] ?? window.navigator.language);
}

export default function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(defaultLocale);

  const setLocale = useCallback((next: SupportedLocale) => {
    const normalized = normalizeLocale(next);
    setLocaleState(normalized);
    try { window.localStorage.setItem(storageKey, normalized); } catch { /* session-only fallback */ }
    document.cookie = `${cookieName}=${encodeURIComponent(normalized)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setLocale(browserLocale()));
    return () => window.cancelAnimationFrame(frame);
  }, [setLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    direction: localeDirection(locale),
    setLocale,
    t: (key, variables) => translate(locale, key, variables),
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export function LanguageSelect({ className = '', disabled = false, onChange }: { className?: string; disabled?: boolean; onChange?: (locale: SupportedLocale) => void | Promise<void> }) {
  const { locale, setLocale, t } = useI18n();
  return <label className={`language-select ${className}`.trim()}>
    <span>{t('language.label')}</span>
    <select
      aria-label={t('language.label')}
      value={locale}
      disabled={disabled}
      onChange={(event) => {
        const next = normalizeLocale(event.target.value);
        setLocale(next);
        void onChange?.(next);
      }}
    >
      {languageCatalog.map((language) => <option key={language.locale} value={language.locale}>{language.nativeName}</option>)}
    </select>
  </label>;
}
