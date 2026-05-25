/**
 * useLobbyDirectory — workspace-level directory backed by the `lobby` context.
 *
 * Presence + display name are per-author (AuthoredMap on the backend), so a
 * peer cannot spoof anyone else's status or name.
 *
 * Cadences (constants):
 *  - HEARTBEAT_INTERVAL_MS:  write our own last_seen_ms every 15 s.
 *  - POLL_INTERVAL_MS:       refresh list_presence + list_names every 7 s.
 *  - ONLINE_WINDOW_MS:       a member is "online" if seen ≤ 35 s ago.
 *
 * The poll backstops `useSubscription` — sync events refresh us promptly,
 * but heartbeats deliberately emit no event (15 s × N peers would spam the
 * bus), so we still need a clock-driven poll to surface them.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { LobbyClient } from '../api/lobby/LobbyClient';

const HEARTBEAT_INTERVAL_MS = 15_000;
const POLL_INTERVAL_MS = 7_000;
const ONLINE_WINDOW_MS = 35_000;

export interface UseLobbyDirectoryReturn {
  onlineMembers: Set<string>;
  memberNames: Record<string, string>;
  setName: (name: string) => Promise<void>;
}

export function useLobbyDirectory(
  lobbyContextId: string | null,
  lobbyExecutorKey: string | null,
): UseLobbyDirectoryReturn {
  const { mero } = useMero();
  const [onlineMembers, setOnlineMembers] = useState<Set<string>>(new Set());
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});

  const clientRef = useRef<LobbyClient | null>(null);
  clientRef.current =
    mero && lobbyContextId && lobbyExecutorKey
      ? new LobbyClient(mero, lobbyContextId, lobbyExecutorKey)
      : null;

  const refresh = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const [presence, names] = await Promise.all([
        client.listPresence(),
        client.listNames(),
      ]);
      const cutoff = Date.now() - ONLINE_WINDOW_MS;
      const online = new Set<string>();
      for (const p of presence) {
        if (p.last_seen_ms >= cutoff) online.add(p.member);
      }
      setOnlineMembers(online);
      const nameMap: Record<string, string> = {};
      for (const n of names) nameMap[n.member] = n.name;
      setMemberNames(nameMap);
    } catch {
      // transient — keep previous state
    }
  }, []);

  useEffect(() => {
    if (!lobbyContextId || !lobbyExecutorKey) return;
    let cancelled = false;
    const send = async () => {
      const client = clientRef.current;
      if (!client || cancelled) return;
      try { await client.heartbeat(); } catch { /* transient */ }
    };
    void send();
    const id = setInterval(() => { void send(); }, HEARTBEAT_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [lobbyContextId, lobbyExecutorKey]);

  useEffect(() => {
    if (!lobbyContextId || !lobbyExecutorKey) {
      setOnlineMembers(new Set());
      setMemberNames({});
      return;
    }
    void refresh();
    const id = setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [lobbyContextId, lobbyExecutorKey, refresh]);

  // Refresh on every sync event for the lobby context — picks up name changes
  // and incoming heartbeats faster than the 7 s poll.
  useSubscription(lobbyContextId ? [lobbyContextId] : [], () => {
    void refresh();
  });

  const setName = useCallback(async (name: string) => {
    const client = clientRef.current;
    if (!client) return;
    await client.setName({ name });
    void refresh();
  }, [refresh]);

  return { onlineMembers, memberNames, setName };
}
