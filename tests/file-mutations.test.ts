import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import {
  completeUploadReceiptStatement,
  documentDeleteIdentity,
  documentUploadIdentity,
  executeDurableDocumentDelete,
  loadDocumentDeleteOutbox,
  prepareDocumentDelete,
  readFileMutationReceipt,
  resumeDocumentDelete,
} from '@/server/file-mutations';
import { claimDocumentUpload } from '@/server/upload-intents';
import { workspaceMutationFence } from '@/server/mutation-fence';
import type { RequestIdentity } from '@/server/request-context';
import type { TenantObjectStorage } from '@/server/object-storage';

type LocalStatement = D1PreparedStatement & { run(): Promise<D1Result<unknown>> };

function localD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  const migrations = readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const migration of migrations) {
    const source = readFileSync(new URL(`../drizzle/${migration}`, import.meta.url), 'utf8');
    for (const statement of source.split('--> statement-breakpoint')) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }

  const prepare = (sql: string, bindings: unknown[] = []): LocalStatement => ({
    bind: (...values: unknown[]) => prepare(sql, values),
    run: async () => {
      const result = sqlite.prepare(sql).run(...bindings as never[]);
      return { success: true, results: [], meta: { changes: Number(result.changes) } } as unknown as D1Result<unknown>;
    },
    first: async <T>() => (sqlite.prepare(sql).get(...bindings as never[]) ?? null) as T | null,
    all: async <T>() => ({
      success: true,
      results: sqlite.prepare(sql).all(...bindings as never[]) as T[],
      meta: { changes: 0 },
    }) as unknown as D1Result<T>,
    raw: async () => [],
  }) as unknown as LocalStatement;

  const db = {
    prepare,
    batch: async <T = unknown>(statements: D1PreparedStatement[]) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results: D1Result<T>[] = [];
        for (const statement of statements) results.push(await (statement as LocalStatement).run() as D1Result<T>);
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  return { db, sqlite };
}

function seedWorkspace(sqlite: DatabaseSync, workspaceId = 'workspace-a') {
  const now = '2026-08-31T12:00:00.000Z';
  sqlite.prepare(`
    INSERT INTO workspaces (
      id,owner_user_id,owner_email,owner_name,name,profile,timezone,currency,locale,
      settings_json,mutation_epoch,created_at,updated_at
    ) VALUES (?,?,?,?,?,'personal','America/Los_Angeles','USD','en-US','{}',0,?,?)
  `).run(workspaceId, 'owner-a', 'owner@example.test', 'Owner', 'Test CRM', now, now);
}

function seedDocument(sqlite: DatabaseSync, workspaceId = 'workspace-a', id = 'document-a') {
  const now = '2026-08-31T12:00:00.000Z';
  seedWorkspace(sqlite, workspaceId);
  sqlite.prepare(`
    INSERT INTO upload_intents (
      workspace_id,id,object_key,mutation_epoch,status,lease_expires_at,last_error_code,
      cleanup_attempts,created_at,updated_at
    ) VALUES (?,?,?,0,'pending','2026-08-31T12:15:00.000Z',NULL,0,?,?)
  `).run(workspaceId, id, `${workspaceId}/~epoch/00000000000000000000/${id}/blob`, now, now);
  sqlite.prepare(`
    INSERT INTO records (
      id,workspace_id,object_type,name,status,lifecycle,owner_user_id,amount_cents,
      currency,probability,fields_json,tags_json,version,created_at,updated_at
    ) VALUES (?,?,'document','Receipt.pdf','active','active','owner-a',0,'USD',0,?,'[]',1,?,?)
  `).run(id, workspaceId, JSON.stringify({ objectKey: `${workspaceId}/~epoch/00000000000000000000/${id}/blob` }), now, now);
  sqlite.prepare("UPDATE upload_intents SET status='committed',lease_expires_at=NULL,updated_at=? WHERE workspace_id=? AND id=?").run(now, workspaceId, id);
}

const identity: RequestIdentity = {
  userId: 'owner-a',
  email: 'owner@example.test',
  displayName: 'Owner',
  requestId: 'request-a',
  runtimeMode: 'device',
};

describe('durable document delete', () => {
  it('commits the pending receipt, outbox, Blob delete, metadata delete, and final receipt', async () => {
    const { db, sqlite } = localD1();
    seedDocument(sqlite);
    const operationKey = '018f089f-88f4-7b9a-9fbf-bc8e96f8cd11';
    const operation = await documentDeleteIdentity('workspace-a', operationKey, 'document-a');
    await prepareDocumentDelete(db, {
      workspaceId: 'workspace-a',
      identity,
      id: 'document-a',
      objectKey: 'workspace-a/~epoch/00000000000000000000/document-a/blob',
      recordName: 'Receipt.pdf',
      recordVersion: 1,
      mutationEpoch: 0,
      operationKey,
      requestHash: operation.requestHash,
      outboxId: operation.outboxId,
      requestedAuditId: operation.requestedAuditId,
      now: '2026-08-31T12:01:00.000Z',
    });

    expect(sqlite.prepare("SELECT status FROM records WHERE workspace_id='workspace-a' AND id='document-a'").get()).toEqual({ status: 'deleting' });
    const pending = await readFileMutationReceipt(db, 'workspace-a', 'document.delete', operationKey, operation.requestHash);
    expect(pending).toMatchObject({ statusCode: 202, discardedByReset: false });

    const outbox = await loadDocumentDeleteOutbox(db, 'workspace-a', operation.outboxId);
    expect(outbox).not.toBeNull();
    const deleteObject = vi.fn(async () => undefined);
    const storage = { delete: deleteObject } as unknown as TenantObjectStorage;
    await expect(resumeDocumentDelete(db, storage, 'workspace-a', outbox!)).resolves.toMatchObject({
      ok: true,
      result: { id: 'document-a', deleted: true },
    });

    expect(deleteObject).toHaveBeenCalledExactlyOnceWith('workspace-a', 'workspace-a/~epoch/00000000000000000000/document-a/blob');
    expect(sqlite.prepare("SELECT id FROM records WHERE workspace_id='workspace-a' AND id='document-a'").get()).toBeUndefined();
    expect(sqlite.prepare('SELECT status FROM outbox_events WHERE id=?').get(operation.outboxId)).toEqual({ status: 'processed' });
    const completed = await readFileMutationReceipt(db, 'workspace-a', 'document.delete', operationKey, operation.requestHash);
    expect(completed).toMatchObject({ statusCode: 200, response: { result: { deleted: true } } });
  });

  it('recovers an ambiguous post-commit database response without repeating the outcome', async () => {
    const recovered = { ok: true as const, result: { id: 'document-a', deleted: true }, replayed: true };
    const markRetry = vi.fn(async () => undefined);
    const deleteObject = vi.fn(async () => undefined);

    await expect(executeDurableDocumentDelete({
      deleteObject,
      finalize: async () => { throw new Error('response lost after commit'); },
      recoverCommitted: async () => recovered,
      markRetry,
    })).resolves.toEqual(recovered);

    expect(deleteObject).toHaveBeenCalledOnce();
    expect(markRetry).not.toHaveBeenCalled();
  });

  it('leaves a durable retry when storage is unavailable', async () => {
    const markRetry = vi.fn(async () => undefined);
    const finalize = vi.fn(async () => ({ ok: true as const, result: {} }));
    await expect(executeDurableDocumentDelete({
      deleteObject: async () => { throw new Error('Blob unavailable'); },
      finalize,
      recoverCommitted: async () => null,
      markRetry,
    })).rejects.toMatchObject({ code: 'document_delete_storage_pending' });
    expect(markRetry).toHaveBeenCalledOnce();
    expect(finalize).not.toHaveBeenCalled();
  });

  it('keeps the same operation resumable when bytes are gone but D1 completion is pending', async () => {
    const markRetry = vi.fn(async () => undefined);
    await expect(executeDurableDocumentDelete({
      deleteObject: async () => undefined,
      finalize: async () => { throw new Error('D1 unavailable'); },
      recoverCommitted: async () => null,
      markRetry,
    })).rejects.toMatchObject({ code: 'document_delete_completion_pending', status: 503 });
    expect(markRetry).toHaveBeenCalledOnce();
  });
});

describe('durable document upload receipt', () => {
  it('claims a deterministic pending intent and atomically advances its HTTP receipt with metadata', async () => {
    const { db, sqlite } = localD1();
    seedWorkspace(sqlite);
    const operationKey = '018f089f-88f4-7b9a-9fbf-bc8e96f8cd12';
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain', lastModified: 1_777_777_777_000 });
    const identity = await documentUploadIdentity('workspace-a', operationKey, file, 'hello.txt');
    const objectKey = `workspace-a/~epoch/00000000000000000000/${identity.id}/blob`;
    const fields = { objectKey, contentType: file.type, size: file.size, uploadedAt: '2026-08-31T12:02:00.000Z' };
    const response = { ok: true as const, result: { id: identity.id, name: 'hello.txt', fields } };

    await expect(claimDocumentUpload(db, {
      workspaceId: 'workspace-a',
      id: identity.id,
      objectKey,
      mutationEpoch: 0,
      operationKey,
      requestHash: identity.requestHash,
      pendingResponse: { ok: true, result: { ...response.result, uploading: true } },
      now: '2026-08-31T12:02:00.000Z',
    })).resolves.toMatchObject({ status: 'pending', object_key: objectKey, mutation_epoch: 0 });
    await expect(readFileMutationReceipt(db, 'workspace-a', 'document.upload', operationKey, identity.requestHash)).resolves.toMatchObject({ statusCode: 202 });

    const now = '2026-08-31T12:02:01.000Z';
    const results = await db.batch([
      db.prepare(`
        INSERT INTO records (
          id,workspace_id,object_type,name,status,lifecycle,owner_user_id,amount_cents,
          currency,probability,fields_json,tags_json,version,created_at,updated_at
        ) VALUES (?,?,'document','hello.txt','active','active','owner-a',0,'USD',0,?,'[]',1,?,?)
      `).bind(identity.id, 'workspace-a', JSON.stringify(fields), now, now),
      db.prepare("UPDATE upload_intents SET status='committed',lease_expires_at=NULL,last_error_code=NULL,updated_at=? WHERE workspace_id=? AND id=? AND mutation_epoch=0").bind(now, 'workspace-a', identity.id),
      db.prepare(`
        INSERT INTO audit_events (
          id,workspace_id,actor_user_id,action,entity_type,entity_id,after_json,
          metadata_json,request_id,created_at
        ) VALUES ('upload-audit','workspace-a','owner-a','document.upload','document',?,?,?,'request-a',?)
      `).bind(identity.id, JSON.stringify({ name: 'hello.txt' }), JSON.stringify({ source: 'file-api', mutationEpoch: 0 }), now),
      db.prepare("INSERT INTO outbox_events (id,workspace_id,topic,payload_json,status,attempts,available_at,created_at) VALUES ('upload-outbox','workspace-a','crm.document.uploaded','{}','pending',0,?,?)").bind(now, now),
      completeUploadReceiptStatement(db, {
        workspaceId: 'workspace-a',
        operationKey,
        requestHash: identity.requestHash,
        response,
        now,
      }),
      workspaceMutationFence(db, 'workspace-a', 0, `document.upload:${identity.id}`, now),
    ]);
    expect(Number(results[4].meta?.changes ?? 0)).toBe(1);
    await expect(readFileMutationReceipt(db, 'workspace-a', 'document.upload', operationKey, identity.requestHash)).resolves.toMatchObject({
      statusCode: 201,
      response: { result: { id: identity.id } },
    });
  });
});
