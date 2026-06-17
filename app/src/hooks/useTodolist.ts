import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { TodolistClient, Task } from '../api/todolist/TodolistClient';

export interface UseTodolistReturn {
  tasks: Task[];
  openTasks: Task[];
  completedTasks: Task[];
  loading: boolean;
  error: Error | null;
  executorKey: string | null;
  refreshTasks: () => Promise<void>;
  createTask: (title: string) => Promise<void>;
  markComplete: (taskId: string) => Promise<void>;
  markIncomplete: (taskId: string) => Promise<void>;
  editTask: (taskId: string, newTitle: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  assignTask: (taskId: string, assignee: string) => Promise<void>;
}

export function useTodolist(
  contextId: string | null,
  /** Executor key for the todolist context (from useChatLobby.executorPublicKey). */
  executorPublicKey: string | null,
): UseTodolistReturn {
  const { mero } = useMero();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // For the single-service architecture the lobby context IS the todolist context,
  // so the caller's executorPublicKey is already the correct signing key.
  // We expose it so the UI can compare task.author === executorKey.
  const executorKey = executorPublicKey;

  const getClient = useCallback(() => {
    if (!mero || !contextId || !executorKey) return null;
    return new TodolistClient(mero, contextId, executorKey);
  }, [mero, contextId, executorKey]);

  const refreshTasks = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const list = await client.listTasks();
      // Stable sort: open first by created_at asc; completed last.
      setTasks([...list].sort((a, b) => a.created_at - b.created_at));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  // Initial load + refresh whenever context or executor changes.
  useEffect(() => {
    if (contextId && executorKey) {
      void refreshTasks();
    } else {
      setTasks([]);
      setError(null);
    }
  }, [contextId, executorKey, refreshTasks]);

  // React to any todolist state change synced from other nodes.
  useSubscription(contextId ? [contextId] : [], () => {
    void refreshTasks();
  });

  const createTask = useCallback(async (title: string) => {
    const client = getClient();
    if (!client) return;
    await client.createTask({ title: title.trim() });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const markComplete = useCallback(async (taskId: string) => {
    const client = getClient();
    if (!client) return;
    await client.markComplete({ task_id: taskId });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const markIncomplete = useCallback(async (taskId: string) => {
    const client = getClient();
    if (!client) return;
    await client.markIncomplete({ task_id: taskId });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const editTask = useCallback(async (taskId: string, newTitle: string) => {
    const client = getClient();
    if (!client) return;
    await client.editTask({ task_id: taskId, new_title: newTitle.trim() });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const deleteTask = useCallback(async (taskId: string) => {
    const client = getClient();
    if (!client) return;
    await client.deleteTask({ task_id: taskId });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const assignTask = useCallback(async (taskId: string, assignee: string) => {
    const client = getClient();
    if (!client) return;
    await client.assignTask({ task_id: taskId, assignee });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const openTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  return {
    tasks,
    openTasks,
    completedTasks,
    loading,
    error,
    executorKey,
    refreshTasks,
    createTask,
    markComplete,
    markIncomplete,
    editTask,
    deleteTask,
    assignTask,
  };
}
