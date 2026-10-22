import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import I18nProvider, { GlobalLanguageSelect, useI18n } from '@/app/i18n-provider';
import { languageCatalog } from '@/lib/i18n';

afterEach(() => vi.unstubAllGlobals());

function LanguageSnapshot() {
  const { locale, direction, text } = useI18n();
  return createElement('p', { lang: locale, dir: direction }, text('Your relationships'));
}

describe('language provider server rendering', () => {
  it('renders the same initial language without reading browser storage or fetching', () => {
    const fetch = vi.fn();
    const storage = vi.fn(() => { throw new Error('Server rendering read browser storage'); });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('window', { get localStorage() { return storage(); } });
    const output = renderToStaticMarkup(createElement(I18nProvider, null, createElement(LanguageSnapshot)));
    expect(output).toBe('<p lang="en-US" dir="ltr">Your relationships</p>');
    expect(storage).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('offers every catalog language in the shared searchable control without loading every catalog', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const output = renderToStaticMarkup(createElement(I18nProvider, null, createElement(GlobalLanguageSelect)));
    expect(output).toContain('class="global-language-control"');
    expect(output).toContain('aria-haspopup="dialog"');
    expect(output).toContain('type="search"');
    expect(output.match(/class="language-option"/g)).toHaveLength(languageCatalog.length);
    expect(output).toContain('العربية');
    expect(output).toContain('日本語');
    expect(output).toContain('data-language-control="global"');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not hide an open global modal when workspace bootstrap mounts an inline chooser', () => {
    const css = readFileSync(new URL('../app/language-selector.css', import.meta.url), 'utf8');
    expect(css).toContain("body:has([data-language-control='inline']) .global-language-control:not(:has(dialog[open])) { display: none; }");
  });
});
