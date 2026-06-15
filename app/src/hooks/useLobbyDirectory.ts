/**
 * useLobbyDirectory — workspace-level presence & display names.
 *
 * For team-todos the todolist service has no heartbeat/presence API, so this
 * hook returns stub data.  Member names come from the `useChatLobby` members
 * list; online status is omitted (all members shown as offline/grey).
 *
 * If a future revision adds a presence service, restore the full
 * implementation from the scaffold's original useLobbyDirectory.ts.
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
    setName: async (_name: string) => { /* no-op */ },
  };
}
