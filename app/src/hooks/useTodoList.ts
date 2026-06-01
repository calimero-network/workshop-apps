import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { TodoClient, Task } from '../api/todo/TodoClient';

export type { Task };

export interface UseTodoListReturn {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  createTask: (title: string, description: string) => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  reopenTask: (taskId: string) => Promise<void>;
  editTask: (taskId: string, title: string, description: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  assignTask: (taskId: string, assignee: string) => Promise<void>;
}

export function useTodoList(
  contextId: string | null,
  executorPublicKey: string | null,
): UseTodoListReturn {
  const { mero } = useMero();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const getClient = useCallback((): TodoClient | null => {
    if (!mero || !contextId || !executorPublicKey) return null;
    return new TodoClient(mero, contextId, executorPublicKey);
  }, [mero, contextId, executorPublicKey]);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const result = await client.listTasks();
      // Sort: open tasks first (by created_at asc), then completed (by created_at asc)
      const sorted = [...result].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return a.created_at - b.created_at;
      });
      setTasks(sorted);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // React to any state change propagated from other peers
  useSubscription(contextId ? [contextId] : [], () => {
    void refresh();
  });

  const createTask = useCallback(async (title: string, description: string) => {
    const client = getClient();
    if (!client) return;
    await client.createTask({ title, description });
    await refresh();
  }, [getClient, refresh]);

  const completeTask = useCallback(async (taskId: string) => {
    const client = getClient();
    if (!client) return;
    await client.completeTask({ task_id: taskId });
    await refresh();
  }, [getClient, refresh]);

  const reopenTask = useCallback(async (taskId: string) => {
    const client = getClient();
    if (!client) return;
    await client.reopenTask({ task_id: taskId });
    await refresh();
  }, [getClient, refresh]);

  const editTask = useCallback(async (taskId: string, title: string, description: string) => {
    const client = getClient();
    if (!client) return;
    await client.editTask({ task_id: taskId, title, description });
    await refresh();
  }, [getClient, refresh]);

  const deleteTask = useCallback(async (taskId: string) => {
    const client = getClient();
    if (!client) return;
    await client.deleteTask({ task_id: taskId });
    await refresh();
  }, [getClient, refresh]);

  const assignTask = useCallback(async (taskId: string, assignee: string) => {
    const client = getClient();
    if (!client) return;
    await client.assignTask({ task_id: taskId, assignee });
    await refresh();
  }, [getClient, refresh]);

  return {
    tasks,
    loading,
    error,
    refresh,
    createTask,
    completeTask,
    reopenTask,
    editTask,
    deleteTask,
    assignTask,
  };
}
