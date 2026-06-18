/**
 * useTodosList — per-workspace task list backed by the `todos` context.
 *
 * Subscribes to the todos context for real-time updates and exposes CRUD
 * mutations that re-fetch after every write so the UI stays in sync.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { TodosClient, Task } from '../api/todos/TodosClient';

export interface UseTodosListReturn {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  addTask: (description: string) => Promise<void>;
  toggleTask: (taskId: string) => Promise<void>;
  editTask: (taskId: string, newDescription: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTodosList(
  contextId: string | null,
  executorPublicKey: string | null,
): UseTodosListReturn {
  const { mero } = useMero();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Resolve the executor identity for this context (may differ from auth key).
  const [resolvedExecutorKey, setResolvedExecutorKey] = useState<string | null>(executorPublicKey);

  useEffect(() => {
    setResolvedExecutorKey(executorPublicKey);
  }, [executorPublicKey]);

  // Keep a stable ref to the client so callbacks don't stale-close over it.
  const clientRef = useRef<TodosClient | null>(null);
  clientRef.current =
    mero && contextId && resolvedExecutorKey
      ? new TodosClient(mero, contextId, resolvedExecutorKey)
      : null;

  const refresh = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const result = await client.listTasks();
      // Sort: open tasks first, then done; within each group newest first.
      const sorted = [...result].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return b.created_at - a.created_at;
      });
      setTasks(sorted);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + re-load when context/executor changes.
  useEffect(() => {
    if (contextId && resolvedExecutorKey) {
      void refresh();
    } else {
      setTasks([]);
      setError(null);
    }
  }, [contextId, resolvedExecutorKey, refresh]);

  // React to real-time CRDT sync events from peers.
  useSubscription(contextId ? [contextId] : [], () => {
    void refresh();
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const addTask = useCallback(async (description: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Todos client not ready');
    await client.addTask({ description: description.trim() });
    await refresh();
  }, [refresh]);

  const toggleTask = useCallback(async (taskId: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Todos client not ready');
    await client.toggleTask({ task_id: taskId });
    await refresh();
  }, [refresh]);

  const editTask = useCallback(async (taskId: string, newDescription: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Todos client not ready');
    await client.editTask({ task_id: taskId, new_description: newDescription.trim() });
    await refresh();
  }, [refresh]);

  const deleteTask = useCallback(async (taskId: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Todos client not ready');
    await client.deleteTask({ task_id: taskId });
    await refresh();
  }, [refresh]);

  return {
    tasks,
    loading,
    error,
    addTask,
    toggleTask,
    editTask,
    deleteTask,
    refresh,
  };
}
