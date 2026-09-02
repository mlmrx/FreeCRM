import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import CsvImporter from '@/app/csv-importer';

const root = process.cwd();
const componentSource = readFileSync(join(root, 'app', 'csv-importer.tsx'), 'utf8');
const workspaceSource = readFileSync(join(root, 'app', 'crm-app.tsx'), 'utf8');
const css = readFileSync(join(root, 'app', 'globals.css'), 'utf8');

describe('workspace CSV import UI', () => {
  it('starts as an accessible preview-first file and text workflow', () => {
    const markup = renderToStaticMarkup(createElement(CsvImporter, { refresh: async () => null, notify: () => undefined }));

    expect(markup).toContain('id="csv-import-title"');
    expect(markup).toContain('type="file"');
    expect(markup).toContain('accept=".csv,text/csv,text/plain"');
    expect(markup).toContain('id="csv-object-type"');
    expect(markup).toContain('id="csv-import-text"');
    expect(markup).toContain('Preview import');
    expect(markup).toContain('Preview first. No partial imports.');
    expect(markup).not.toContain('Import 0 records');
  });

  it('keeps CSV separate from the webhook simulator and refreshes after an explicit commit', () => {
    expect(workspaceSource).toContain('<CsvImporter refresh={refreshAfterCommittedImport} notify={notify} />');
    expect(workspaceSource).toContain("refresh(undefined, 'preserve')");
    expect(workspaceSource).toContain("referenceConnectors.filter((definition) => definition.key === 'webhook-simulator')");
    expect(workspaceSource).toContain('Webhook simulation is isolated from file import.');
    expect(componentSource).toContain('const result = await previewCsvImport(csv, objectType, mapping);');
    expect(componentSource).toContain('result = await commitCsvImport(csv, objectType, mapping);');
    expect(componentSource).toContain('const refreshed = await refresh();');
    expect(componentSource.indexOf('setReceipt(result);')).toBeLessThan(componentSource.indexOf('const refreshed = await refresh();'));
    expect(componentSource).toContain('Do not import the same file again.');
    expect(componentSource).toContain('preview.invalidRows > 0');
    expect(componentSource).toContain('same idempotency key');
    expect(componentSource.indexOf('setReceipt(result);')).toBeLessThan(componentSource.indexOf('const refreshed = await refresh();'));
    expect(componentSource).toContain('Import succeeded, but the workspace view did not refresh.');
    expect(componentSource).toContain('Do not import the same file again.');
  });

  it('exposes mapping, row errors, a labeled preview table, and small-screen reflow', () => {
    expect(componentSource).toContain('<legend>Optional field mappings</legend>');
    expect(componentSource).toContain('role="alert"');
    expect(componentSource).toContain('aria-live="polite"');
    expect(componentSource).toContain('aria-label="First valid CSV rows. Scroll horizontally for every field."');
    expect(componentSource).toContain('<caption>First {preview.preview.length} valid');
    expect(css).toContain('.csv-import-form input[type=file],.csv-import-form select,.csv-import-form textarea { width: 100%; min-height: 44px;');
    expect(css).toContain('.csv-import-source,.csv-mapping-fields > div { grid-template-columns: 1fr; }');
    expect(css).toContain('.csv-import-actions button,.csv-commit-bar button { width: 100%; }');
    expect(css).toContain('.csv-preview-table { overflow-x: auto;');
  });
});
