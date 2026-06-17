import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { RoomClient, Message } from '../api/room/RoomClient';
import { uploadBlob } from '../api/blob';

export interface UseChatRoomReturn {
  messages: Message[];
  loading: boolean;
  error: Error | null;
  sendMessage: (body: string) => Promise<void>;
  sendAttachment: (file: File, caption?: string) => Promise<void>;
  editMessage: (messageId: string, newBody: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  refreshMessages: () => Promise<void>;
  roomName: string | null;
  messageCount: number;
  roomExecutorKey: string | null;
  deleteRoom: () => Promise<void>;
  renameRoom: (newName: string) => Promise<void>;
  addModerator: (publicKey: string) => Promise<void>;
  removeModerator: (publicKey: string) => Promise<void>;
  moderators: string[];
  refreshModerators: () => Promise<void>;
  /** Load this room's private unsent draft (per-member, never replicated). */
  loadDraft: () => Promise<string>;
  /** Persist (or clear, when empty) the private draft for this room. */
  saveDraft: (content: string) => Promise<void>;
}

// Single draft slot per room context. Drafts are #[app::private] in the room
// contract, so this is per-member, on-node, and never synced to peers.
const DRAFT_KEY = 'message';

export function useChatRoom(
  contextId: string | null,
  _lobbyExecutorPublicKey: string | null,
): UseChatRoomReturn {
  const { mero } = useMero();
  const [messages, setMessages] = useState<Message[]>([]);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [moderators, setModerators] = useState<string[]>([]);

  // Resolve the executor identity for THIS room's context (may differ from
  // the lobby identity when the room lives in a subgroup).
  const [roomExecutorKey, setRoomExecutorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) {
      setRoomExecutorKey(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) {
          setRoomExecutorKey(identities[0]);
        }
      } catch {
        // Context not yet joined or identity not available — fall back to lobby key
        if (!cancelled && _lobbyExecutorPublicKey) {
          setRoomExecutorKey(_lobbyExecutorPublicKey);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [mero, contextId, _lobbyExecutorPublicKey]);

  const getClient = useCallback(() => {
    if (!mero || !contextId || !roomExecutorKey) return null;
    return new RoomClient(mero, contextId, roomExecutorKey);
  }, [mero, contextId, roomExecutorKey]);

  const refreshMessages = useCallback(async () => {
    const client = getClient();
    if (!client) return;

    setLoading(true);
    setError(null);
    try {
      const [msgs, info] = await Promise.all([
        client.getRecentMessages({ count: 100 }),
        client.getRoomInfo(),
      ]);
      setMessages(msgs);
      setRoomName(info.name);
      setMessageCount(info.message_count);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  const renameRoom = useCallback(async (newName: string) => {
    const client = getClient();
    if (!client) throw new Error('Room client not ready');
    await client.renameRoom({ new_name: newName });
    await refreshMessages();
  }, [getClient, refreshMessages]);

  const refreshModerators = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    try {
      setModerators(await client.listModerators());
    } catch {
      // transient — keep previous list
    }
  }, [getClient]);

  // Load messages + moderators on mount / context change
  useEffect(() => {
    refreshMessages();
    refreshModerators();
  }, [refreshMessages, refreshModerators]);

  // React to any room state change (local or synced from other nodes)
  useSubscription(contextId ? [contextId] : [], () => {
    refreshMessages();
    refreshModerators();
  });

  const sendMessage = useCallback(async (body: string) => {
    const client = getClient();
    if (!client) return;
    await client.sendMessage({ body });
    await refreshMessages();
  }, [getClient, refreshMessages]);

  // Upload the file to the node blob store, then record the reference on a
  // message via the contract. `caption` is an optional text body.
  const sendAttachment = useCallback(async (file: File, caption = '') => {
    const client = getClient();
    if (!client) return;
    const { blobId, size } = await uploadBlob(file);
    await client.sendAttachment({
      blob_id: blobId,
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size,
      body: caption,
    });
    await refreshMessages();
  }, [getClient, refreshMessages]);

  const editMessage = useCallback(async (messageId: string, newBody: string) => {
    const client = getClient();
    if (!client) return;
    await client.editMessage({ message_id: messageId, new_body: newBody });
    await refreshMessages();
  }, [getClient, refreshMessages]);

  const deleteMessage = useCallback(async (messageId: string) => {
    const client = getClient();
    if (!client) return;
    await client.deleteMessage({ message_id: messageId });
    await refreshMessages();
  }, [getClient, refreshMessages]);

  const deleteRoom = useCallback(async () => {
    const client = getClient();
    if (!client) throw new Error('Room client not ready');
    await client.deleteRoom();
  }, [getClient]);

  const addModerator = useCallback(async (publicKey: string) => {
    const client = getClient();
    if (!client) throw new Error('Room client not ready');
    await client.addModerator({ public_key: publicKey });
    await refreshModerators();
  }, [getClient, refreshModerators]);

  const removeModerator = useCallback(async (publicKey: string) => {
    const client = getClient();
    if (!client) throw new Error('Room client not ready');
    await client.removeModerator({ public_key: publicKey });
    await refreshModerators();
  }, [getClient, refreshModerators]);

  const loadDraft = useCallback(async (): Promise<string> => {
    const client = getClient();
    if (!client) return '';
    try {
      // get_draft returns Option<String> → may come back null.
      return (await client.getDraft({ key: DRAFT_KEY })) ?? '';
    } catch {
      return '';
    }
  }, [getClient]);

  const saveDraft = useCallback(async (content: string) => {
    const client = getClient();
    if (!client) return;
    try {
      if (content.trim()) await client.saveDraft({ key: DRAFT_KEY, content });
      else await client.deleteDraft({ key: DRAFT_KEY });
    } catch {
      // best-effort: a lost draft is non-critical
    }
  }, [getClient]);

  return {
    messages,
    loading,
    error,
    sendMessage,
    sendAttachment,
    editMessage,
    deleteMessage,
    refreshMessages,
    roomName,
    messageCount,
    roomExecutorKey,
    deleteRoom,
    renameRoom,
    addModerator,
    removeModerator,
    moderators,
    refreshModerators,
    loadDraft,
    saveDraft,
  };
}
