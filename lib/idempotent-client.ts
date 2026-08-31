type IdempotentOperationOptions = {
  /** Also place the caller key in this JSON field for APIs with an existing body contract. */
  keyInBody?: string;
};

type PendingOperation = { key: string; createdAt: number };

const pendingOperationKeys = new Map<string, PendingOperation>();
const maxPendingOperationKeys = 32;
const pendingOperationTtlMs = 86_400_000;
const pendingOperationStorageKey = 'free-crm.idempotency.v1';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fingerprintPattern = /^[0-9a-f]{64}$/;
let storageHydrated = false;

async function operationFingerprint(path: string, body: string, keyInBody?: string) {
  const value = `${path}\n${keyInBody ?? ''}\n${body}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function persistPendingOperations() {
  if (typeof window === 'undefined') return;
  try {
    const operations = [...pendingOperationKeys].map(([fingerprint, pending]) => ({ fingerprint, ...pending }));
    window.sessionStorage.setItem(pendingOperationStorageKey, JSON.stringify({ version: 1, operations }));
  } catch {
    // Hardened/private browsers may disable storage; in-memory retry still works.
  }
}

function hydratePendingOperations() {
  if (storageHydrated || typeof window === 'undefined') return;
  storageHydrated = true;
  const now = Date.now();
  try {
    const raw = window.sessionStorage.getItem(pendingOperationStorageKey);
    const stored = raw ? JSON.parse(raw) as { version?: unknown; operations?: unknown } : null;
    if (stored?.version !== 1 || !Array.isArray(stored.operations)) return;
    for (const candidate of stored.operations.slice(-maxPendingOperationKeys)) {
      if (!candidate || typeof candidate !== 'object') continue;
      const value = candidate as Partial<{ fingerprint: string; key: string; createdAt: number }>;
      if (!value.fingerprint || !fingerprintPattern.test(value.fingerprint) || !value.key || !uuidPattern.test(value.key) || !Number.isFinite(value.createdAt) || now - value.createdAt! > pendingOperationTtlMs || value.createdAt! > now + 60_000) continue;
      pendingOperationKeys.set(value.fingerprint, { key: value.key, createdAt: value.createdAt! });
    }
  } catch {
    // Ignore malformed or unavailable session storage and create a fresh key.
  }
}

function clearOperationKey(fingerprint: string) {
  pendingOperationKeys.delete(fingerprint);
  persistPendingOperations();
}

function operationKey(fingerprint: string) {
  hydratePendingOperations();
  const now = Date.now();
  for (const [storedFingerprint, stored] of pendingOperationKeys) {
    if (now - stored.createdAt > pendingOperationTtlMs || stored.createdAt > now + 60_000) pendingOperationKeys.delete(storedFingerprint);
  }
  const pending = pendingOperationKeys.get(fingerprint);
  if (pending) return pending.key;
  const created = crypto.randomUUID();
  if (pendingOperationKeys.size >= maxPendingOperationKeys) {
    const oldest = pendingOperationKeys.keys().next().value as string | undefined;
    if (oldest) pendingOperationKeys.delete(oldest);
  }
  pendingOperationKeys.set(fingerprint, { key: created, createdAt: now });
  persistPendingOperations();
  return created;
}

/**
 * Sends a mutation with a stable caller-generated key. A transport failure or
 * final 5xx keeps the key in memory, so repeating the same user action replays
 * the server receipt instead of applying the mutation twice.
 */
export async function sendIdempotentOperation<T extends Record<string, unknown> = Record<string, unknown>>(
  path: string,
  payload: Record<string, unknown>,
  options: IdempotentOperationOptions = {},
): Promise<T> {
  const canonicalBody = JSON.stringify(payload);
  const fingerprint = await operationFingerprint(path, canonicalBody, options.keyInBody);
  const idempotencyKey = operationKey(fingerprint);
  const requestPayload = options.keyInBody ? { ...payload, [options.keyInBody]: idempotencyKey } : payload;
  const body = JSON.stringify(requestPayload);
  const request = () => fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'idempotency-key': idempotencyKey },
    body,
  });

  let response: Response;
  try {
    response = await request();
  } catch {
    // The server may have committed before the connection failed. Retrying is
    // safe only because this request reuses the exact caller key and body.
    response = await request();
  }
  if ([500, 502, 504].includes(response.status)) response = await request();

  const responseBody = await response.json().catch(() => ({})) as { data?: T; error?: { message?: string } };
  if (!response.ok) {
    // A 4xx is a definitive rejection. Keep keys only for ambiguous server or
    // transport failures so an intentional corrected action gets a new key.
    if (response.status < 500) clearOperationKey(fingerprint);
    throw new Error(responseBody.error?.message || `Request failed (${response.status})`);
  }
  clearOperationKey(fingerprint);
  return responseBody.data ?? {} as T;
}
