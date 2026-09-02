import { ApiError } from './request-context';
import { cleanRecordInput } from './validation';

export const CSV_IMPORT_MAX_BYTES = 256_000;
export const CSV_IMPORT_REQUEST_MAX_BYTES = 1_000_000;
export const CSV_IMPORT_MAX_ROWS = 40;
export const CSV_IMPORT_MAX_COLUMNS = 64;
export const CSV_IMPORT_MAX_CELL_CHARACTERS = 4_096;

const supportedObjectTypes = ['contact', 'company', 'lead'] as const;
type CsvObjectType = (typeof supportedObjectTypes)[number];
type ImportableField = 'name' | 'firstName' | 'lastName' | 'email' | 'phone' | 'companyName' | 'status' | 'source' | 'tags';
type CsvMapping = Partial<Record<ImportableField, string>>;

const importableFields: readonly ImportableField[] = ['name', 'firstName', 'lastName', 'email', 'phone', 'companyName', 'status', 'source', 'tags'];
const commonAliases: Record<ImportableField, readonly string[]> = {
  name: ['name', 'full name', 'fullname', 'contact name'],
  firstName: ['first name', 'firstname', 'given name', 'givenname'],
  lastName: ['last name', 'lastname', 'family name', 'familyname', 'surname'],
  email: ['email', 'email address', 'emailaddress', 'e-mail'],
  phone: ['phone', 'phone number', 'phonenumber', 'mobile', 'telephone'],
  companyName: ['company', 'company name', 'companyname', 'organization', 'organisation', 'account'],
  status: ['status', 'stage'],
  source: ['source', 'lead source', 'leadsource'],
  tags: ['tags', 'labels'],
};

export type CsvRowError = {
  row: number;
  code: string;
  message: string;
  field?: string;
};

export type PreparedCsvImport = {
  objectType: CsvObjectType;
  columns: string[];
  mapping: CsvMapping;
  records: Array<Record<string, unknown>>;
  errors: CsvRowError[];
  totalRows: number;
  preview: Array<{
    row: number;
    name: string;
    email: string | null;
    phone: string | null;
    companyName: string | null;
    status: string | null;
  }>;
};

function normalizedHeader(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replaceAll('_', ' ').replaceAll('-', ' ').replace(/\s+/g, ' ');
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseCsv(csv: string): string[][] {
  if (!csv.trim()) throw new ApiError(400, 'csv_empty', 'Choose a CSV file with a header row and at least one data row.');
  if (byteLength(csv) > CSV_IMPORT_MAX_BYTES) {
    throw new ApiError(413, 'csv_too_large', `CSV imports are limited to ${CSV_IMPORT_MAX_BYTES.toLocaleString()} encoded bytes per batch.`);
  }
  if (csv.includes('\0')) throw new ApiError(400, 'csv_invalid', 'CSV data must not contain null characters.');

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;

  const pushCell = () => {
    if (cell.length > CSV_IMPORT_MAX_CELL_CHARACTERS) {
      throw new ApiError(413, 'csv_cell_too_large', `CSV cells are limited to ${CSV_IMPORT_MAX_CELL_CHARACTERS.toLocaleString()} characters.`);
    }
    row.push(cell);
    cell = '';
    closedQuote = false;
    if (row.length > CSV_IMPORT_MAX_COLUMNS) {
      throw new ApiError(413, 'csv_too_many_columns', `CSV imports support up to ${CSV_IMPORT_MAX_COLUMNS} columns.`);
    }
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
    if (rows.length > CSV_IMPORT_MAX_ROWS + 1) {
      throw new ApiError(413, 'csv_too_many_rows', `CSV imports support up to ${CSV_IMPORT_MAX_ROWS} data rows per batch.`);
    }
  };

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (closedQuote && character !== ',' && character !== '\r' && character !== '\n') {
      if (/\s/.test(character)) continue;
      throw new ApiError(400, 'csv_invalid', 'Quoted CSV cells may contain only whitespace before the next comma or line break.');
    }
    if (character === '"') {
      if (cell.length > 0) throw new ApiError(400, 'csv_invalid', 'Quotes must begin at the start of a CSV cell.');
      quoted = true;
    } else if (character === ',') {
      pushCell();
    } else if (character === '\n') {
      pushRow();
    } else if (character === '\r') {
      if (csv[index + 1] === '\n') index += 1;
      pushRow();
    } else {
      cell += character;
    }
  }
  if (quoted) throw new ApiError(400, 'csv_invalid', 'The CSV ends inside a quoted cell.');
  if (cell.length > 0 || row.length > 0) pushRow();

  if (rows.length < 2) throw new ApiError(400, 'csv_empty', 'Choose a CSV file with a header row and at least one data row.');
  return rows;
}

function parseObjectType(value: unknown): CsvObjectType {
  if (typeof value === 'string' && (supportedObjectTypes as readonly string[]).includes(value)) return value as CsvObjectType;
  throw new ApiError(400, 'validation_error', 'objectType must be contact, company, or lead.', { field: 'objectType' });
}

function parseHeaders(rawHeaders: string[]): { headers: string[]; byNormalizedName: Map<string, string> } {
  const headers = rawHeaders.map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim());
  const byNormalizedName = new Map<string, string>();
  for (const header of headers) {
    if (!header) throw new ApiError(400, 'csv_header_invalid', 'Every CSV column needs a non-empty header.');
    const normalized = normalizedHeader(header);
    if (byNormalizedName.has(normalized)) throw new ApiError(400, 'csv_header_duplicate', `CSV header "${header}" appears more than once.`);
    byNormalizedName.set(normalized, header);
  }
  return { headers, byNormalizedName };
}

function resolveMapping(value: unknown, objectType: CsvObjectType, byNormalizedName: Map<string, string>): CsvMapping {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) {
    throw new ApiError(400, 'validation_error', 'mapping must be an object whose values name CSV headers.', { field: 'mapping' });
  }
  const requested = (value ?? {}) as Record<string, unknown>;
  const unknownField = Object.keys(requested).find((field) => !(importableFields as readonly string[]).includes(field));
  if (unknownField) throw new ApiError(400, 'validation_error', `Unsupported CSV mapping field: ${unknownField}.`, { field: `mapping.${unknownField}` });

  const mapping: CsvMapping = {};
  for (const field of importableFields) {
    const explicit = requested[field];
    if (explicit !== undefined) {
      if (typeof explicit !== 'string' || !explicit.trim()) {
        throw new ApiError(400, 'validation_error', `mapping.${field} must name a CSV header.`, { field: `mapping.${field}` });
      }
      const header = byNormalizedName.get(normalizedHeader(explicit));
      if (!header) throw new ApiError(400, 'csv_mapping_missing_header', `Mapped header "${explicit}" was not found in the CSV.`, { field: `mapping.${field}` });
      mapping[field] = header;
      continue;
    }
    const aliases = field === 'name' && objectType === 'company'
      ? ['company', 'company name', 'companyname', 'organization', 'organisation', 'account', 'name']
      : commonAliases[field];
    const matched = aliases.map((alias) => byNormalizedName.get(normalizedHeader(alias))).find(Boolean);
    if (matched) mapping[field] = matched;
  }
  if (!mapping.name && objectType !== 'company' && !mapping.firstName && !mapping.lastName) {
    throw new ApiError(400, 'csv_mapping_name_required', 'Map a name column, or map firstName and/or lastName.');
  }
  if (!mapping.name && objectType === 'company') {
    throw new ApiError(400, 'csv_mapping_name_required', 'Map the company name column.');
  }
  return mapping;
}

function valueAt(row: string[], headers: string[], header?: string): string {
  if (!header) return '';
  const index = headers.indexOf(header);
  return index < 0 ? '' : (row[index] ?? '').trim();
}

function rowError(row: number, error: unknown): CsvRowError {
  if (error instanceof ApiError) {
    return {
      row,
      code: error.code,
      message: error.message,
      field: typeof error.details?.field === 'string' ? error.details.field : undefined,
    };
  }
  return { row, code: 'csv_row_invalid', message: 'This row could not be validated.' };
}

export function prepareCsvImport(input: Record<string, unknown>): PreparedCsvImport {
  const csv = typeof input.csv === 'string' ? input.csv : '';
  const objectType = parseObjectType(input.objectType);
  const [rawHeaders, ...rawRows] = parseCsv(csv);
  const { headers, byNormalizedName } = parseHeaders(rawHeaders);
  const mapping = resolveMapping(input.mapping, objectType, byNormalizedName);
  const mappedHeaders = new Set(Object.values(mapping));
  const records: Array<Record<string, unknown>> = [];
  const errors: CsvRowError[] = [];
  const preview: PreparedCsvImport['preview'] = [];

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (row.length > headers.length) {
      errors.push({ row: rowNumber, code: 'csv_row_too_many_cells', message: `Row ${rowNumber} has more cells than the header row.` });
      return;
    }
    const name = valueAt(row, headers, mapping.name)
      || [valueAt(row, headers, mapping.firstName), valueAt(row, headers, mapping.lastName)].filter(Boolean).join(' ');
    const email = valueAt(row, headers, mapping.email);
    const phone = valueAt(row, headers, mapping.phone);
    const companyName = valueAt(row, headers, mapping.companyName);
    const status = valueAt(row, headers, mapping.status);
    const source = valueAt(row, headers, mapping.source) || 'CSV import';
    const tags = valueAt(row, headers, mapping.tags).split(/[|;]/).map((tag) => tag.trim()).filter(Boolean);
    const fields = Object.fromEntries(headers.flatMap((header, columnIndex) => {
      const value = (row[columnIndex] ?? '').trim();
      return mappedHeaders.has(header) || !value ? [] : [[header, value]];
    }));
    const candidate: Record<string, unknown> = {
      objectType,
      name,
      email: email || undefined,
      phone: phone || undefined,
      companyName: companyName || undefined,
      status: status || undefined,
      source,
      tags,
      fields,
    };
    try {
      if (objectType === 'lead' && ['convertedAt', 'contactId', 'companyId', 'opportunityId'].some((field) => Object.hasOwn(fields, field))) {
        throw new ApiError(400, 'protected_field', 'Converted lead identifiers are system-managed and cannot be imported.', { field: 'fields' });
      }
      const cleaned = cleanRecordInput(candidate);
      const record = Object.fromEntries(Object.entries(cleaned).filter(([, value]) => value !== undefined)) as Record<string, unknown>;
      records.push(record);
      if (preview.length < 5) {
        preview.push({
          row: rowNumber,
          name: String(record.name),
          email: typeof record.email === 'string' ? record.email : null,
          phone: typeof record.phone === 'string' ? record.phone : null,
          companyName: typeof record.companyName === 'string' ? record.companyName : null,
          status: typeof record.status === 'string' ? record.status : null,
        });
      }
    } catch (error) {
      errors.push(rowError(rowNumber, error));
    }
  });

  return { objectType, columns: headers, mapping, records, errors, totalRows: rawRows.length, preview };
}
