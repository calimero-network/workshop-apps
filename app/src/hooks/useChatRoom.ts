/**
 * useTableSession — per-context hook for a live D&D table.
 *
 * Keeps the game log, game session info, and character roster in sync.
 * Re-fetches on every `useSubscription` event from the table context and on
 * a 5-second poll so HP changes, turn advances, and log entries propagate
 * even when subscription events are delayed.
 *
 * DM detection: compare `tableExecutorKey` to `gameInfo.dm_id` — both are
 * base58-encoded public keys.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { TableClient, Character, GameSession, TableEvent } from '../api/table/TableClient';

export interface CharCreateParams {
  name: string;
  class: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface UseTableSessionReturn {
  events: TableEvent[];
  gameInfo: GameSession | null;
  characters: Character[];
  myCharacter: Character | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;

  tableExecutorKey: string | null;
  /** True when the current user's public key matches the DM's public key. */
  isDm: boolean;

  // Player actions
  postMessage: (text: string) => Promise<void>;
  createCharacter: (params: CharCreateParams) => Promise<void>;

  // DM-only actions
  createGame: (name: string) => Promise<void>;
  rollForPlayer: (playerId: string, ability: string, reason: string) => Promise<void>;
  rollNpc: (npcName: string, modifier: number, reason: string) => Promise<void>;
  setDifficulty: (dc: number) => Promise<void>;
  adjustHp: (characterId: string, delta: number) => Promise<void>;
  setGameState: (state: string) => Promise<void>;
  setTurnOrder: (players: string[]) => Promise<void>;
  advanceTurn: () => Promise<void>;
}

// Keep the function name `useChatRoom` so ChatPage.tsx imports stay stable.
export function useChatRoom(
  contextId: string | null,
  _lobbyExecutorPublicKey: string | null,
): UseTableSessionReturn {
  const { mero } = useMero();

  // Resolve this context's own executor identity (may differ from the lobby key)
  const [tableExecutorKey, setTableExecutorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) {
      setTableExecutorKey(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) {
          setTableExecutorKey(identities[0]);
        } else if (!cancelled && _lobbyExecutorPublicKey) {
          setTableExecutorKey(_lobbyExecutorPublicKey);
        }
      } catch {
        if (!cancelled && _lobbyExecutorPublicKey) {
          setTableExecutorKey(_lobbyExecutorPublicKey);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, _lobbyExecutorPublicKey]);

  const [events, setEvents] = useState<TableEvent[]>([]);
  const [gameInfo, setGameInfo] = useState<GameSession | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [myCharacter, setMyCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const getClient = useCallback((): TableClient | null => {
    if (!mero || !contextId || !tableExecutorKey) return null;
    return new TableClient(mero, contextId, tableExecutorKey);
  }, [mero, contextId, tableExecutorKey]);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [log, info, chars] = await Promise.all([
        client.getGameLog(),
        client.getGameInfo(),
        client.getAllCharacters(),
      ]);
      setEvents(log);
      setGameInfo(info);
      setCharacters(chars);

      // Fetch own character separately (may return error if none exists)
      try {
        const mine = await client.getMyCharacter();
        setMyCharacter(mine);
      } catch {
        setMyCharacter(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Subscribe to real-time events from this table context
  useSubscription(contextId ? [contextId] : [], () => {
    void refresh();
  });

  // Poll every 5 s — subscription alone misses heartbeat/membership events
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!contextId) return;
    const id = setInterval(() => { void refreshRef.current(); }, 5_000);
    return () => clearInterval(id);
  }, [contextId]);

  const isDm = !!(tableExecutorKey && gameInfo && gameInfo.dm_id === tableExecutorKey);

  // ---- Player actions ----

  const postMessage = useCallback(async (text: string) => {
    const client = getClient();
    if (!client) return;
    await client.postMessage({ text });
    await refresh();
  }, [getClient, refresh]);

  const createCharacter = useCallback(async (params: CharCreateParams) => {
    const client = getClient();
    if (!client) return;
    // Map public-facing names (class, int) to the codegen'd Rust-escaped names (class_, int_)
    await client.createCharacter({
      name: params.name,
      class_: params.class,
      str: params.str,
      dex: params.dex,
      con: params.con,
      int_: params.int,
      wis: params.wis,
      cha: params.cha,
    });
    await refresh();
  }, [getClient, refresh]);

  // ---- DM actions ----

  const createGame = useCallback(async (name: string) => {
    const client = getClient();
    if (!client) throw new Error('Table client not ready');
    await client.createGame({ name });
    await refresh();
  }, [getClient, refresh]);

  const rollForPlayer = useCallback(async (playerId: string, ability: string, reason: string) => {
    const client = getClient();
    if (!client) throw new Error('Table client not ready');
    await client.rollForPlayer({ player_id: playerId, ability, reason });
    await refresh();
  }, [getClient, refresh]);

  const rollNpc = useCallback(async (npcName: string, modifier: number, reason: string) => {
    const client = getClient();
    if (!client) throw new Error('Table client not ready');
    await client.rollNpc({ npc_name: npcName, modifier, reason });
    await refresh();
  }, [getClient, refresh]);

  const setDifficulty = useCallback(async (dc: number) => {
    const client = getClient();
    if (!client) throw new Error('Table client not ready');
    await client.setDifficulty({ dc });
    await refresh();
  }, [getClient, refresh]);

  const adjustHp = useCallback(async (characterId: string, delta: number) => {
    const client = getClient();
    if (!client) throw new Error('Table client not ready');
    await client.adjustHp({ character_id: characterId, delta });
    await refresh();
  }, [getClient, refresh]);

  const setGameState = useCallback(async (state: string) => {
    const client = getClient();
    if (!client) throw new Error('Table client not ready');
    await client.setGameState({ state });
    await refresh();
  }, [getClient, refresh]);

  const setTurnOrder = useCallback(async (players: string[]) => {
    const client = getClient();
    if (!client) throw new Error('Table client not ready');
    await client.setTurnOrder({ players });
    await refresh();
  }, [getClient, refresh]);

  const advanceTurn = useCallback(async () => {
    const client = getClient();
    if (!client) throw new Error('Table client not ready');
    await client.advanceTurn();
    await refresh();
  }, [getClient, refresh]);

  return {
    events,
    gameInfo,
    characters,
    myCharacter,
    loading,
    error,
    refresh,
    tableExecutorKey,
    isDm,
    postMessage,
    createCharacter,
    createGame,
    rollForPlayer,
    rollNpc,
    setDifficulty,
    adjustHp,
    setGameState,
    setTurnOrder,
    advanceTurn,
  };
}
