import { sendIdempotentOperation } from './idempotent-client';

export type CsvImportObjectType = 'contact' | 'company' | 'lead';
export type CsvImportField = 'name' | 'firstName' | 'lastName' | 'email' | 'phone' | 'companyName' | 'status' | 'source' | 'tags';
export type CsvImportMapping = Partial<Record<CsvImportField, string>>;

export type CsvImportRowError = {
  row: number;
  code: string;
  message: string;
  field?: string;
};

export type CsvImportPreview = {
  mode: 'preview';
  objectType: CsvImportObjectType;
  columns: string[];
  mapping: CsvImportMapping;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  preview: Array<{
    row: number;
    name: string;
    email: string | null;
    phone: string | null;
    companyName: string | null;
    status: string | null;
  }>;
  errors: CsvImportRowError[];
  limits: { maxRows: number; maxBytes: number };
};

export type CsvImportReceipt = {
  mode: 'commit';
  objectType: CsvImportObjectType;
  totalRows: number;
  imported: number;
  recordIds: string[];
};

function isCsvImportReceipt(value: unknown): value is CsvImportReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as Partial<CsvImportReceipt>;
  return receipt.mode === 'commit'
    && (receipt.objectType === 'contact' || receipt.objectType === 'company' || receipt.objectType === 'lead')
    && Number.isSafeInteger(receipt.totalRows)
    && Number.isSafeInteger(receipt.imported)
    && receipt.totalRows! >= 0
    && receipt.imported! >= 0
    && receipt.imported! <= receipt.totalRows!
    && Array.isArray(receipt.recordIds)
    && receipt.recordIds.length === receipt.imported
    && receipt.recordIds.every((recordId) => typeof recordId === 'string' && Boolean(recordId));
}

type CsvImportErrorEnvelope = {
  error?: {
    message?: string;
    details?: { errors?: CsvImportRowError[] } | null;
  };
};

export class CsvImportRequestError extends Error {
  readonly rowErrors: CsvImportRowError[];

  constructor(message: string, rowErrors: CsvImportRowError[] = []) {
    super(message);
    this.name = 'CsvImportRequestError';
    this.rowErrors = rowErrors;
  }
}

export function compactCsvMapping(mapping: CsvImportMapping): CsvImportMapping | undefined {
  const entries = Object.entries(mapping).filter((entry): entry is [CsvImportField, string] => typeof entry[1] === 'string' && Boolean(entry[1].trim()));
  return entries.length ? Object.fromEntries(entries.map(([field, header]) => [field, header.trim()])) : undefined;
}

/** Reads only the first CSV row so the browser can offer mapping choices before upload. */
export function csvHeaderColumns(csv: string): string[] {
  const columns: string[] = [];
  let cell = '';
  let quoted = false;
  let index = 0;
  const source = csv.replace(/^\uFEFF/, '');
  while (index < source.length) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 2;
        continue;
      }
      if (character === '"') {
        quoted = false;
        index += 1;
        continue;
      }
      cell += character;
      index += 1;
      continue;
    }
    if (character === '"' && !cell) {
      quoted = true;
    } else if (character === ',') {
      columns.push(cell.trim());
      cell = '';
    } else if (character === '\r' || character === '\n') {
      columns.push(cell.trim());
      break;
    } else {
      cell += character;
    }
    index += 1;
  }
  if (index >= source.length && (cell || columns.length)) columns.push(cell.trim());
  return quoted ? [] : [...new Set(columns.filter(Boolean))];
}

export function csvImportPayload(
  mode: 'preview' | 'commit',
  csv: string,
  objectType: CsvImportObjectType,
  mapping: CsvImportMapping,
): Record<string, unknown> {
  const compactMapping = compactCsvMapping(mapping);
  return { mode, csv, objectType, ...(compactMapping ? { mapping: compactMapping } : {}) };
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { data?: T } & CsvImportErrorEnvelope;
  if (!response.ok) {
    const rowErrors = Array.isArray(body.error?.details?.errors) ? body.error.details.errors : [];
    throw new CsvImportRequestError(body.error?.message || `CSV request failed (${response.status}).`, rowErrors);
  }
  if (!body.data) throw new CsvImportRequestError('The CSV service returned an empty response.');
  return body.data;
}

export async function previewCsvImport(csv: string, objectType: CsvImportObjectType, mapping: CsvImportMapping): Promise<CsvImportPreview> {
  const response = await fetch('/api/v1/imports/csv', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(csvImportPayload('preview', csv, objectType, mapping)),
  });
  return readResponse<CsvImportPreview>(response);
}

export function commitCsvImport(csv: string, objectType: CsvImportObjectType, mapping: CsvImportMapping): Promise<CsvImportReceipt> {
  // sendIdempotentOperation retains one key for this exact body across transport
  // failures and page reloads, then clears it only after a definitive outcome.
  return sendIdempotentOperation<CsvImportReceipt>(
    '/api/v1/imports/csv',
    csvImportPayload('commit', csv, objectType, mapping),
    { validateData: isCsvImportReceipt },
  );
}
