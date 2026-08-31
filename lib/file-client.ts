'use client';

type FileOperationKind = 'upload' | 'delete';

type PendingFileOperation = {
  version: 1;
  kind: FileOperationKind;
  fingerprint: string;
  key: string;
  createdAt: string;
};

type FileMutationResponse = {
  ok: true;
  result: Record<string, unknown>;
  replayed?: boolean;
};

const maxPendingOperations = 32;
const maxPendingAgeMs = 6 * 24 * 60 * 60 * 1_000;
const memoryOperations = new Map<string, PendingFileOperation>();

async function sha256(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function registryKey(workspaceId: string): string {
  return `free-crm.file-operations.v1:${workspaceId}`;
}

function validPending(value: unknown): value is PendingFileOperation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<PendingFileOperation>;
  return item.version === 1
    && (item.kind === 'upload' || item.kind === 'delete')
    && typeof item.fingerprint === 'string' && /^[0-9a-f]{64}$/.test(item.fingerprint)
    && typeof item.key === 'string' && /^[0-9a-f-]{36}$/i.test(item.key)
    && typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt));
}

function readRegistry(workspaceId: string): PendingFileOperation[] {
  const stillRecoverable = (item: PendingFileOperation) => Date.parse(item.createdAt) >= Date.now() - maxPendingAgeMs;
  try {
    const raw = window.localStorage.getItem(registryKey(workspaceId));
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(validPending).filter(stillRecoverable).slice(-maxPendingOperations);
  } catch {
    return Array.from(memoryOperations.entries())
      .filter(([key, item]) => key.startsWith(`${workspaceId}:`) && stillRecoverable(item))
      .map(([, item]) => item)
      .slice(-maxPendingOperations);
  }
}

function writeRegistry(workspaceId: string, values: PendingFileOperation[]): void {
  const bounded = values.slice(-maxPendingOperations);
  try {
    window.localStorage.setItem(registryKey(workspaceId), JSON.stringify(bounded));
  } catch {
    for (const [key] of memoryOperations) {
      if (key.startsWith(`${workspaceId}:`)) memoryOperations.delete(key);
    }
    for (const item of bounded) memoryOperations.set(`${workspaceId}:${item.kind}:${item.fingerprint}`, item);
  }
}

function operationFor(workspaceId: string, kind: FileOperationKind, fingerprint: string): PendingFileOperation {
  const existing = readRegistry(workspaceId).find((item) => item.kind === kind && item.fingerprint === fingerprint);
  if (existing) return existing;
  const created: PendingFileOperation = {
    version: 1,
    kind,
    fingerprint,
    key: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  writeRegistry(workspaceId, [...readRegistry(workspaceId), created]);
  return created;
}

function completeOperation(workspaceId: string, operation: PendingFileOperation): void {
  writeRegistry(workspaceId, readRegistry(workspaceId).filter((item) => (
    item.kind !== operation.kind || item.fingerprint !== operation.fingerprint || item.key !== operation.key
  )));
}

async function readResponse(response: Response): Promise<FileMutationResponse> {
  const body = await response.json().catch(() => ({})) as FileMutationResponse & { error?: { message?: string } };
  if (!response.ok) throw Object.assign(
    new Error(body.error?.message || `File operation failed (${response.status})`),
    { status: response.status },
  );
  return body;
}

async function executeFileRequest(
  workspaceId: string,
  operation: PendingFileOperation,
  request: () => Promise<Response>,
): Promise<FileMutationResponse> {
  let response: Response;
  try {
    response = await request();
  } catch {
    response = await request();
  }
  if ([500, 502, 504].includes(response.status)) response = await request();
  try {
    const result = await readResponse(response);
    completeOperation(workspaceId, operation);
    return result;
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
    // Keep the key only while the commit can be unknown or server-side recovery
    // is pending. A definitive caller error releases it for a corrected action.
    if (status > 0 && status < 500) completeOperation(workspaceId, operation);
    throw error;
  }
}

export async function uploadDocumentFile(workspaceId: string, file: File): Promise<FileMutationResponse> {
  const contentDigest = await sha256(await file.arrayBuffer());
  const fingerprint = await sha256([
    'FREE-CRM:browser-document-upload:v1',
    file.name,
    file.type,
    String(file.size),
    String(file.lastModified),
    contentDigest,
  ].join('\n'));
  const operation = operationFor(workspaceId, 'upload', fingerprint);
  return executeFileRequest(workspaceId, operation, () => {
    const form = new FormData();
    form.append('file', file);
    return fetch('/api/v1/files', {
      method: 'POST',
      headers: { accept: 'application/json', 'idempotency-key': operation.key },
      body: form,
    });
  });
}

export async function deleteDocumentFile(workspaceId: string, id: string): Promise<FileMutationResponse> {
  const fingerprint = await sha256(`FREE-CRM:browser-document-delete:v1\n${id}`);
  const operation = operationFor(workspaceId, 'delete', fingerprint);
  return executeFileRequest(workspaceId, operation, () => fetch(`/api/v1/files?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { accept: 'application/json', 'idempotency-key': operation.key },
  }));
}
