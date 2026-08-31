import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/server/request-context';
import { executeDurableUploadIntent } from '@/server/upload-intents';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('durable upload intent orchestration', () => {
  it('registers before R2 and compensates a delayed PUT fenced by reset', async () => {
    const events: string[] = [];
    const putGate = deferred();
    let capturedEpoch = -1;
    let currentEpoch = 0;
    const stale = new ApiError(409, 'workspace_mutation_stale', 'reset advanced the epoch');

    const execution = executeDurableUploadIntent({
      register: async () => { capturedEpoch = currentEpoch; events.push('register'); },
      put: async () => { events.push('put:start'); await putGate.promise; events.push('put:end'); },
      finalize: async () => {
        events.push('finalize');
        if (capturedEpoch !== currentEpoch) throw stale;
        events.push('commit');
      },
      recoverCommitted: async () => ({ committed: false }),
      deleteObject: async () => { events.push('delete'); },
      markCleaned: async () => { events.push('cleaned'); },
      markCleanupPending: async () => { events.push('cleanup_pending'); },
    });

    await vi.waitFor(() => expect(events).toEqual(['register', 'put:start']));
    currentEpoch += 1;
    events.push('reset');
    putGate.resolve();

    await expect(execution).rejects.toBe(stale);
    expect(events).toEqual(['register', 'put:start', 'reset', 'put:end', 'finalize', 'delete', 'cleaned']);
    expect(events).not.toContain('commit');
  });

  it('persists cleanup_pending when compensating object deletion fails', async () => {
    const stale = new ApiError(409, 'workspace_mutation_stale', 'reset advanced the epoch');
    let intentStatus = 'pending';
    const markPending = vi.fn(async (code: string) => { intentStatus = `${code}:cleanup_pending`; });
    const markCleaned = vi.fn(async () => { intentStatus = 'cleaned'; });

    const execution = executeDurableUploadIntent({
      register: async () => undefined,
      put: async () => undefined,
      finalize: async () => { throw stale; },
      recoverCommitted: async () => ({ committed: false }),
      deleteObject: async () => { throw new Error('R2 unavailable'); },
      markCleaned,
      markCleanupPending: markPending,
    });

    await expect(execution).rejects.toBe(stale);
    expect(markPending).toHaveBeenCalledExactlyOnceWith('upload_cleanup_failed');
    expect(markCleaned).not.toHaveBeenCalled();
    expect(intentStatus).toBe('upload_cleanup_failed:cleanup_pending');
  });

  it('does not delete bytes when an ambiguous finalize is durably committed', async () => {
    const deleteObject = vi.fn(async () => undefined);
    await expect(executeDurableUploadIntent({
      register: async () => undefined,
      put: async () => undefined,
      finalize: async () => { throw new Error('D1 response lost'); },
      recoverCommitted: async () => ({ committed: true, value: 'committed' }),
      deleteObject,
      markCleaned: async () => undefined,
      markCleanupPending: async () => undefined,
    })).resolves.toBe('committed');
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('does not touch R2 when durable registration is rejected', async () => {
    const put = vi.fn(async () => undefined);
    const deleteObject = vi.fn(async () => undefined);
    const reset = new ApiError(423, 'workspace_reset_in_progress', 'reset running');

    await expect(executeDurableUploadIntent({
      register: async () => { throw reset; },
      put,
      finalize: async () => undefined,
      recoverCommitted: async () => ({ committed: false }),
      deleteObject,
      markCleaned: async () => undefined,
      markCleanupPending: async () => undefined,
    })).rejects.toBe(reset);
    expect(put).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
