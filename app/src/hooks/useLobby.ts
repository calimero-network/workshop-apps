/**
 * useLobby (rooms topology) - lists rooms registered in the directory
 * (lobby) context. SCAFFOLD hook: the build agent reskins RoomList's
 * display, not this data-binding.
 *
 * Same pattern as base useItems: a memoized generated client wraps
 * mero.rpc.execute, useSubscription refreshes the list on every sync event
 * for the directory context (local or remote).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { DirectoryClient } from '../api/directory/DirectoryClient';
import type { RoomSummaryView } from '../api/directory/DirectoryClient';

// Mirrors the directory crate's RoomSummaryView field-for-field (an alias,
// not a hand-copy, so it can never drift from what codegen emits).
export type RoomView = RoomSummaryView;

export interface UseLobbyReturn {
  rooms: RoomView[];
  roomsLoading: boolean;
  refetch: () => Promise<void>;
}

export function useLobby(
  directoryContextId: string | null,
  executorPublicKey: string | null,
): UseLobbyReturn {
  const { mero } = useMero();
  const [rooms, setRooms] = useState<RoomView[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);

  const client = useMemo(
    () =>
      mero && directoryContextId && executorPublicKey
        ? new DirectoryClient(mero, directoryContextId, executorPublicKey)
        : null,
    [mero, directoryContextId, executorPublicKey],
  );

  const refetch = useCallback(async () => {
    if (!client) { setRooms([]); return; }
    setRoomsLoading(true);
    try {
      setRooms(await client.getRooms());
    } catch {
      // transient RPC error - keep the last-known list, as base useItems does.
    } finally {
      setRoomsLoading(false);
    }
  }, [client]);

  useEffect(() => { void refetch(); }, [refetch]);

  // Live updates: re-fetch on any sync event for the directory context.
  useSubscription(directoryContextId ? [directoryContextId] : [], () => { void refetch(); });

  return { rooms, roomsLoading, refetch };
}
