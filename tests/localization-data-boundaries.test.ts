import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installUiCatalog, translateUi } from '@/lib/ui-i18n';
import { LocalizedAttributes, T } from '@/app/localized-text';
import { BrainMessageCard, brainSourceChangePrompt, brainSourceContextNotice } from '@/app/brain/brain-workspace';
import CsvImporter from '@/app/csv-importer';
import { ToastNotice } from '@/app/crm-app';
import { SignalCard } from '@/app/today/today-workspace';
import type { AdaptiveSignal } from '@/lib/adaptive-types';
import type { BrainMessage } from '@/lib/brain-types';

vi.mock('@/app/i18n-provider', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/app/i18n-provider')>(),
  useI18n: () => ({ locale: 'es-ES', text: (source: string, values?: Record<string, string | number>) => translateUi('es-ES', source, values) }),
}));

beforeEach(() => installUiCatalog('es-ES', {
  Close: 'Cerrar',
  Contacts: 'Contactos',
  Companies: 'Empresas',
  Leads: 'Clientes potenciales',
  'Open the evidence': 'Abrir la evidencia',
  Useful: 'Útil',
  'Recorded fact': 'Hecho registrado',
  Relationships: 'relaciones',
  'Delete “{title}”? Its search index and links will also be removed.': '¿Eliminar «{title}»? Se eliminarán también su índice y sus enlaces.',
  [brainSourceContextNotice]: 'Se eliminarán las conversaciones que usaron esta fuente. Las copias externas se conservan.',
  'Export first if you need a copy. This cannot be undone.': 'Exporta primero si necesitas una copia. No se puede deshacer.',
  'Type {confirmation} to continue.': 'Escribe {confirmation} para continuar.',
}));
afterEach(() => installUiCatalog('es-ES', {}));

describe('localized UI data boundaries', () => {
  it('does not translate an already-formatted toast again after a language change', () => {
    installUiCatalog('es-ES', { 'Agent paused.': 'El agente se detuvo.' });
    const message = translateUi('en-US', '{name} paused.', { name: 'Agent' });
    const html = renderToStaticMarkup(createElement(ToastNotice, { message, tone: 'success' }));
    expect(html).toContain('Agent paused.');
    expect(html).not.toContain('agente');
  });

  it('translates controls while preserving customer messages, citation titles and evidence that match a UI message', () => {
    const entry: BrainMessage = { id: 'message-1', role: 'assistant', mode: 'search', content: 'Close', createdAt: '2026-09-11T00:00:00Z', citations: [{ id: 'citation-1', sourceId: 'source-1', title: 'Close', text: 'Close', ordinal: 0, version: 1 }] };
    const html = renderToStaticMarkup(createElement(BrainMessageCard, { entry, onSource: () => undefined }));
    expect(html).toContain('Abrir la evidencia');
    expect(html.match(/Close/g)).toHaveLength(3);
    expect(html).not.toContain('Cerrar');
  });

  it('keeps data-derived signal wording and evidence verbatim while translating signal controls', () => {
    const signal: AdaptiveSignal = { id: 'signal-1', kind: 'commitment', topic: 'relationships', title: 'Close', detail: 'Close', why: 'Close', certainty: 'recorded', score: 1, evidence: [{ kind: 'source', id: 'source-1', title: 'Close', excerpt: '<script>Close</script>', url: '', version: 1, observedAt: '2026-09-11T00:00:00Z' }], fingerprint: 'v1', dueAt: null, state: 'new', snoozedUntil: null, suggestedTask: null };
    const html = renderToStaticMarkup(createElement(SignalCard, { signal, disabled: false, onFeedback: () => undefined, onFollowup: () => undefined }));
    expect(html).toContain('Útil');
    expect(html).toContain('Hecho registrado');
    expect(html).toContain('relaciones');
    expect(html.match(/Close/g)).toHaveLength(5);
    expect(html).toContain('&lt;script&gt;Close&lt;/script&gt;');
    expect(html).not.toContain('Cerrar');
    expect(html).not.toContain('<script>');
  });

  it('preserves backend option values when record type labels change', () => {
    const html = renderToStaticMarkup(createElement(CsvImporter, { refresh: async () => null, notify: () => undefined }));
    expect(html).toContain('value="contact"');
    expect(html).toContain('>Contactos</option>');
    expect(html).toContain('value="company">Empresas</option>');
    expect(html).toContain('value="lead">Clientes potenciales</option>');
    expect(html).not.toContain('value="Contactos"');
  });

  it('only localizes presentation attributes, preserving identifiers, input values and styling', () => {
    // eslint-disable-next-line react/no-children-prop -- Required component props must include the child for this createElement test.
    const html = renderToStaticMarkup(createElement(LocalizedAttributes, { names: ['title', 'value', 'className', 'id'], children: createElement('input', { title: 'Close', value: 'Close', className: 'Close', id: 'Close', readOnly: true }) }));
    expect(html).toContain('title="Cerrar"');
    expect(html).toContain('value="Close"');
    expect(html).toContain('class="Close"');
    expect(html).toContain('id="Close"');
  });

  it('preserves literal confirmation tokens and untrusted source titles during interpolation', () => {
    const html = renderToStaticMarkup(createElement(T, { text: 'Type {confirmation} to continue.', values: { confirmation: 'REVOKE' } }));
    expect(html).toBe('Escribe REVOKE para continuar.');
    const prompt = brainSourceChangePrompt('delete', 'Close', (source, values) => translateUi('es-ES', source, values));
    expect(prompt).toContain('¿Eliminar «Close»?');
    expect(prompt).toContain('No se puede deshacer.');
    expect(prompt).not.toContain('Cerrar');
  });
});
