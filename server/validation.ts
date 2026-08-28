import { isRecordType, moduleByType, normalizeTags, type RecordType } from '@/lib/crm-platform';
import { ApiError } from './request-context';

export const commandTypes = [
  'record.create',
  'record.update',
  'record.archive',
  'note.create',
  'lead.convert',
  'quote.accept',
  'invoice.record_payment',
  'ticket.resolve',
  'workflow.toggle',
  'integration.update',
  'workspace.update',
  'legacy.import',
  'demo.reset',
] as const;

export type CommandType = (typeof commandTypes)[number];
export type CRMCommand = { type: CommandType; payload: Record<string, unknown> };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'invalid_payload', 'Expected a JSON object.');
  }
  return value as Record<string, unknown>;
}

export function cleanText(value: unknown, field: string, max = 240, required = false): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (required && !text) throw new ApiError(400, 'validation_error', `${field} is required.`, { field });
  if (text.length > max) throw new ApiError(400, 'validation_error', `${field} is too long.`, { field, max });
  return text;
}

export function cleanOptionalText(value: unknown, field: string, max = 240): string | null {
  const text = cleanText(value, field, max, false);
  return text || null;
}

export function cleanInteger(value: unknown, field: string, min: number, max: number, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ApiError(400, 'validation_error', `${field} must be an integer from ${min} to ${max}.`, { field, min, max });
  }
  return number;
}

export function cleanDate(value: unknown, field: string): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new ApiError(400, 'validation_error', `${field} must be a valid date.`, { field });
  return date.toISOString();
}

export function cleanEmail(value: unknown): string | null {
  const email = cleanOptionalText(value, 'email', 320)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'validation_error', 'Email is invalid.', { field: 'email' });
  }
  return email;
}

export function cleanUrl(value: unknown, field: string): string | null {
  const raw = cleanOptionalText(value, field, 2048);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(400, 'validation_error', `${field} must be a valid HTTPS URL.`, { field });
  }
  if (url.protocol !== 'https:') throw new ApiError(400, 'validation_error', `${field} must use HTTPS.`, { field });
  return url.toString();
}

export function cleanRecordInput(payload: Record<string, unknown>, partial = false) {
  const type = payload.objectType;
  if (!partial && !isRecordType(type)) throw new ApiError(400, 'validation_error', 'A supported objectType is required.', { field: 'objectType' });
  const objectType = isRecordType(type) ? type : undefined;
  const status = cleanOptionalText(payload.status, 'status', 64);
  if (objectType && status && !moduleByType[objectType].statuses.includes(status)) {
    throw new ApiError(400, 'validation_error', `Unsupported ${objectType} status.`, { field: 'status' });
  }
  const amount = payload.amountCents === undefined ? undefined : cleanInteger(payload.amountCents, 'amountCents', 0, 2_147_483_647);
  return {
    objectType,
    name: payload.name === undefined && partial ? undefined : cleanText(payload.name, 'name', 240, !partial),
    status: status ?? undefined,
    lifecycle: payload.lifecycle === undefined ? undefined : cleanText(payload.lifecycle, 'lifecycle', 64),
    email: payload.email === undefined ? undefined : cleanEmail(payload.email),
    phone: payload.phone === undefined ? undefined : cleanOptionalText(payload.phone, 'phone', 80),
    companyName: payload.companyName === undefined ? undefined : cleanOptionalText(payload.companyName, 'companyName', 240),
    amountCents: amount,
    currency: payload.currency === undefined ? undefined : cleanText(payload.currency, 'currency', 3).toUpperCase(),
    probability: payload.probability === undefined ? undefined : cleanInteger(payload.probability, 'probability', 0, 100),
    source: payload.source === undefined ? undefined : cleanOptionalText(payload.source, 'source', 120),
    priority: payload.priority === undefined ? undefined : cleanOptionalText(payload.priority, 'priority', 32),
    dueAt: payload.dueAt === undefined ? undefined : cleanDate(payload.dueAt, 'dueAt'),
    closedAt: payload.closedAt === undefined ? undefined : cleanDate(payload.closedAt, 'closedAt'),
    fields: payload.fields === undefined ? undefined : object(payload.fields),
    tags: payload.tags === undefined ? undefined : normalizeTags(payload.tags),
  };
}

export function parseCommand(value: unknown): CRMCommand {
  const body = object(value);
  if (typeof body.type !== 'string' || !(commandTypes as readonly string[]).includes(body.type)) {
    throw new ApiError(400, 'unsupported_command', 'Unsupported command type.');
  }
  return { type: body.type as CommandType, payload: object(body.payload ?? {}) };
}

export function requireId(payload: Record<string, unknown>, field = 'id'): string {
  return cleanText(payload[field], field, 128, true);
}

export function requireVersion(payload: Record<string, unknown>): number {
  return cleanInteger(payload.version, 'version', 1, Number.MAX_SAFE_INTEGER);
}

export function assertRecordType(value: unknown): RecordType {
  if (!isRecordType(value)) throw new ApiError(400, 'validation_error', 'Unsupported record type.');
  return value;
}
