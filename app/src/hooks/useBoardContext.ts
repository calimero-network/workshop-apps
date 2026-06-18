import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { BoardClient, Task, Comment } from '../api/board/BoardClient';

export type { Task, Comment };

export interface UseBoardContextReturn {
  tasks: Task[];
  tasksLoading: boolean;
  tasksError: Error | null;
  refreshTasks: () => Promise<void>;

  createTask: (title: string, description: string, priority: string) => Promise<void>;
  updateTaskStatus: (taskId: string, newStatus: string) => Promise<void>;
  assignTask: (taskId: string, assignee: string) => Promise<void>;

  comments: Comment[];
  commentsLoading: boolean;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
  refreshComments: (taskId: string) => Promise<void>;
  addComment: (taskId: string, body: string) => Promise<void>;
  editComment: (commentId: string, newBody: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;

  executorKey: string | null;
}

export function useBoardContext(
  contextId: string | null,
  executorPublicKey: string | null,
): UseBoardContextReturn {
  const { mero } = useMero();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<Error | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Resolve per-context executor identity (may differ from the workspace identity).
  const [executorKey, setExecutorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) { setExecutorKey(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) { setExecutorKey(identities[0]); return; }
        if (!cancelled && executorPublicKey) setExecutorKey(executorPublicKey);
      } catch {
        if (!cancelled && executorPublicKey) setExecutorKey(executorPublicKey);
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, executorPublicKey]);

  const getClient = useCallback((): BoardClient | null => {
    if (!mero || !contextId || !executorKey) return null;
    return new BoardClient(mero, contextId, executorKey);
  }, [mero, contextId, executorKey]);

  const refreshTasks = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setTasksLoading(true);
    setTasksError(null);
    try {
      const list = await client.getTasks();
      setTasks(list);
    } catch (err) {
      setTasksError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setTasksLoading(false);
    }
  }, [getClient]);

  const refreshComments = useCallback(async (taskId: string) => {
    const client = getClient();
    if (!client) return;
    setCommentsLoading(true);
    try {
      const list = await client.getComments({ task_id: taskId });
      setComments(list);
    } catch {
      // keep previous on transient errors
    } finally {
      setCommentsLoading(false);
    }
  }, [getClient]);

  // Load tasks on mount / context change
  useEffect(() => { void refreshTasks(); }, [refreshTasks]);

  // Reload comments when selected task changes
  useEffect(() => {
    if (selectedTaskId) void refreshComments(selectedTaskId);
    else setComments([]);
  }, [selectedTaskId, refreshComments]);

  // Subscribe to board events and refresh state
  useSubscription(contextId ? [contextId] : [], () => {
    void refreshTasks();
    if (selectedTaskId) void refreshComments(selectedTaskId);
  });

  const createTask = useCallback(async (title: string, description: string, priority: string) => {
    const client = getClient();
    if (!client) return;
    await client.createTask({ title, description, priority });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const updateTaskStatus = useCallback(async (taskId: string, newStatus: string) => {
    const client = getClient();
    if (!client) return;
    await client.updateTaskStatus({ task_id: taskId, new_status: newStatus });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const assignTask = useCallback(async (taskId: string, assignee: string) => {
    const client = getClient();
    if (!client) return;
    await client.assignTask({ task_id: taskId, assignee });
    await refreshTasks();
  }, [getClient, refreshTasks]);

  const addComment = useCallback(async (taskId: string, body: string) => {
    const client = getClient();
    if (!client) return;
    await client.addComment({ task_id: taskId, body });
    await refreshComments(taskId);
  }, [getClient, refreshComments]);

  const editComment = useCallback(async (commentId: string, newBody: string) => {
    const client = getClient();
    if (!client) return;
    const taskId = selectedTaskId;
    await client.editComment({ comment_id: commentId, new_body: newBody });
    if (taskId) await refreshComments(taskId);
  }, [getClient, refreshComments, selectedTaskId]);

  const deleteComment = useCallback(async (commentId: string) => {
    const client = getClient();
    if (!client) return;
    const taskId = selectedTaskId;
    await client.deleteComment({ comment_id: commentId });
    if (taskId) await refreshComments(taskId);
  }, [getClient, refreshComments, selectedTaskId]);

  return {
    tasks,
    tasksLoading,
    tasksError,
    refreshTasks,
    createTask,
    updateTaskStatus,
    assignTask,
    comments,
    commentsLoading,
    selectedTaskId,
    setSelectedTaskId,
    refreshComments,
    addComment,
    editComment,
    deleteComment,
    executorKey,
  };
}
