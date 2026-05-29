import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import {
  KnowledgeGraphClient,
  type Document,
  type Tag,
  type Link,
} from '../api/knowledge-graph/KnowledgeGraphClient';

export interface UseKnowledgeGraphReturn {
  documents: Document[];
  links: Link[];
  tagsByDocument: Record<string, Tag[]>;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  executorKey: string | null;

  createDocument: (title: string, content: string) => Promise<string | null>;
  editDocument: (documentId: string, newTitle: string, newContent: string) => Promise<void>;
  addTag: (documentId: string, label: string) => Promise<string | null>;
  removeTag: (tagId: string) => Promise<void>;
  createLink: (
    sourceDocId: string,
    sourceText: string,
    targetDocId: string,
    targetText: string,
  ) => Promise<string | null>;
  deleteLink: (linkId: string) => Promise<void>;
}

export function useKnowledgeGraph(
  contextId: string | null,
  lobbyExecutorPublicKey: string | null,
): UseKnowledgeGraphReturn {
  const { mero } = useMero();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [tagsByDocument, setTagsByDocument] = useState<Record<string, Tag[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [executorKey, setExecutorKey] = useState<string | null>(null);

  // Resolve the executor identity for this context
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

  const getClient = useCallback((): KnowledgeGraphClient | null => {
    if (!mero || !contextId || !executorKey) return null;
    return new KnowledgeGraphClient(mero, contextId, executorKey);
  }, [mero, contextId, executorKey]);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [docs, lnks] = await Promise.all([
        client.listDocuments(),
        client.listLinks(),
      ]);
      setDocuments(docs);
      setLinks(lnks);

      // Fetch tags for all documents in parallel
      const tagEntries = await Promise.all(
        docs.map(async (doc) => {
          try {
            const tags = await client.listTagsByDocument({ document_id: doc.id });
            return [doc.id, tags] as [string, Tag[]];
          } catch {
            return [doc.id, []] as [string, Tag[]];
          }
        }),
      );
      setTagsByDocument(Object.fromEntries(tagEntries));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  // Load on mount and when context/executor changes
  useEffect(() => {
    if (executorKey) {
      void refresh();
    }
  }, [refresh, executorKey]);

  // Subscribe to graph events and refresh
  useSubscription(contextId ? [contextId] : [], () => {
    void refresh();
  });

  const createDocument = useCallback(async (title: string, content: string): Promise<string | null> => {
    const client = getClient();
    if (!client) return null;
    const id = await client.createDocument({ title, content });
    await refresh();
    return id;
  }, [getClient, refresh]);

  const editDocument = useCallback(async (
    documentId: string,
    newTitle: string,
    newContent: string,
  ): Promise<void> => {
    const client = getClient();
    if (!client) return;
    await client.editDocument({ document_id: documentId, new_title: newTitle, new_content: newContent });
    await refresh();
  }, [getClient, refresh]);

  const addTag = useCallback(async (documentId: string, label: string): Promise<string | null> => {
    const client = getClient();
    if (!client) return null;
    const id = await client.addTag({ document_id: documentId, label });
    await refresh();
    return id;
  }, [getClient, refresh]);

  const removeTag = useCallback(async (tagId: string): Promise<void> => {
    const client = getClient();
    if (!client) return;
    await client.removeTag({ tag_id: tagId });
    await refresh();
  }, [getClient, refresh]);

  const createLink = useCallback(async (
    sourceDocId: string,
    sourceText: string,
    targetDocId: string,
    targetText: string,
  ): Promise<string | null> => {
    const client = getClient();
    if (!client) return null;
    const id = await client.createLink({
      source_doc_id: sourceDocId,
      source_text: sourceText,
      target_doc_id: targetDocId,
      target_text: targetText,
    });
    await refresh();
    return id;
  }, [getClient, refresh]);

  const deleteLink = useCallback(async (linkId: string): Promise<void> => {
    const client = getClient();
    if (!client) return;
    await client.deleteLink({ link_id: linkId });
    await refresh();
  }, [getClient, refresh]);

  return {
    documents,
    links,
    tagsByDocument,
    loading,
    error,
    refresh,
    executorKey,
    createDocument,
    editDocument,
    addTag,
    removeTag,
    createLink,
    deleteLink,
  };
}
