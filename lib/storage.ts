import type { CRMWorkspace } from './crm';

const DB_NAME = 'free-crm-local';
const LEGACY_DB_NAME = 'clover-local-crm';
const STORE_NAME = 'workspaces';
const WORKSPACE_KEY = 'current';
const FALLBACK_KEY = 'free-crm.workspace.v1';
const LEGACY_FALLBACK_KEY = 'clover.workspace.v1';

function openDb(name = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readWorkspace(name: string): Promise<CRMWorkspace | null> {
  const db = await openDb(name);
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(WORKSPACE_KEY);
      request.onsuccess = () => resolve((request.result as CRMWorkspace | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function deleteDbWorkspace(name: string): Promise<void> {
  const db = await openDb(name);
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(WORKSPACE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function loadWorkspace(): Promise<CRMWorkspace | null> {
  if (typeof window === 'undefined') return null;
  try {
    const current = await readWorkspace(DB_NAME);
    if (current) return current;

    const legacy = await readWorkspace(LEGACY_DB_NAME);
    if (legacy) {
      await saveWorkspace(legacy);
      return legacy;
    }
  } catch {
    // Fall through to localStorage when IndexedDB is unavailable.
  }

  try {
    const raw = window.localStorage.getItem(FALLBACK_KEY) ?? window.localStorage.getItem(LEGACY_FALLBACK_KEY);
    if (!raw) return null;
    const workspace = JSON.parse(raw) as CRMWorkspace;
    window.localStorage.setItem(FALLBACK_KEY, raw);
    return workspace;
  } catch {
    return null;
  }
}

export async function saveWorkspace(workspace: CRMWorkspace): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(workspace, WORKSPACE_KEY);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  } catch {
    window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(workspace));
  }
}

export async function deleteWorkspace(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await Promise.allSettled([deleteDbWorkspace(DB_NAME), deleteDbWorkspace(LEGACY_DB_NAME)]);
  } finally {
    window.localStorage.removeItem(FALLBACK_KEY);
    window.localStorage.removeItem(LEGACY_FALLBACK_KEY);
  }
}
