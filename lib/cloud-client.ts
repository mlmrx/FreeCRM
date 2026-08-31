import type { CRMWorkspace as LegacyWorkspace } from './crm';
import type { CRMSnapshot, RecordType } from './crm-platform';

type CommandEnvelope = { type: string; payload: Record<string, unknown> };
type CloudSnapshotRequest = { signal?: AbortSignal; resetOperationId?: string };
export type KernelCreateOperation = 'actor.create' | 'relationship.create' | 'work.create' | 'activity.create';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PENDING_MUTATION_PREFIX = 'free-crm.pending-mutation.v1:';
const PENDING_MUTATION_TTL_MS = 23 * 60 * 60 * 1000;
type PendingMutationKey = { key: string; createdAt: number };
const pendingCommandKeys = new Map<string, PendingMutationKey>();
const maxPendingCommandKeys = 32;

async function pendingStorageKey(identity: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  return `${PENDING_MUTATION_PREFIX}${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function sessionStorageOrNull(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage ?? null; } catch { return null; }
}

function validPendingMutation(value: Partial<PendingMutationKey> | null, now: number): value is PendingMutationKey {
  return typeof value?.key === 'string'
    && UUID_PATTERN.test(value.key)
    && typeof value.createdAt === 'number'
    && Number.isFinite(value.createdAt)
    && value.createdAt <= now + 60_000
    && now - value.createdAt < PENDING_MUTATION_TTL_MS;
}

function prunePendingSession(storage: Storage, now: number) {
  const valid: Array<{ storageKey: string; createdAt: number }> = [];
  const storageKeys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((storageKey): storageKey is string => Boolean(storageKey?.startsWith(PENDING_MUTATION_PREFIX)));
  for (const storageKey of storageKeys) {
    try {
      const raw = storage.getItem(storageKey);
      const pending = raw ? JSON.parse(raw) as Partial<PendingMutationKey> : null;
      if (validPendingMutation(pending, now)) valid.push({ storageKey, createdAt: pending.createdAt });
      else storage.removeItem(storageKey);
    } catch {
      storage.removeItem(storageKey);
    }
  }
  valid.sort((left, right) => left.createdAt - right.createdAt);
  for (const item of valid.slice(0, Math.max(0, valid.length - maxPendingCommandKeys + 1))) storage.removeItem(item.storageKey);
}

function rememberPendingMutation(body: string, pending: PendingMutationKey) {
  if (!pendingCommandKeys.has(body) && pendingCommandKeys.size >= maxPendingCommandKeys) {
    const oldest = pendingCommandKeys.keys().next().value as string | undefined;
    if (oldest) pendingCommandKeys.delete(oldest);
  }
  pendingCommandKeys.set(body, pending);
}

async function commandKey(body: string, supplied?: string) {
  if (supplied !== undefined) return supplied;
  const now = Date.now();
  const pending = pendingCommandKeys.get(body);
  if (pending && validPendingMutation(pending, now)) return pending.key;
  if (pending) pendingCommandKeys.delete(body);

  let storage: Storage | null = null;
  let storageKey: string | null = null;
  try {
    storage = sessionStorageOrNull();
    if (storage) {
      storageKey = await pendingStorageKey(body);
      const raw = storage.getItem(storageKey);
      const persisted = raw ? JSON.parse(raw) as Partial<PendingMutationKey> : null;
      if (validPendingMutation(persisted, now)) {
        rememberPendingMutation(body, persisted);
        return persisted.key;
      }
      if (raw) storage.removeItem(storageKey);
    }
  } catch {
    storage = null;
    storageKey = null;
  }

  const created = { key: crypto.randomUUID(), createdAt: now };
  rememberPendingMutation(body, created);
  if (storage && storageKey) {
    try {
      prunePendingSession(storage, now);
      storage.setItem(storageKey, JSON.stringify(created));
    } catch {
      // Memory-only retry safety remains available when session storage is full
      // or disabled by the browser.
    }
  }
  return created.key;
}

async function clearCommandKey(body: string) {
  pendingCommandKeys.delete(body);
  try {
    const storage = sessionStorageOrNull();
    if (storage) storage.removeItem(await pendingStorageKey(body));
  } catch {
    // A committed server receipt is authoritative even if browser cleanup fails.
  }
}

async function jsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || `Request failed (${response.status})`);
  return body;
}

export async function loadCloudSnapshot({ signal, resetOperationId }: CloudSnapshotRequest = {}): Promise<CRMSnapshot> {
  if (resetOperationId && !UUID_PATTERN.test(resetOperationId)) throw new Error('resetOperationId must be a UUID.');
  const pendingReset = readPendingResetRequest();
  const receiptOperationId = resetOperationId ?? pendingReset?.operationId;
  const suffix = receiptOperationId ? `?resetOperationId=${encodeURIComponent(receiptOperationId)}` : '';
  const response = await fetch(`/api/v1/bootstrap${suffix}`, { signal, cache: 'no-store', headers: { accept: 'application/json' } });
  const body = await jsonResponse<{ data: CRMSnapshot }>(response);
  return body.data;
}

export async function sendCommand(type: string, payload: Record<string, unknown>, suppliedIdempotencyKey?: string) {
  const envelope: CommandEnvelope = { type, payload };
  const body = JSON.stringify(envelope);
  const idempotencyKey = await commandKey(body, suppliedIdempotencyKey);
  const request = () => fetch('/api/v1/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'idempotency-key': idempotencyKey },
    body,
  });
  let response: Response;
  try {
    response = await request();
  } catch {
    // The server can commit before the browser observes a cross-cloud/network
    // failure. Commands carry an atomic receipt, so one retry is safe only when
    // it reuses the exact body and caller key from this invocation.
    response = await request();
  }
  if ([500, 502, 504].includes(response.status)) response = await request();
  try {
    const result = await jsonResponse<{ ok: true; result: Record<string, unknown>; replayed?: boolean }>(response);
    if (suppliedIdempotencyKey === undefined) await clearCommandKey(body);
    return result;
  } catch (error) {
    // Retain an implicit key only while the final outcome can still be
    // ambiguous. A later identical user action then resumes rather than
    // creating a second record, note, payment, or import.
    if (suppliedIdempotencyKey === undefined && response.status < 500) await clearCommandKey(body);
    throw error;
  }
}

export async function sendKernelCreate(operation: KernelCreateOperation, payload: Record<string, unknown>, suppliedIdempotencyKey?: string) {
  const body = JSON.stringify({ ...payload, operation });
  // Prefix the pending-key identity so a future command with the same encoded
  // JSON cannot accidentally consume this unresolved kernel operation.
  const pendingBody = `kernel:${body}`;
  const idempotencyKey = await commandKey(pendingBody, suppliedIdempotencyKey);
  const request = () => fetch('/api/v1/kernel', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'idempotency-key': idempotencyKey },
    body,
  });
  let response: Response;
  try {
    response = await request();
  } catch {
    response = await request();
  }
  if ([500, 502, 504].includes(response.status)) response = await request();
  try {
    const result = await jsonResponse<{ data: Record<string, unknown>; replayed: boolean }>(response);
    if (suppliedIdempotencyKey === undefined) await clearCommandKey(pendingBody);
    return result;
  } catch (error) {
    // Keep the caller key for an unresolved server outcome. A later identical
    // manual action then asks for its durable receipt instead of duplicating it.
    if (suppliedIdempotencyKey === undefined && response.status < 500) await clearCommandKey(pendingBody);
    throw error;
  }
}

export type PendingReset = { version: 1; workspaceId: string; mode: 'clean' | 'demo'; operationId: string; idempotencyKey: string };

function resetStorageKey(workspaceId: string) {
  return `free-crm.reset.v1:${workspaceId}`;
}

function validPendingReset(value: Partial<PendingReset> | null, workspaceId?: string): value is PendingReset {
  return value?.version === 1
    && typeof value.workspaceId === 'string'
    && (!workspaceId || value.workspaceId === workspaceId)
    && (value.mode === 'clean' || value.mode === 'demo')
    && typeof value.operationId === 'string'
    && UUID_PATTERN.test(value.operationId)
    && typeof value.idempotencyKey === 'string'
    && UUID_PATTERN.test(value.idempotencyKey);
}

export function readPendingResetRequest(workspaceId?: string): PendingReset | null {
  if (typeof window === 'undefined') return null;
  try {
    if (workspaceId) {
      const value = window.localStorage.getItem(resetStorageKey(workspaceId));
      const pending = value ? JSON.parse(value) as Partial<PendingReset> : null;
      return validPendingReset(pending, workspaceId) ? pending : null;
    }
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith('free-crm.reset.v1:')) continue;
      try {
        const value = window.localStorage.getItem(key);
        const pending = value ? JSON.parse(value) as Partial<PendingReset> : null;
        if (validPendingReset(pending)) return pending;
      } catch {
        // Ignore one malformed entry and continue looking for a valid request.
      }
    }
  } catch {
    // Browser storage can be unavailable in hardened/private contexts.
  }
  return null;
}

export function prepareResetRequest(workspaceId: string, mode: 'clean' | 'demo', operationId?: string): PendingReset {
  const key = resetStorageKey(workspaceId);
  const pending = readPendingResetRequest(workspaceId);
  let valid = Boolean(operationId)
    && Boolean(pending);
  if (valid && operationId && pending!.operationId !== operationId) valid = false;
  if (valid && pending!.mode !== mode) {
    throw new Error(`A ${pending!.mode} reset is pending. Resume it before starting a different reset mode.`);
  }
  const request = valid ? pending! : { version: 1 as const, workspaceId, mode, operationId: operationId ?? crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
  try {
    window.localStorage.setItem(key, JSON.stringify(request));
  } catch {
    // Reset still works when browser storage is unavailable; only crash recovery is reduced.
  }
  return request;
}

export function completeResetRequest(workspaceId: string, operationId: string) {
  const key = resetStorageKey(workspaceId);
  try {
    const value = window.localStorage.getItem(key);
    const pending = value ? JSON.parse(value) as Partial<PendingReset> : null;
    if (pending?.operationId === operationId) window.localStorage.removeItem(key);
  } catch {
    // The server result is authoritative; unavailable browser storage is not fatal.
  }
}

export function legacyWorkspaceRecords(workspace: LegacyWorkspace): Array<Record<string, unknown>> {
  const companies = new Map(workspace.companies.map((company) => [company.id, company]));
  const people = new Map(workspace.people.map((person) => [person.id, person]));
  const statusMap: Record<string, string> = { Exploring: 'exploring', Qualified: 'qualified', Proposal: 'proposal', Won: 'won' };
  const records: Array<Record<string, unknown>> = [];

  for (const company of workspace.companies) {
    records.push({
      objectType: 'company' satisfies RecordType,
      name: company.name,
      status: 'prospect',
      lifecycle: 'prospect',
      companyName: company.name,
      tags: [company.industry].filter(Boolean),
      fields: { domain: company.domain, industry: company.industry, description: company.description, legacyId: company.id },
    });
  }
  for (const person of workspace.people) {
    records.push({
      objectType: 'contact' satisfies RecordType,
      name: person.name,
      status: person.strength >= 85 ? 'customer' : 'active',
      lifecycle: person.strength >= 85 ? 'customer' : 'prospect',
      email: person.email,
      phone: person.phone,
      companyName: companies.get(person.companyId)?.name,
      source: person.source,
      tags: person.tags,
      fields: { role: person.role, location: person.location, relationshipStrength: person.strength, lastContactAt: person.lastContact, notes: person.notes, legacyId: person.id },
    });
  }
  for (const opportunity of workspace.opportunities) {
    records.push({
      objectType: 'opportunity' satisfies RecordType,
      name: opportunity.name,
      status: statusMap[opportunity.stage] ?? 'exploring',
      lifecycle: opportunity.stage === 'Won' ? 'customer' : 'prospect',
      companyName: companies.get(opportunity.companyId)?.name,
      amountCents: Math.max(0, Math.round(opportunity.value * 100)),
      probability: opportunity.stage === 'Won' ? 100 : opportunity.stage === 'Proposal' ? 65 : opportunity.stage === 'Qualified' ? 40 : 15,
      fields: { nextAction: opportunity.nextStep, primaryContact: people.get(opportunity.personId)?.name, legacyId: opportunity.id },
    });
  }
  for (const task of workspace.followUps) {
    records.push({
      objectType: 'task' satisfies RecordType,
      name: task.title,
      status: task.completed ? 'completed' : 'open',
      lifecycle: 'active',
      companyName: people.get(task.personId ?? '') ? companies.get(people.get(task.personId ?? '')!.companyId)?.name : undefined,
      dueAt: task.dueDate,
      priority: 'medium',
      fields: { reason: task.reason, personName: people.get(task.personId ?? '')?.name, legacyId: task.id },
    });
  }
  for (const activity of workspace.interactions) {
    const person = people.get(activity.personId);
    records.push({
      objectType: 'activity' satisfies RecordType,
      name: `${activity.type} · ${person?.name ?? 'Contact'}`,
      status: 'completed',
      lifecycle: 'active',
      companyName: person ? companies.get(person.companyId)?.name : undefined,
      source: activity.source,
      closedAt: activity.occurredAt,
      fields: { channel: activity.type.toLowerCase(), occurredAt: activity.occurredAt, summary: activity.summary, personName: person?.name, legacyId: activity.id },
    });
  }
  return records.slice(0, 75);
}
