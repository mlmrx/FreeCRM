import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/i18n-provider', () => ({ useI18n: () => ({ locale: 'es-ES' }) }));

import { LocalizedAttributes, T } from '@/app/localized-text';
import { installUiCatalog } from '@/lib/ui-i18n';

describe('explicit product text rendering', () => {
  it('translates only marked product copy while preserving customer record content', () => {
    installUiCatalog('es-ES', { Contacts: 'Contactos', 'Private client': 'This value must never be substituted' });
    const output = renderToStaticMarkup(createElement('section', null,
      createElement('h2', null, createElement(T, { text: 'Contacts' })),
      createElement('p', null, 'Private client'),
    ));
    expect(output).toBe('<section><h2>Contactos</h2><p>Private client</p></section>');
  });

  it('preserves React links and escapes customer values in translated messages', () => {
    installUiCatalog('es-ES', { 'Open {record}': 'Abrir {record}' });
    const output = renderToStaticMarkup(createElement(T, { text: 'Open {record}', values: { record: createElement('a', { href: '/workspace?record=1' }, 'Jane <script> & Co') } }));
    expect(output).toBe('Abrir <a href="/workspace?record=1">Jane &lt;script&gt; &amp; Co</a>');
  });

  it('translates only opted-in presentation attributes and leaves input values intact', () => {
    installUiCatalog('es-ES', { Name: 'Nombre', 'Customer name': 'Nombre del cliente', 'Private client': 'Must not replace input data' });
    // The component requires a typed ReactElement; this test suite uses .ts without JSX.
    // eslint-disable-next-line react/no-children-prop
    const output = renderToStaticMarkup(createElement(LocalizedAttributes, {
      names: ['aria-label', 'placeholder'],
      children: createElement('input', { 'aria-label': 'Name', placeholder: 'Customer name', value: 'Private client', readOnly: true }),
    }));
    expect(output).toContain('aria-label="Nombre"');
    expect(output).toContain('placeholder="Nombre del cliente"');
    expect(output).toContain('value="Private client"');
    expect(output).not.toContain('Must not replace input data');
  });
});
