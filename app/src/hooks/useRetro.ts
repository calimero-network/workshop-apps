/**
 * useRetro — the sprint-retro data binding over the single shared context.
 *
 * Canonical Calimero pattern (mero-react v4):
 *  - `useWorkspace()` resolves the shared context + the executor identity we sign
 *    RPC calls with.
 *  - the generated `RetroBoardClient` wraps `mero.rpc.execute`.
 *  - `useSubscription([contextId])` re-fetches on every sync event, so cards,
 *    votes and done-state from other peers appear live within seconds.
 *
 * `get_cards` returns the cards; vote counts live in a separate map, so we fan
 * out one `get_votes(card_id)` per card and fold the count + "did I vote" +
 * "may I toggle/delete" flags into a single `BoardCard` the view renders.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { RetroBoardClient, Card, RetroSession } from '../api/retro-board/RetroBoardClient';

/** A card plus the derived counts/flags the board needs. */
export interface BoardCard extends Card {
  /** Number of upvotes. */
  votes: number;
  /** The current member has already upvoted (vote button disabled). */
  voted: boolean;
  /** The current member authored it or is the facilitator → may toggle/delete. */
  mine: boolean;
}

export interface UseRetroArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

export interface UseRetroReturn {
  retro: RetroSession | null;
  cards: BoardCard[];
  loading: boolean;
  error: Error | null;
  ready: boolean;
  createRetro: (name: string) => Promise<void>;
  addCard: (column: string, text: string) => Promise<void>;
  upvote: (cardId: string) => Promise<void>;
  toggleDone: (cardId: string) => Promise<void>;
  removeCard: (cardId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useRetro({ contextId, executorPublicKey }: UseRetroArgs): UseRetroReturn {
  const { mero } = useMero();
  const [retro, setRetro] = useState<RetroSession | null>(null);
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Memoized typed client — null until the context + identity resolve.
  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new RetroBoardClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [session, list] = await Promise.all([client.getRetro(), client.getCards()]);
      // ponytail: one get_votes per card — the ABI has no bulk count. Fine for a
      // retro board's card count; add a backend vote-counts view if it ever isn't.
      const withVotes = await Promise.all(
        list.map(async (card): Promise<BoardCard> => {
          const votes = await client.getVotes({ card_id: card.id });
          return {
            ...card,
            votes: votes.length,
            voted: votes.some((v) => v.voter === executorPublicKey),
            mine: card.author === executorPublicKey || session.created_by === executorPublicKey,
          };
        }),
      );
      setRetro(session);
      setCards(withVotes);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, executorPublicKey]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates: re-fetch on any sync event for this context (local or remote).
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  // Run a mutation then optimistically refetch; surface storage/auth errors.
  const run = useCallback(
    async (op: (c: RetroBoardClient) => Promise<unknown>) => {
      if (!client) return;
      try {
        await op(client);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [client, refresh],
  );

  const createRetro = useCallback((name: string) => run((c) => c.createRetro({ name })), [run]);
  const addCard = useCallback(
    (column: string, text: string) => run((c) => c.addCard({ column, text })),
    [run],
  );
  const upvote = useCallback((cardId: string) => run((c) => c.upvoteCard({ card_id: cardId })), [run]);
  const toggleDone = useCallback((cardId: string) => run((c) => c.toggleDone({ card_id: cardId })), [run]);
  const removeCard = useCallback((cardId: string) => run((c) => c.deleteCard({ card_id: cardId })), [run]);

  return {
    retro,
    cards,
    loading,
    error,
    ready: client !== null,
    createRetro,
    addCard,
    upvote,
    toggleDone,
    removeCard,
    refresh,
  };
}
