import type { CRMWorkspace } from './crm';

const DB_NAME = 'clover-local-crm';
const STORE_NAME = 'workspaces';
const WORKSPACE_KEY = 'current';
const FALLBACK_KEY = 'clover.workspace.v1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadWorkspace(): Promise<CRMWorkspace | null> {
  if (typeof window === 'undefined') return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(WORKSPACE_KEY);
      request.onsuccess = () => resolve((request.result as CRMWorkspace | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    const raw = window.localStorage.getItem(FALLBACK_KEY);
    return raw ? JSON.parse(raw) as CRMWorkspace : null;
  }
}

export async function saveWorkspace(workspace: CRMWorkspace): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(workspace, WORKSPACE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(workspace));
  }
}

export async function deleteWorkspace(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(WORKSPACE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    window.localStorage.removeItem(FALLBACK_KEY);
  }
}
