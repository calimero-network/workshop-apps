/**
 * useLobbyDirectory — lightweight stub for the habit-streak-board.
 *
 * The streak_board service does not expose heartbeat / list_presence /
 * set_name / list_names endpoints, so this hook returns empty presence
 * and lets the caller derive display names from member identities.
 *
 * Shape is kept identical to the chat scaffold version so all call sites
 * compile without change.
 */

export interface UseLobbyDirectoryReturn {
  onlineMembers: Set<string>;
  memberNames: Record<string, string>;
  setName: (name: string) => Promise<void>;
}

export function useLobbyDirectory(
  _boardContextId: string | null,
  _executorKey: string | null,
): UseLobbyDirectoryReturn {
  return {
    onlineMembers: new Set<string>(),
    memberNames: {},
    setName: async (_name: string) => { /* no-op: service doesn't support display names */ },
  };
}
