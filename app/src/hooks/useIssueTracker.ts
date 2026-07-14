/**
 * useIssueTracker — board data binding: categories + active tasks over the
 * generated `IssueTrackerClient`.
 *
 * Canonical Calimero data-binding pattern (mero-react v4):
 *  - `useWorkspace()` resolves the shared context + executor identity.
 *  - the generated client wraps `mero.rpc.execute`.
 *  - `useSubscription([contextId])` re-fetches on every sync event, so
 *    changes from other team members appear live with no polling.
 *
 * `list_tasks(false)` already excludes archived tasks server-side, matching
 * the spec's "board view always shows every active task" requirement.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { IssueTrackerClient } from '../api/issue-tracker/IssueTrackerClient';
import type { Category, Priority, Status, Task } from '../pages/app/types';

export interface UseIssueTrackerArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

export interface UseIssueTrackerReturn {
  categories: Category[];
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  ready: boolean;
  createCategory: (name: string) => Promise<void>;
  createTask: (title: string, description: string, categoryId: string, assignee: string) => Promise<void>;
  assignTask: (taskId: string, assignee: string) => Promise<void>;
  setPriority: (taskId: string, priority: Priority) => Promise<void>;
  moveTask: (taskId: string, categoryId: string) => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  archiveTask: (taskId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useIssueTracker({ contextId, executorPublicKey }: UseIssueTrackerArgs): UseIssueTrackerReturn {
  const { mero } = useMero();
  const [categories, setCategories] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Memoized typed client — null until the context + identity resolve.
  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new IssueTrackerClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [cats, tks] = await Promise.all([
        client.listCategories(),
        client.listTasks({ include_archived: false }),
      ]);
      setCategories(cats);
      setTasks(tks.map((t) => ({ ...t, priority: t.priority as Priority, status: t.status as Status })));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates: re-fetch on any sync event for this context (local or remote).
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const createCategory = useCallback(async (name: string) => {
    if (!client) return;
    await client.createCategory({ name });
    await refresh();
  }, [client, refresh]);

  const createTask = useCallback(async (title: string, description: string, categoryId: string, assignee: string) => {
    if (!client) return;
    await client.createTask({ title, description, category_id: categoryId, assignee });
    await refresh();
  }, [client, refresh]);

  const assignTask = useCallback(async (taskId: string, assignee: string) => {
    if (!client) return;
    await client.assignTask({ task_id: taskId, assignee });
    await refresh();
  }, [client, refresh]);

  const setPriority = useCallback(async (taskId: string, priority: Priority) => {
    if (!client) return;
    await client.setPriority({ task_id: taskId, priority });
    await refresh();
  }, [client, refresh]);

  const moveTask = useCallback(async (taskId: string, categoryId: string) => {
    if (!client) return;
    await client.moveTask({ task_id: taskId, category_id: categoryId });
    await refresh();
  }, [client, refresh]);

  const completeTask = useCallback(async (taskId: string) => {
    if (!client) return;
    await client.completeTask({ task_id: taskId });
    await refresh();
  }, [client, refresh]);

  const archiveTask = useCallback(async (taskId: string) => {
    if (!client) return;
    await client.archiveTask({ task_id: taskId });
    await refresh();
  }, [client, refresh]);

  return {
    categories,
    tasks,
    loading,
    error,
    ready: client !== null,
    createCategory,
    createTask,
    assignTask,
    setPriority,
    moveTask,
    completeTask,
    archiveTask,
    refresh,
  };
}
