import { describe, expect, it } from 'vitest';
import { filterDemoFeatures } from '@/lib/demo-content';
import { searchTourSections } from '@/lib/tour-model';

describe('translated public feature search', () => {
  const dictionary: Record<string, string> = { Invoices: 'Facturas', 'People & companies': 'Personas y empresas', Relationships: 'Relaciones' };
  const text = (source: string) => dictionary[source] ?? source;

  it('finds translated demo names without changing stable categories or destinations', () => {
    const results = filterDemoFeatures('facturas', 'CRM modules', text);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: 'Invoices', route: '/workspace?view=invoice', group: 'CRM modules' });
    expect(filterDemoFeatures('facturas', 'Second brain', text)).toHaveLength(0);
  });

  it('accepts both translated and original tour labels', () => {
    expect(searchTourSections('personas', text).some((section) => section.id === 'relationships')).toBe(true);
    expect(searchTourSections('People', text).some((section) => section.id === 'relationships')).toBe(true);
  });
});
