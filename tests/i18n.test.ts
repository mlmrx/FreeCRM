import { describe, expect, it } from 'vitest';

import { languageCatalog, localeDirection, normalizeLocale, translate } from '@/lib/i18n';

describe('multilingual workspace support', () => {
  it('normalizes exact and regional browser locales into the supported catalog', () => {
    expect(normalizeLocale('es-ES')).toBe('es-ES');
    expect(normalizeLocale('es-MX')).toBe('es-ES');
    expect(normalizeLocale('ar-EG')).toBe('ar-SA');
    expect(normalizeLocale('unknown')).toBe('en-US');
    expect(new Set(languageCatalog.map((language) => language.locale)).size).toBe(languageCatalog.length);
  });

  it('translates core navigation and interpolates workspace values', () => {
    expect(translate('es-ES', 'nav.home')).toBe('Inicio');
    expect(translate('fr-FR', 'dashboard.weighted', { amount: '1 200 €' })).toContain('1 200 €');
    expect(translate('de-DE', 'module.opportunity')).toBe('Verkaufschancen');
    expect(translate('pt-BR', 'workspace.search')).toContain('registros');
    expect(translate('pt-BR', 'landing.customers')).toBe('Seus clientes.');
    expect(translate('de-DE', 'landing.data')).toBe('Deine Daten.');
    expect(translate('ar-SA', 'dashboard.focusBody')).toContain('مساحة عمل واحدة');
  });

  it('supports major writing systems and all four right-to-left languages', () => {
    expect(languageCatalog.length).toBe(54);
    for (const locale of ['ar-SA', 'ur-PK', 'he-IL', 'fa-IR']) expect(localeDirection(locale)).toBe('rtl');
    expect(localeDirection('en-US')).toBe('ltr');
    expect(localeDirection('fr-FR')).toBe('ltr');
    for (const locale of ['hi-IN', 'bn-BD', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'sw-KE', 'am-ET', 'id-ID', 'te-IN']) expect(normalizeLocale(locale)).toBe(locale);
  });
});
