import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { TodolistClient, Task } from '../api/todolist/TodolistClient';

export interface UseTodoListReturn {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  createTask: (title: string) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  assignTask: (id: string, assignee: string | null) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  refreshTasks: () => Promise<void>;
  executorPublicKey: string | null;
}

export function useTodoList(
  contextId: string | null,
  _fallbackExecutorPublicKey: string | null,
): UseTodoListReturn {
  const { mero } = useMero();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Resolve executor identity for this context; fall back to the lobby key
  // if the context identity isn't available yet.
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
        } else if (!cancelled && _fallbackExecutorPublicKey) {
          setExecutorPublicKey(_fallbackExecutorPublicKey);
        }
      } catch {
        if (!cancelled && _fallbackExecutorPublicKey) {
          setExecutorPublicKey(_fallbackExecutorPublicKey);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, _fallbackExecutorPublicKey]);

  const getClient = useCallback(() => {
    if (!mero || !contextId || !executorPublicKey) return null;
    return new TodolistClient(mero, contextId, executorPublicKey);
  }, [mero, contextId, executorPublicKey]);

  const refreshTasks = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const taskList = await client.listTasks();
      setTasks(taskList);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  // React to any state change synced from other peers
  useSubscription(contextId ? [contextId] : [], () => {
    void refreshTasks();
  });

  const createTask = useCallback(async (title: string) => {
    const client = getClient();
    if (!client) return;
    await client.createTask({ title });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const toggleTask = useCallback(async (id: string) => {
    const client = getClient();
    if (!client) return;
    await client.toggleTask({ id });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const assignTask = useCallback(async (id: string, assignee: string | null) => {
    const client = getClient();
    if (!client) return;
    await client.assignTask({ id, assignee });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const deleteTask = useCallback(async (id: string) => {
    const client = getClient();
    if (!client) return;
    await client.deleteTask({ id });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  return {
    tasks,
    loading,
    error,
    createTask,
    toggleTask,
    assignTask,
    deleteTask,
    refreshTasks,
    executorPublicKey,
  };
}
