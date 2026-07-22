/**
 * MemberLabel — the universal render site for a member identity. NEVER print a
 * raw base58 key (owner / author / assignee / member fields) directly: route it
 * through <MemberLabel> so a member's chosen display name shows everywhere, with
 * a stable truncated-key fallback when none is set.
 *
 *   <MemberLabel memberId={item.author} />   // just works, no props to thread
 *
 * Names come from the namespace's GroupMember rows (which carry each member's
 * metadata name), resolved once by <DisplayNamesProvider> and shared via
 * context so every label is a map lookup, not a per-row fetch. Those rows
 * EXCLUDE self (SDK convention), so the provider folds in the caller's own name
 * from its member metadata. The provider live-refreshes on context sync events
 * (renames), plus a visibility-gated poll for new joins (which don't ding SSE),
 * so names appear without a reload.
 *
 * Ported from mero-drive's display-name system (member metadata).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import styled from 'styled-components';
import {
  useGroupMembers,
  useMemberMetadata,
  useSubscription,
} from '@calimero-network/mero-react';
import { C } from '../theme';

interface DisplayNamesValue {
  namespaceId: string | null;
  contextId: string | null;
  selfIdentity: string | null;
  /** identity → display name, for members that set one. */
  namesByIdentity: Record<string, string>;
  /** Re-read the members map + self name now. Call after a local write (e.g.
   *  the gate saving a name) so the change shows without waiting for the poll. */
  refresh: () => void;
}

const DisplayNamesContext = createContext<DisplayNamesValue>({
  namespaceId: null,
  contextId: null,
  selfIdentity: null,
  namesByIdentity: {},
  refresh: () => {},
});

export function useDisplayNames(): DisplayNamesValue {
  return useContext(DisplayNamesContext);
}

/** Build the identity → name map from the namespace's members. Pure so it can
 *  be unit-tested without a live node. */
export function membersToNameMap(
  members: ReadonlyArray<{ identity: string; name?: string }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of members) {
    if (m.name) map[m.identity] = m.name;
  }
  return map;
}

/** Default fallback: `first8…last4` once the id is longer than 13 chars.
 *  Shorter ids render verbatim (a middle ellipsis on a 12-char id is noise). */
export function truncateIdentity(id: string): string {
  if (id.length <= 13) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function DisplayNamesProvider({
  namespaceId,
  contextId,
  selfIdentity,
  children,
}: {
  namespaceId: string | null;
  contextId: string | null;
  selfIdentity: string | null;
  children: React.ReactNode;
}) {
  const { members, refetch } = useGroupMembers(namespaceId);
  // `useGroupMembers` excludes self, so read self's own name directly.
  const { metadata: selfMeta, refetch: refetchSelf } = useMemberMetadata(
    namespaceId,
    selfIdentity,
  );
  const refresh = useCallback(() => {
    void refetch();
    void refetchSelf();
  }, [refetch, refetchSelf]);

  // Re-pull names when this context dings (a peer or self renamed).
  useSubscription(contextId ? [contextId] : [], refresh);

  // Namespace membership joins do NOT propagate through the SSE channel
  // useSubscription taps, so a newly joined peer's name would never appear
  // until reload. Re-read the member list on a modest interval (only while the
  // tab is visible) and on focus/visibility-restore. Ref'd so unstable refetch
  // identities don't reset the timer each render.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!namespaceId) return;
    const tick = () => {
      if (!document.hidden) refreshRef.current();
    };
    const id = setInterval(tick, 30_000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [namespaceId]);

  const namesByIdentity = useMemo(() => {
    const map = membersToNameMap(members);
    if (selfIdentity && selfMeta?.name) map[selfIdentity] = selfMeta.name;
    return map;
  }, [members, selfIdentity, selfMeta]);
  const value = useMemo(
    () => ({ namespaceId, contextId, selfIdentity, namesByIdentity, refresh }),
    [namespaceId, contextId, selfIdentity, namesByIdentity, refresh],
  );

  return (
    <DisplayNamesContext.Provider value={value}>
      {children}
    </DisplayNamesContext.Provider>
  );
}

export function MemberLabel({
  memberId,
  className,
  showYou = true,
}: {
  memberId: string;
  className?: string;
  /** Append a "(you)" badge when this is the current member. Default true. */
  showYou?: boolean;
}) {
  const { selfIdentity, namesByIdentity } = useDisplayNames();
  const name = namesByIdentity[memberId] ?? null;
  const isSelf = !!selfIdentity && memberId === selfIdentity;
  return (
    <Label className={className} title={memberId}>
      {name ?? truncateIdentity(memberId)}
      {showYou && isSelf && <You>(you)</You>}
    </Label>
  );
}

const Label = styled.span`
  color: ${C.muted};
`;
const You = styled.span`
  margin-left: 5px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${C.mutedSoft};
`;
