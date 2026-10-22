'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';

import { defaultLocale, languageCatalog, localeDirection, normalizeLocale, translate, type SupportedLocale, type TranslationKey } from '@/lib/i18n';
import { localePreferenceStorageKey, localeStorageKey, persistLocalePreference, resolveLocalePreference, type LocalePreference } from '@/lib/locale-preference';
import { initialLocaleSessionState, LocaleSession } from '@/lib/locale-session';
import { loadUiCatalog, translateUi } from '@/lib/ui-i18n';

type I18nContextValue = {
  locale: SupportedLocale;
  direction: 'ltr' | 'rtl';
  setLocale: (locale: SupportedLocale) => Promise<boolean>;
  adoptWorkspaceLocale: (locale: string | null | undefined) => void;
  pendingLocale: SupportedLocale | null;
  languageError: string | null;
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string;
  text: (source: string, variables?: Record<string, string | number>) => string;
};

const defaultContext: I18nContextValue = {
  locale: defaultLocale,
  direction: 'ltr',
  setLocale: async () => false,
  adoptWorkspaceLocale: () => undefined,
  pendingLocale: null,
  languageError: null,
  t: (key, variables) => translate(defaultLocale, key, variables),
  text: (source, variables) => translateUi(defaultLocale, source, variables),
};

const I18nContext = createContext<I18nContextValue>(defaultContext);

function browserPreference(): LocalePreference {
  let stored: string | null = null;
  let versionedStorage: string | null = null;
  let cookies = '';
  try { stored = window.localStorage.getItem(localeStorageKey); } catch { /* Cookie or session fallback. */ }
  try { versionedStorage = window.localStorage.getItem(localePreferenceStorageKey); } catch { /* Cookie or session fallback. */ }
  try { cookies = document.cookie; } catch { /* Some sandboxed browsers also block cookies. */ }
  return resolveLocalePreference(stored, cookies, window.navigator.languages?.length ? window.navigator.languages : [window.navigator.language], versionedStorage);
}

export default function I18nProvider({ children }: { children: ReactNode }) {
  // The initial render matches the server. Browser settings are adopted after hydration.
  const [{ locale, pendingLocale, languageError }, setSessionState] = useState(initialLocaleSessionState);
  const [session] = useState(() => new LocaleSession({
    load: loadUiCatalog,
    persist: (next) => {
      return persistLocalePreference(next, {
        previous: browserPreference(),
        now: Date.now(),
        secure: window.location.protocol === 'https:',
        writeStorage: (key, value) => window.localStorage.setItem(key, value),
        removeStorage: (key) => window.localStorage.removeItem(key),
        writeCookie: (value) => { document.cookie = value; },
      });
    },
    onChange: setSessionState,
  }));

  const setLocale = useCallback((next: SupportedLocale) => session.activate({ locale: normalizeLocale(next), explicit: true, source: 'storage' }, true), [session]);

  const adoptWorkspaceLocale = useCallback((workspaceLocale: string | null | undefined) => {
    // A fast bootstrap may finish before initialization. Resolve the browser
    // preference here too so a saved language cannot lose that race.
    void session.adoptWorkspace(workspaceLocale, browserPreference());
  }, [session]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void session.initialize(browserPreference());
    });
    const syncPreference = (event: StorageEvent) => {
      if (event.key === localeStorageKey || event.key === localePreferenceStorageKey || event.key === null) void session.sync(browserPreference());
    };
    const syncBrowserLanguage = () => {
      if (!session.preference || session.preference.source === 'browser' || session.preference.source === 'default') void session.activate(browserPreference());
    };
    const syncCookiePreference = () => {
      if (session.state.pendingLocale !== null) return;
      const latest = browserPreference();
      if (latest.explicit && latest.locale !== session.preference?.locale) void session.sync(latest);
    };
    window.addEventListener('storage', syncPreference);
    window.addEventListener('languagechange', syncBrowserLanguage);
    window.addEventListener('focus', syncCookiePreference);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('storage', syncPreference);
      window.removeEventListener('languagechange', syncBrowserLanguage);
      window.removeEventListener('focus', syncCookiePreference);
    };
  }, [session]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    direction: localeDirection(locale),
    setLocale,
    adoptWorkspaceLocale,
    pendingLocale,
    languageError,
    t: (key, variables) => translate(locale, key, variables),
    text: (source, variables) => translateUi(locale, source, variables),
  }), [locale, setLocale, adoptWorkspaceLocale, pendingLocale, languageError]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

function searchText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

export function LanguageSelect({ className = '', disabled = false, onChange, global = false }: { className?: string; disabled?: boolean; onChange?: (locale: SupportedLocale) => void | Promise<void>; global?: boolean }) {
  const { locale, setLocale, pendingLocale, languageError, t } = useI18n();
  const [query, setQuery] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const restoreFocusPending = useRef(false);
  const headingId = useId();
  const resultsId = useId();
  const currentLanguage = languageCatalog.find((language) => language.locale === locale) ?? languageCatalog[0];
  const filteredLanguages = languageCatalog.filter((language) => searchText(`${language.name} ${language.nativeName} ${language.locale}`).includes(searchText(query.trim())));
  const restoreFocus = useCallback(() => {
    const own = trigger.current;
    const target = own && !own.disabled && own.getClientRects().length > 0 ? own
      : [...document.querySelectorAll<HTMLButtonElement>('[data-language-control="inline"] .language-trigger:not(:disabled)')].find((button) => button.getClientRects().length > 0);
    if (target) { target.focus(); restoreFocusPending.current = false; }
  }, []);
  useEffect(() => {
    if (disabled || !restoreFocusPending.current || dialog.current?.open) return;
    const frame = window.requestAnimationFrame(() => {
      if (document.activeElement === document.body || document.activeElement === trigger.current) restoreFocus();
      else restoreFocusPending.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [disabled, restoreFocus]);

  return <div className={`language-select ${className}`.trim()} data-language-control={global ? 'global' : 'inline'}>
    <span>{t('language.label')}</span>
    <button
      ref={trigger}
      type="button"
      className="language-trigger"
      aria-label={`${t('language.label')}: ${currentLanguage.nativeName}`}
      aria-haspopup="dialog"
      disabled={disabled}
      onClick={() => { setQuery(''); dialog.current?.showModal(); searchInput.current?.focus(); }}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18M12 3c-5 5-5 13 0 18" /></svg>
      <bdi lang={currentLanguage.locale}>{currentLanguage.nativeName}</bdi>
      <span aria-hidden="true">⌄</span>
    </button>
    <dialog ref={dialog} className="language-dialog" aria-labelledby={headingId} onClose={() => { restoreFocusPending.current = true; restoreFocus(); }} onKeyDownCapture={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dialog.current?.close(); } }} onClick={(event) => { if (event.target === dialog.current) dialog.current.close(); }}>
      <div className="language-dialog-content">
        <div className="language-dialog-heading"><h2 id={headingId}>{t('language.choose')}</h2><button type="button" aria-label={t('common.close')} className="language-close" onClick={() => dialog.current?.close()}>×</button></div>
        <p className="language-notice">{t('language.notice')}</p>
        <input ref={searchInput} className="language-search" type="search" value={query} placeholder={t('language.search')} aria-label={t('language.search')} aria-controls={resultsId} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); } }} onChange={(event) => setQuery(event.target.value)} />
        {pendingLocale && <p role="status" className="language-feedback">{t('language.loading')}</p>}
        {languageError && <p role="alert" className="language-feedback language-error">{t('language.loadError')}</p>}
        <ul id={resultsId} className="language-options" aria-label={t('language.label')} aria-busy={pendingLocale !== null}>
          {filteredLanguages.map((language) => <li key={language.locale}><button
            type="button"
            className="language-option"
            aria-pressed={locale === language.locale}
            disabled={pendingLocale !== null}
            onClick={async () => {
              if (!await setLocale(language.locale)) return;
              dialog.current?.close();
              void onChange?.(language.locale);
            }}
          ><span><bdi lang={language.locale}>{language.nativeName}</bdi><small lang="en">{language.name}</small></span><span aria-hidden="true">{locale === language.locale ? '✓' : ''}</span></button></li>)}
        </ul>
        {filteredLanguages.length === 0 && <p role="status" className="language-empty">{t('language.noResults')}</p>}
      </div>
    </dialog>
  </div>;
}

/** Public pages and locked workspace states also have a language chooser. */
export function GlobalLanguageSelect() {
  return <div className="global-language-control"><LanguageSelect global /></div>;
}
