import { apiResponse } from './request-context';

// A response backed by a ReadableStream is not subject to Vercel's 4.5 MB
// buffered Function response limit. Keep chunks modest so the platform can
// flush progressively, while preserving the existing response contract on
// device and Cloudflare runtimes.
const VERCEL_RESPONSE_CHUNK_CHARACTERS = 32 * 1024;

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function chunkedTextStream(body: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let offset = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= body.length) {
        controller.close();
        return;
      }

      let end = Math.min(body.length, offset + VERCEL_RESPONSE_CHUNK_CHARACTERS);
      // JavaScript string offsets are UTF-16 code units. Do not split a
      // surrogate pair between chunks or TextEncoder would emit replacement
      // characters and corrupt the exported data.
      if (end < body.length && end > offset && isHighSurrogate(body.charCodeAt(end - 1))) end -= 1;

      controller.enqueue(encoder.encode(body.slice(offset, end)));
      offset = end;
      if (offset >= body.length) controller.close();
    },
  });
}

export function largeTextResponse(body: string, init: ResponseInit = {}): Response {
  if (process.env.VERCEL !== '1') return new Response(body, init);

  const headers = new Headers(init.headers);
  // A caller-supplied length would defeat chunked delivery and can become
  // incorrect when text contains multi-byte UTF-8 characters.
  headers.delete('content-length');
  return new Response(chunkedTextStream(body), { ...init, headers });
}

export function largeJsonResponse(data: unknown, init: ResponseInit = {}): Response {
  if (process.env.VERCEL !== '1') return apiResponse(data, init);

  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return largeTextResponse(JSON.stringify(data), { ...init, headers });
}
