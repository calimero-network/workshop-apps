/**
 * useTodosState — task list for the active todos context.
 *
 * Resolves the per-context executor identity (may differ from lobby key),
 * then wires up `useSubscription` so any CRDT sync event triggers a refresh.
 * After every mutation, `refresh()` is called immediately so the UI stays
 * up-to-date without waiting for the next subscription tick.
 */

import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { TodosClient, Task } from '../api/todos/TodosClient';

export interface UseTodosStateReturn {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  executorPublicKey: string | null;
  refresh: () => Promise<void>;
  createTask: (title: string, description: string) => Promise<void>;
  assignTask: (taskId: string, assignee: string) => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  editTask: (taskId: string, title: string, description: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
}

export function useTodosState(
  contextId: string | null,
  fallbackExecutorKey: string | null,
): UseTodosStateReturn {
  const { mero } = useMero();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Resolve executor identity per-context (may differ from the lobby key when
  // the node created an independent identity for this context).
  const [executorPublicKey, setExecutorPublicKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) {
      setExecutorPublicKey(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) {
          setExecutorPublicKey(identities[0]);
          return;
        }
        if (!cancelled && fallbackExecutorKey) {
          setExecutorPublicKey(fallbackExecutorKey);
        }
      } catch {
        if (!cancelled && fallbackExecutorKey) {
          setExecutorPublicKey(fallbackExecutorKey);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, fallbackExecutorKey]);

  const getClient = useCallback((): TodosClient | null => {
    if (!mero || !contextId || !executorPublicKey) return null;
    return new TodosClient(mero, contextId, executorPublicKey);
  }, [mero, contextId, executorPublicKey]);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const result = await client.listTasks();
      setTasks(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // React to any sync event from other nodes.
  useSubscription(contextId ? [contextId] : [], () => {
    void refresh();
  });

  const createTask = useCallback(async (title: string, description: string) => {
    const client = getClient();
    if (!client) throw new Error('Todos client not ready');
    await client.createTask({ title, description });
    await refresh();
  }, [getClient, refresh]);

  const assignTask = useCallback(async (taskId: string, assignee: string) => {
    const client = getClient();
    if (!client) throw new Error('Todos client not ready');
    await client.assignTask({ task_id: taskId, assignee });
    await refresh();
  }, [getClient, refresh]);

  const completeTask = useCallback(async (taskId: string) => {
    const client = getClient();
    if (!client) throw new Error('Todos client not ready');
    await client.completeTask({ task_id: taskId });
    await refresh();
  }, [getClient, refresh]);

  const editTask = useCallback(async (taskId: string, title: string, description: string) => {
    const client = getClient();
    if (!client) throw new Error('Todos client not ready');
    await client.editTask({ task_id: taskId, title, description });
    await refresh();
  }, [getClient, refresh]);

  const deleteTask = useCallback(async (taskId: string) => {
    const client = getClient();
    if (!client) throw new Error('Todos client not ready');
    await client.deleteTask({ task_id: taskId });
    await refresh();
  }, [getClient, refresh]);

  return {
    tasks,
    loading,
    error,
    executorPublicKey,
    refresh,
    createTask,
    assignTask,
    completeTask,
    editTask,
    deleteTask,
  };
}
