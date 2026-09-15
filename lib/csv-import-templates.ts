import type { CsvImportField, CsvImportObjectType } from './csv-import-client';

/** Public, fictional examples only. Never populate these from a workspace. */
export const csvTemplateFields = ['name', 'firstName', 'lastName', 'email', 'phone', 'companyName', 'status', 'source', 'tags'] as const satisfies readonly CsvImportField[];

type Template = {
  objectType: CsvImportObjectType;
  label: string;
  filename: string;
  rows: readonly Readonly<Record<CsvImportField, string>>[];
};

export const csvImportTemplates: readonly Template[] = [
  {
    objectType: 'contact', label: 'Contacts', filename: 'freecrm-contacts-template.csv',
    rows: [
      { name: 'Nora Vale', firstName: 'Nora', lastName: 'Vale', email: 'nora@example.test', phone: '2025550101', companyName: 'Fictional Cedar Studio', status: 'active', source: 'Template example', tags: 'example;fictional' },
      { name: 'Milo Áster', firstName: 'Milo', lastName: 'Áster', email: 'milo@example.test', phone: '2025550102', companyName: 'Fictional Meadow Works', status: 'active', source: 'Template example', tags: 'example' },
    ],
  },
  {
    objectType: 'company', label: 'Companies', filename: 'freecrm-companies-template.csv',
    rows: [
      { name: 'Fictional Cedar Studio', firstName: '', lastName: '', email: 'cedar@example.test', phone: '2025550103', companyName: 'Fictional Cedar Studio', status: 'prospect', source: 'Template example', tags: 'example;fictional' },
      { name: 'Fictional Meadow Works', firstName: '', lastName: '', email: 'meadow@example.test', phone: '2025550104', companyName: 'Fictional Meadow Works', status: 'prospect', source: 'Template example', tags: 'example' },
    ],
  },
  {
    objectType: 'lead', label: 'Leads', filename: 'freecrm-leads-template.csv',
    rows: [
      { name: 'Sora Finch', firstName: 'Sora', lastName: 'Finch', email: 'sora@example.test', phone: '2025550105', companyName: 'Fictional Harbor Lab', status: 'new', source: 'Template example', tags: 'example;fictional' },
      { name: 'Remy Lark', firstName: 'Remy', lastName: 'Lark', email: 'remy@example.test', phone: '2025550106', companyName: 'Fictional Orchard Collective', status: 'new', source: 'Template example', tags: 'example' },
    ],
  },
];

export function csvTemplateText(template: Template): string {
  const cell = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return [csvTemplateFields.join(','), ...template.rows.map((row) => csvTemplateFields.map((field) => cell(row[field])).join(','))].join('\r\n') + '\r\n';
}

export function csvTemplateHref(filename: string): string {
  return `/templates/import/${filename}`;
}
