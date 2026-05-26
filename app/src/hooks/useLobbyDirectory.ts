/**
 * useLobbyDirectory — workspace-level presence and display-name directory.
 *
 * NOTE: The marketplace service does not expose heartbeat / list_presence /
 * set_name / list_names RPC methods, so this hook returns empty/no-op state
 * for this app. The Sidebar still renders members via the admin API (listGroupMembers).
 *
 * If a future version of the marketplace adds presence support, replace the
 * stub body with the full implementation from the chat scaffold.
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
    setName: async (_name: string) => { /* no-op: marketplace has no set_name method */ },
  };
}
