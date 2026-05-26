import { useCallback, useEffect, useRef, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import {
  WhiteboardClient,
  type Shape,
  type TextElement,
  type Comment,
  type Cursor,
} from '../api/whiteboard/WhiteboardClient';

// Throttle cursor writes to 50 ms so we don't flood the network.
const CURSOR_THROTTLE_MS = 50;
// Poll cursors every second — they change frequently and don't emit events.
const CURSOR_POLL_MS = 1_000;

export type { Shape, TextElement, Comment, Cursor };

export interface UseWhiteboardCanvasReturn {
  shapes: Shape[];
  texts: TextElement[];
  cursors: Cursor[];
  loading: boolean;
  error: Error | null;
  /** Executor key resolved for this context (needed by callers that build their own client). */
  executorKey: string | null;

  addShape: (
    shape_type: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ) => Promise<string>;
  updateShapePosition: (shape_id: string, x: number, y: number) => Promise<void>;
  deleteShape: (shape_id: string) => Promise<void>;

  addText: (
    content: string,
    x: number,
    y: number,
    font_size: number,
    color: string,
  ) => Promise<string>;
  updateText: (text_id: string, content: string) => Promise<void>;
  deleteText: (text_id: string) => Promise<void>;

  addComment: (target_id: string, body: string) => Promise<string>;
  deleteComment: (comment_id: string) => Promise<void>;
  getCommentsForTarget: (target_id: string) => Promise<Comment[]>;

  /** Throttled — safe to call on every mousemove. */
  updateCursor: (x: number, y: number) => Promise<void>;
  clearCanvas: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useWhiteboardCanvas(
  contextId: string | null,
  lobbyExecutorPublicKey: string | null,
): UseWhiteboardCanvasReturn {
  const { mero } = useMero();
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [texts, setTexts] = useState<TextElement[]>([]);
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [executorKey, setExecutorKey] = useState<string | null>(null);

  // Resolve the per-context executor identity (may differ from the lobby key).
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
          return;
        }
        if (!cancelled && lobbyExecutorPublicKey) {
          setExecutorKey(lobbyExecutorPublicKey);
        }
      } catch {
        if (!cancelled && lobbyExecutorPublicKey) {
          setExecutorKey(lobbyExecutorPublicKey);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, lobbyExecutorPublicKey]);

  const getClient = useCallback((): WhiteboardClient | null => {
    if (!mero || !contextId || !executorKey) return null;
    return new WhiteboardClient(mero, contextId, executorKey);
  }, [mero, contextId, executorKey]);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [s, t, c] = await Promise.all([
        client.getAllShapes(),
        client.getAllText(),
        client.getAllCursors(),
      ]);
      setShapes(s);
      setTexts(t);
      setCursors(c);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  // Initial load + reload when context / executor changes.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll cursors independently at a higher cadence (cursor events are frequent
  // but deliberately don't re-trigger a full refresh to avoid flooding).
  useEffect(() => {
    if (!contextId || !executorKey) return;
    const id = setInterval(async () => {
      const client = getClient();
      if (!client) return;
      try {
        setCursors(await client.getAllCursors());
      } catch { /* transient */ }
    }, CURSOR_POLL_MS);
    return () => clearInterval(id);
  }, [contextId, executorKey, getClient]);

  // Subscribe to all canvas events — shapes, text, comments, clear.
  useSubscription(contextId ? [contextId] : [], () => {
    void refresh();
  });

  // --- Shape mutations ---

  const addShape = useCallback(async (
    shape_type: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ): Promise<string> => {
    const client = getClient();
    if (!client) throw new Error('Canvas client not ready');
    const id = await client.addShape({ shape_type, x, y, width, height, color });
    await refresh();
    return id;
  }, [getClient, refresh]);

  const updateShapePosition = useCallback(async (
    shape_id: string,
    x: number,
    y: number,
  ): Promise<void> => {
    const client = getClient();
    if (!client) return;
    await client.updateShapePosition({ shape_id, x, y });
    await refresh();
  }, [getClient, refresh]);

  const deleteShape = useCallback(async (shape_id: string): Promise<void> => {
    const client = getClient();
    if (!client) return;
    await client.deleteShape({ shape_id });
    await refresh();
  }, [getClient, refresh]);

  // --- Text mutations ---

  const addText = useCallback(async (
    content: string,
    x: number,
    y: number,
    font_size: number,
    color: string,
  ): Promise<string> => {
    const client = getClient();
    if (!client) throw new Error('Canvas client not ready');
    const id = await client.addText({ content, x, y, font_size, color });
    await refresh();
    return id;
  }, [getClient, refresh]);

  const updateText = useCallback(async (
    text_id: string,
    content: string,
  ): Promise<void> => {
    const client = getClient();
    if (!client) return;
    await client.updateText({ text_id, content });
    await refresh();
  }, [getClient, refresh]);

  const deleteText = useCallback(async (text_id: string): Promise<void> => {
    const client = getClient();
    if (!client) return;
    await client.deleteText({ text_id });
    await refresh();
  }, [getClient, refresh]);

  // --- Comment mutations ---

  const addComment = useCallback(async (
    target_id: string,
    body: string,
  ): Promise<string> => {
    const client = getClient();
    if (!client) throw new Error('Canvas client not ready');
    const id = await client.addComment({ target_id, body });
    await refresh();
    return id;
  }, [getClient, refresh]);

  const deleteComment = useCallback(async (comment_id: string): Promise<void> => {
    const client = getClient();
    if (!client) return;
    await client.deleteComment({ comment_id });
    await refresh();
  }, [getClient, refresh]);

  const getCommentsForTarget = useCallback(async (
    target_id: string,
  ): Promise<Comment[]> => {
    const client = getClient();
    if (!client) return [];
    return client.getCommentsForTarget({ target_id });
  }, [getClient]);

  // --- Cursor (throttled) ---

  const lastCursorRef = useRef(0);
  const updateCursor = useCallback(async (x: number, y: number): Promise<void> => {
    const now = Date.now();
    if (now - lastCursorRef.current < CURSOR_THROTTLE_MS) return;
    lastCursorRef.current = now;
    const client = getClient();
    if (!client) return;
    try { await client.updateCursor({ x, y }); } catch { /* transient */ }
  }, [getClient]);

  // --- Clear ---

  const clearCanvas = useCallback(async (): Promise<void> => {
    const client = getClient();
    if (!client) return;
    await client.clearCanvas();
    await refresh();
  }, [getClient, refresh]);

  return {
    shapes,
    texts,
    cursors,
    loading,
    error,
    executorKey,
    addShape,
    updateShapePosition,
    deleteShape,
    addText,
    updateText,
    deleteText,
    addComment,
    deleteComment,
    getCommentsForTarget,
    updateCursor,
    clearCanvas,
    refresh,
  };
}
