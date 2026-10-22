import { defaultLocale, type SupportedLocale } from './i18n';
import { applyWorkspaceLocale, type LocalePreference, type StoredLocalePreference } from './locale-preference';

export type LocaleSessionState = {
  locale: SupportedLocale;
  pendingLocale: SupportedLocale | null;
  languageError: string | null;
};

export const initialLocaleSessionState: LocaleSessionState = {
  locale: defaultLocale,
  pendingLocale: null,
  languageError: null,
};

/** Coordinates catalog loads so an older request cannot replace a newer choice. */
export class LocaleSession {
  private request = 0;
  private currentPreference: LocalePreference | null = null;
  private appliedPreference: LocalePreference | null = null;
  private currentState: LocaleSessionState = initialLocaleSessionState;

  constructor(private readonly options: {
    load: (locale: SupportedLocale) => Promise<void>;
    persist: (locale: SupportedLocale) => StoredLocalePreference | void;
    onChange: (state: LocaleSessionState) => void;
  }) {}

  get preference(): LocalePreference | null { return this.currentPreference; }
  get state(): LocaleSessionState { return this.currentState; }

  private publish(next: LocaleSessionState) {
    this.currentState = next;
    this.options.onChange(next);
  }

  initialize(preference: LocalePreference): Promise<boolean> {
    return this.currentPreference === null ? this.activate(preference) : Promise.resolve(false);
  }

  adoptWorkspace(locale: string | null | undefined, browserPreference: LocalePreference): Promise<boolean> {
    const current = this.currentPreference ?? browserPreference;
    const next = applyWorkspaceLocale(current, locale);
    return this.currentPreference === null || next !== current ? this.activate(next) : Promise.resolve(false);
  }

  sync(preference: LocalePreference): Promise<boolean> {
    // A session-only choice survives refocus if both stores retained older data.
    if ((preference.updatedAt ?? 0) < (this.currentPreference?.updatedAt ?? 0)) return Promise.resolve(false);
    return this.activate(preference);
  }

  async activate(next: LocalePreference, persist = false): Promise<boolean> {
    const request = ++this.request;
    this.currentPreference = next;
    this.publish({ ...this.currentState, pendingLocale: next.locale, languageError: null });
    try {
      await this.options.load(next.locale);
      if (request !== this.request) return false;
      if (persist) {
        const saved = this.options.persist(next.locale);
        if (saved) this.currentPreference = { ...next, ...saved };
      }
      this.appliedPreference = this.currentPreference;
      this.publish({ locale: next.locale, pendingLocale: null, languageError: null });
      return true;
    } catch {
      if (request !== this.request) return false;
      this.currentPreference = this.appliedPreference;
      this.publish({ ...this.currentState, pendingLocale: null, languageError: 'language.loadError' });
      return false;
    }
  }
}
