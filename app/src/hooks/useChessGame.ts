/**
 * useChessGame — binds the shared `chess-game` service to the frontend.
 *
 * Mirrors the neutral foundation's data-binding pattern (formerly `useItems`):
 *  - `useWorkspace()` resolves the shared context + the executor identity to
 *    sign RPC calls with.
 *  - the generated `ChessGameClient` wraps `mero.rpc.execute`.
 *  - `useSubscription([contextId])` re-fetches on every sync event, so the
 *    opponent's submitted move (or a resignation) appears live with no
 *    polling.
 *
 * Local move preview + unlimited undo-before-submit are handled entirely in
 * `ChessBoardView` component state — this hook only ever reads/writes the
 * SHARED game (`get_game_state`, `list_moves`, `create_game`, `submit_move`,
 * `resign`); it never stores a previewed move.
 *
 * `get_game_state` always succeeds (the backend returns a `status: "pending"`
 * placeholder game before `create_game` is called), so there is no error-race
 * between bootstrapping the workspace and the game existing — callers just
 * check `game.status`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { ChessGameClient, type Game, type Move } from '../api/chess-game/ChessGameClient';

export interface UseChessGameArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

export interface UseChessGameReturn {
  game: Game | null;
  moves: Move[];
  loading: boolean;
  error: Error | null;
  ready: boolean;
  /** True while `create_game` is in flight. */
  creating: boolean;
  createGame: (opponentIdentity: string) => Promise<void>;
  submitMove: (from: string, to: string, promotion: string | null) => Promise<void>;
  resign: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useChessGame({ contextId, executorPublicKey }: UseChessGameArgs): UseChessGameReturn {
  const { mero } = useMero();
  const [game, setGame] = useState<Game | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [creating, setCreating] = useState(false);

  // Memoized typed client — null until the context + identity resolve.
  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new ChessGameClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [state, history] = await Promise.all([client.getGameState(), client.listMoves()]);
      setGame(state);
      setMoves(history);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates: re-fetch on any sync event for this context — the
  // opponent's submitted move or resignation appears without polling.
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const createGame = useCallback(async (opponentIdentity: string) => {
    if (!client) return;
    setCreating(true);
    setError(null);
    try {
      await client.createGame({ opponent: opponentIdentity });
      await refresh();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setCreating(false);
    }
  }, [client, refresh]);

  const submitMove = useCallback(async (from: string, to: string, promotion: string | null) => {
    if (!client) return;
    setError(null);
    try {
      await client.submitMove({ from, to, promotion });
      await refresh(); // optimistic refetch so the board doesn't lag
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e; // let ChessBoardView revert its local preview
    }
  }, [client, refresh]);

  const resign = useCallback(async () => {
    if (!client) return;
    setError(null);
    try {
      await client.resign();
      await refresh();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    }
  }, [client, refresh]);

  return {
    game,
    moves,
    loading,
    error,
    ready: client !== null,
    creating,
    createGame,
    submitMove,
    resign,
    refresh,
  };
}
