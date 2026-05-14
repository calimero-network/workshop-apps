/**
 * useLobbyDirectory — stub for dnd-online-table.
 *
 * The `table` service has no presence/heartbeat/name endpoints, so this hook
 * returns empty values. It is kept to preserve the import interface used by
 * ChatPage and Sidebar without requiring a full refactor of those files.
 *
 * If a future version of this app adds a presence service, restore the full
 * implementation from the scaffold's useLobbyDirectory.ts.
 */

export interface UseLobbyDirectoryReturn {
  onlineMembers: Set<string>;
  memberNames: Record<string, string>;
  setName: (name: string) => Promise<void>;
}

export function useLobbyDirectory(
  _lobbyContextId: string | null,
  _lobbyExecutorKey: string | null,
): UseLobbyDirectoryReturn {
  return {
    onlineMembers: new Set<string>(),
    memberNames: {},
    setName: async () => { /* no-op: no name service in table */ },
  };
}
