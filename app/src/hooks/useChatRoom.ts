/**
 * useTodoList — per-context task state for team-todos.
 *
 * Re-exported as `useChatRoom` so the existing import in ChatPage continues to
 * compile unchanged; the real name used internally is `useTodoList`.
 */

import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { TodolistClient, Task } from '../api/todolist/TodolistClient';

export interface UseTodoListReturn {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  addTask: (description: string) => Promise<void>;
  editTask: (taskId: string, newDescription: string) => Promise<void>;
  toggleTaskDone: (taskId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  refreshTasks: () => Promise<void>;
  /** Executor key resolved for this context (used to determine task ownership). */
  executorKey: string | null;
}

export function useTodoList(
  contextId: string | null,
  _lobbyExecutorPublicKey: string | null,
): UseTodoListReturn {
  const { mero } = useMero();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Resolve the executor identity for THIS context (may differ from the lobby
  // identity once per-instance contexts have their own memberships).
  const [executorKey, setExecutorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) {
      setExecutorKey(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) {
          setExecutorKey(identities[0]);
        }
      } catch {
        if (!cancelled && _lobbyExecutorPublicKey) {
          setExecutorKey(_lobbyExecutorPublicKey);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, _lobbyExecutorPublicKey]);

  const getClient = useCallback((): TodolistClient | null => {
    if (!mero || !contextId || !executorKey) return null;
    return new TodolistClient(mero, contextId, executorKey);
  }, [mero, contextId, executorKey]);

  const refreshTasks = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const result = await client.listTasks();
      setTasks(result ?? []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  // Load tasks on mount / context change
  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  // React to any context state change (local or synced from other nodes)
  useSubscription(contextId ? [contextId] : [], () => {
    void refreshTasks();
  });

  const addTask = useCallback(async (description: string) => {
    const client = getClient();
    if (!client) return;
    await client.addTask({ description });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const editTask = useCallback(async (taskId: string, newDescription: string) => {
    const client = getClient();
    if (!client) return;
    await client.editTask({ task_id: taskId, new_description: newDescription });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const toggleTaskDone = useCallback(async (taskId: string) => {
    const client = getClient();
    if (!client) return;
    await client.toggleTaskDone({ task_id: taskId });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const deleteTask = useCallback(async (taskId: string) => {
    const client = getClient();
    if (!client) return;
    await client.deleteTask({ task_id: taskId });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  return {
    tasks,
    loading,
    error,
    addTask,
    editTask,
    toggleTaskDone,
    deleteTask,
    refreshTasks,
    executorKey,
  };
}

// Re-export under the legacy name so the RoomView import in ChatPage still resolves.
export { useTodoList as useChatRoom };
