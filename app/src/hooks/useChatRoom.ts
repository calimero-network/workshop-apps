import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { ChatClient, Message } from '../api/chat/ChatClient';

export type { Message };

export interface UseChatRoomReturn {
  messages: Message[];
  loading: boolean;
  error: Error | null;
  sendMessage: (body: string) => Promise<void>;
  editMessage: (messageId: string, newBody: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  refreshMessages: () => Promise<void>;
  chatExecutorKey: string | null;
}

/**
 * Hook for the 1-on-1 chat context.
 *
 * `contextId` is the single chat context within the selected namespace.
 * The executor key is resolved per-context so it never leaks across
 * namespace switches (each namespace = a separate conversation).
 */
export function useChatRoom(
  contextId: string | null,
  fallbackExecutorKey: string | null,
): UseChatRoomReturn {
  const { mero } = useMero();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Resolve the executor identity for this context. Re-resolves whenever
  // the context changes so identity is always scoped to the right namespace.
  const [chatExecutorKey, setChatExecutorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) {
      setChatExecutorKey(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) {
          setChatExecutorKey(identities[0]);
          return;
        }
        if (!cancelled && fallbackExecutorKey) {
          setChatExecutorKey(fallbackExecutorKey);
        }
      } catch {
        if (!cancelled && fallbackExecutorKey) {
          setChatExecutorKey(fallbackExecutorKey);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [mero, contextId, fallbackExecutorKey]);

  const getClient = useCallback((): ChatClient | null => {
    if (!mero || !contextId || !chatExecutorKey) return null;
    return new ChatClient(mero, contextId, chatExecutorKey);
  }, [mero, contextId, chatExecutorKey]);

  const refreshMessages = useCallback(async () => {
    const client = getClient();
    if (!client) return;

    setLoading(true);
    setError(null);
    try {
      const msgs = await client.listMessages();
      // Sort chronologically so newest is at the bottom.
      const sorted = [...msgs].sort((a, b) => a.created_at - b.created_at);
      setMessages(sorted);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  // Reload on mount and whenever the context or executor key changes.
  useEffect(() => {
    if (contextId && chatExecutorKey) {
      void refreshMessages();
    } else {
      setMessages([]);
    }
  }, [contextId, chatExecutorKey, refreshMessages]);

  // Real-time: react to sync events from the chat context.
  useSubscription(contextId ? [contextId] : [], () => {
    void refreshMessages();
  });

  const sendMessage = useCallback(async (body: string) => {
    const client = getClient();
    if (!client) return;
    await client.sendMessage({ body });
    await refreshMessages();
  }, [getClient, refreshMessages]);

  const editMessage = useCallback(async (messageId: string, newBody: string) => {
    const client = getClient();
    if (!client) return;
    await client.editMessage({ id: messageId, new_body: newBody });
    await refreshMessages();
  }, [getClient, refreshMessages]);

  const deleteMessage = useCallback(async (messageId: string) => {
    const client = getClient();
    if (!client) return;
    await client.deleteMessage({ id: messageId });
    await refreshMessages();
  }, [getClient, refreshMessages]);

  return {
    messages,
    loading,
    error,
    sendMessage,
    editMessage,
    deleteMessage,
    refreshMessages,
    chatExecutorKey,
  };
}
