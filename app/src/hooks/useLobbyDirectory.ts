/**
 * useLobbyDirectory — stub for single-service specs that have no dedicated
 * presence/name service.  For team-todo the todo context owns all state;
 * heartbeat and display-name methods are not part of the todo ABI, so this
 * hook simply returns empty/no-op values.
 *
 * If a future multi-service variant adds a directory service, replace this
 * with the full implementation from the chat scaffold.
 */

export interface UseLobbyDirectoryReturn {
  onlineMembers: Set<string>;
  memberNames: Record<string, string>;
  setName: (name: string) => Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useLobbyDirectory(
  _lobbyContextId: string | null,
  _lobbyExecutorKey: string | null,
): UseLobbyDirectoryReturn {
  return {
    onlineMembers: new Set<string>(),
    memberNames: {},
    setName: async () => {},
  };
}
