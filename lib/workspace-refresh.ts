export type WorkspaceRefreshFailureMode = 'fatal' | 'preserve';

type WorkspaceRefreshOptions<T> = {
  load: () => Promise<T>;
  onLoaded: (snapshot: T) => void;
  onFatalError: (message: string) => void;
  failureMode?: WorkspaceRefreshFailureMode;
};

export async function runWorkspaceRefresh<T>({
  load,
  onLoaded,
  onFatalError,
  failureMode = 'fatal',
}: WorkspaceRefreshOptions<T>): Promise<T | null> {
  try {
    const snapshot = await load();
    onLoaded(snapshot);
    return snapshot;
  } catch (error) {
    if (failureMode === 'fatal') {
      onFatalError(error instanceof Error ? error.message : 'Could not load the workspace.');
    }
    return null;
  }
}
