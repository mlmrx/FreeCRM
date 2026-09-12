import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CsvImporter from '@/app/csv-importer';
import { GET } from '@/app/templates/import/[file]/route';
import { csvImportTemplates, csvTemplateFields, csvTemplateHref, csvTemplateText } from '@/lib/csv-import-templates';
import { prepareCsvImport } from '@/server/csv-import';

describe('public synthetic CSV import templates', () => {
  it('covers every canonical field once and produces valid preview rows without custom data', () => {
    expect(csvTemplateFields).toEqual(['name', 'firstName', 'lastName', 'email', 'phone', 'companyName', 'status', 'source', 'tags']);
    expect(new Set(csvTemplateFields).size).toBe(csvTemplateFields.length);
    expect(csvImportTemplates.map((template) => template.objectType)).toEqual(['contact', 'company', 'lead']);
    for (const template of csvImportTemplates) {
      const csv = csvTemplateText(template);
      const preview = prepareCsvImport({ objectType: template.objectType, csv });
      expect(preview.errors).toEqual([]);
      expect(preview.columns).toEqual(csvTemplateFields);
      expect(Object.keys(preview.mapping).sort()).toEqual([...csvTemplateFields].sort());
      expect(preview.records).toHaveLength(2);
      expect(preview.preview.map((row) => row.name)).toEqual(template.rows.map((row) => row.name));
      for (const row of template.rows) for (const value of Object.values(row)) {
        expect(value).not.toMatch(/^\s*[=+\-@\t\r]/);
        expect(value).not.toMatch(/https?:\/\/|mailto:|HYPERLINK|<script|\u0000/i);
      }
      expect(template.rows.every((row) => row.email.endsWith('@example.test'))).toBe(true);
      expect(csv).toMatch(/\r\n$/);
    }
  });

  it('serves exact UTF-8 attachments without reflecting request data', async () => {
    for (const template of csvImportTemplates) {
      const response = await GET(new Request(`https://example.test${csvTemplateHref(template.filename)}?workspaceId=ignored`), { params: Promise.resolve({ file: template.filename }) });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
      expect(response.headers.get('content-disposition')).toBe(`attachment; filename="${template.filename}"`);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      const bytes = await response.arrayBuffer();
      expect(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toBe(csvTemplateText(template));
    }
  });

  it('rejects arbitrary paths and header-injection filenames', async () => {
    for (const file of ['../../.env.local', 'constructor', 'unknown.csv', 'freecrm-contacts-template.csv\r\nX-Injected: true']) {
      const response = await GET(new Request('https://example.test/templates/import/unknown.csv'), { params: Promise.resolve({ file }) });
      expect(response.status).toBe(404);
      expect(response.headers.get('content-disposition')).toBeNull();
      expect(await response.text()).toBe('Template not found.');
    }
  });

  it('links all templates beside the preview-first importer with clear download names', () => {
    const html = renderToStaticMarkup(createElement(CsvImporter, { refresh: async () => null, notify: () => undefined }));
    for (const template of csvImportTemplates) {
      expect(html).toContain(`href="${csvTemplateHref(template.filename)}"`);
      expect(html).toContain(`download="${template.filename}"`);
      expect(html).toContain(`aria-label="Download fictional ${template.label.toLowerCase()} CSV template"`);
    }
    expect(html).toContain('Preview does not write records.');
    expect(html.indexOf('csv-template-title')).toBeLessThan(html.indexOf('csv-import-form'));
    expect(html).toContain('/blob/main/docs/CSV_IMPORT.md');
  });
});
