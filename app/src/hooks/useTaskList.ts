import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { TodoClient, Task } from '../api/todo/TodoClient';

export type { Task };

export interface UseTaskListReturn {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  refreshTasks: () => Promise<void>;
  createTask: (title: string, description: string) => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  uncompleteTask: (taskId: string) => Promise<void>;
  editTask: (taskId: string, newTitle: string, newDescription: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
}

export function useTaskList(
  contextId: string | null,
  executorPublicKey: string | null,
): UseTaskListReturn {
  const { mero } = useMero();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const getClient = useCallback(() => {
    if (!mero || !contextId || !executorPublicKey) return null;
    return new TodoClient(mero, contextId, executorPublicKey);
  }, [mero, contextId, executorPublicKey]);

  const refreshTasks = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const list = await client.listTasks();
      // Sort by creation date ascending so oldest tasks appear first
      const sorted = [...list].sort((a, b) => a.created_at - b.created_at);
      setTasks(sorted);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  // Initial load and reload when context / executor changes
  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  // React to any context state change (local write or synced from peers)
  useSubscription(contextId ? [contextId] : [], () => {
    void refreshTasks();
  });

  const createTask = useCallback(async (title: string, description: string) => {
    const client = getClient();
    if (!client) return;
    await client.createTask({ title, description });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const completeTask = useCallback(async (taskId: string) => {
    const client = getClient();
    if (!client) return;
    await client.completeTask({ task_id: taskId });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const uncompleteTask = useCallback(async (taskId: string) => {
    const client = getClient();
    if (!client) return;
    await client.uncompleteTask({ task_id: taskId });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const editTask = useCallback(async (
    taskId: string,
    newTitle: string,
    newDescription: string,
  ) => {
    const client = getClient();
    if (!client) return;
    await client.editTask({ task_id: taskId, new_title: newTitle, new_description: newDescription });
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
    refreshTasks,
    createTask,
    completeTask,
    uncompleteTask,
    editTask,
    deleteTask,
  };
}
