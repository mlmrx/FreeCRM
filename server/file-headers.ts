import { ApiError } from './request-context';

// Covers a route-accepted 180-character Unicode filename even when every
// character expands to four UTF-8 bytes and twelve percent-encoded bytes.
export const MAX_CONTENT_DISPOSITION_LENGTH = 4096;
const invalid = () => new ApiError(400, 'invalid_storage_metadata', 'The attachment header is invalid or exceeds the supported size.');
const controls = /[\u0000-\u001f\u007f-\u009f]/;

function boundedHeader(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > MAX_CONTENT_DISPOSITION_LENGTH || controls.test(value)) throw invalid();
  return value;
}

/** Keep legacy ASCII filenames identical; encode international names as data. */
export function attachmentContentDisposition(filename: string): string {
  if (!filename || controls.test(filename) || /["\\]/.test(filename)) throw invalid();
  if (!/[^\x20-\x7e]/.test(filename)) return boundedHeader(`attachment; filename="${filename}"`);
  let encoded: string;
  try {
    // encodeURIComponent leaves these characters unescaped, but RFC 5987's
    // attr-char production does not permit them in an extended parameter.
    encoded = encodeURIComponent(filename).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  } catch { throw invalid(); }
  return boundedHeader(`attachment; filename="document"; filename*=UTF-8''${encoded}`);
}

/** Normalize a legacy attachment header and validate the expanded wire value. */
export function normalizeContentDisposition(value: unknown): string {
  const header = boundedHeader(value);
  if (!/[^\x20-\x7e]/.test(header)) return header;
  const filename = header.match(/^attachment; filename="([^"\\]*)"$/)?.[1];
  if (!filename) throw invalid();
  return attachmentContentDisposition(filename);
}
