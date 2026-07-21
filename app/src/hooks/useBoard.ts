/**
 * useBoard (Ludo Lounge domain hook) - the live game state + actions for the
 * ACTIVE room. Mirrors the canonical useItems binding: a memoized generated
 * client (RoomClient) wraps mero.rpc.execute, useSubscription re-fetches the
 * board on every sync event for the room's context, and every mutation
 * refetches afterward so the UI never lags.
 *
 * `ws.contextId` / `ws.executorPublicKey` already point at the active room
 * (see useWorkspace) - this hook only cares about the game view on top.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { RoomClient, type BoardView } from '../api/room/RoomClient';

export interface UseBoardArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

export interface UseBoardReturn {
  board: BoardView | null;
  loading: boolean;
  error: Error | null;
  /** This peer's seat (0-3), or -1 if not seated on this board. */
  mySeat: number;
  /** True when it's this peer's turn and the match isn't finished. */
  isMyTurn: boolean;
  /** The value of this peer's own last roll (client-local, for the "roll
   *  again" prompt) - cleared once a new roll comes back non-six or it's no
   *  longer this peer's turn. */
  lastRollWasSix: boolean;
  rollDice: () => Promise<void>;
  moveToken: (tokenIndex: number) => Promise<void>;
  rolling: boolean;
  moving: boolean;
  refresh: () => Promise<void>;
}

export function useBoard({ contextId, executorPublicKey }: UseBoardArgs): UseBoardReturn {
  const { mero } = useMero();
  const [board, setBoard] = useState<BoardView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [rolling, setRolling] = useState(false);
  const [moving, setMoving] = useState(false);
  const [lastRollWasSix, setLastRollWasSix] = useState(false);

  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new RoomClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      setBoard(await client.getBoard());
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates: re-fetch on any sync event for this room's context (a
  // roll/move from any of the 4 seated players).
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const mySeat = board && executorPublicKey ? board.seats.indexOf(executorPublicKey) : -1;
  const isMyTurn = mySeat !== -1 && board !== null && board.turn_seat === mySeat && !board.finished;

  // Clear the "roll again" hint once it's no longer this peer's turn to roll
  // (a fresh pending_dice value, or the turn moving away).
  useEffect(() => {
    if (!isMyTurn || (board && board.pending_dice !== 0)) setLastRollWasSix(false);
  }, [isMyTurn, board?.pending_dice]);

  const rollDice = useCallback(async () => {
    if (!client) return;
    setError(null);
    setRolling(true);
    try {
      const value = await client.rollDice();
      setLastRollWasSix(value === 6);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setRolling(false);
    }
  }, [client, refresh]);

  const moveToken = useCallback(async (tokenIndex: number) => {
    if (!client) return;
    setError(null);
    setMoving(true);
    try {
      await client.moveToken({ token_index: tokenIndex });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setMoving(false);
    }
  }, [client, refresh]);

  return {
    board,
    loading,
    error,
    mySeat,
    isMyTurn,
    lastRollWasSix,
    rollDice,
    moveToken,
    rolling,
    moving,
    refresh,
  };
}
