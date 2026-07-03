/**
 * useTasks — live CRUD over the shared todo-list context.
 *
 * Canonical Calimero data-binding (mero-react v4):
 *  - useWorkspace() resolves contextId + executorPublicKey (the RPC signer).
 *  - TodoListClient wraps mero.rpc.execute for each backend method.
 *  - useSubscription([contextId]) re-fetches on every sync event so peer
 *    changes appear live with no polling.
 *  - refresh() is called after every mutation for an optimistic re-fetch.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { TodoListClient, Task } from '../api/todo-list/TodoListClient';

export type { Task };

export interface UseTasksArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

export interface UseTasksReturn {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  ready: boolean;
  addTask: (title: string) => Promise<void>;
  editTask: (id: string, newTitle: string) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTasks({ contextId, executorPublicKey }: UseTasksArgs): UseTasksReturn {
  const { mero } = useMero();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Memoised typed client — null until context + executor identity resolve.
  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new TodoListClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      setTasks(await client.getTasks());
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates: re-fetch on every sync event for this context (local + remote peers).
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const addTask = useCallback(async (title: string) => {
    if (!client) return;
    await client.addTask({ title });
    await refresh();
  }, [client, refresh]);

  const editTask = useCallback(async (id: string, newTitle: string) => {
    if (!client) return;
    await client.editTask({ id, new_title: newTitle });
    await refresh();
  }, [client, refresh]);

  const toggleTask = useCallback(async (id: string) => {
    if (!client) return;
    await client.toggleTask({ id });
    await refresh();
  }, [client, refresh]);

  const removeTask = useCallback(async (id: string) => {
    if (!client) return;
    await client.removeTask({ id });
    await refresh();
  }, [client, refresh]);

  return {
    tasks,
    loading,
    error,
    ready: client !== null,
    addTask,
    editTask,
    toggleTask,
    removeTask,
    refresh,
  };
}
