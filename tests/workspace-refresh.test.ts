import { describe, expect, it, vi } from 'vitest';

import { runWorkspaceRefresh } from '@/lib/workspace-refresh';

describe('workspace refresh failure policy', () => {
  it('preserves the rendered snapshot after a committed mutation when refresh fails', async () => {
    let renderedSnapshot = 'existing workspace';
    let fatalError: string | null = null;
    const onLoaded = vi.fn((snapshot: string) => { renderedSnapshot = snapshot; });
    const onFatalError = vi.fn((message: string) => { fatalError = message; });

    await expect(runWorkspaceRefresh({
      load: async () => { throw new Error('Snapshot temporarily unavailable.'); },
      onLoaded,
      onFatalError,
      failureMode: 'preserve',
    })).resolves.toBeNull();

    expect(renderedSnapshot).toBe('existing workspace');
    expect(fatalError).toBeNull();
    expect(onLoaded).not.toHaveBeenCalled();
    expect(onFatalError).not.toHaveBeenCalled();
  });

  it('still raises a fatal error for initial loads and explicit fatal refreshes', async () => {
    let fatalError: string | null = null;
    const onFatalError = (message: string) => { fatalError = message; };

    await expect(runWorkspaceRefresh({
      load: async () => { throw new Error('Identity provider unavailable.'); },
      onLoaded: () => undefined,
      onFatalError,
    })).resolves.toBeNull();

    expect(fatalError).toBe('Identity provider unavailable.');
  });

  it('applies a successful replacement snapshot in either mode', async () => {
    let renderedSnapshot = 'old';
    const loaded = await runWorkspaceRefresh({
      load: async () => 'fresh',
      onLoaded: (snapshot) => { renderedSnapshot = snapshot; },
      onFatalError: () => undefined,
      failureMode: 'preserve',
    });

    expect(loaded).toBe('fresh');
    expect(renderedSnapshot).toBe('fresh');
  });
});
