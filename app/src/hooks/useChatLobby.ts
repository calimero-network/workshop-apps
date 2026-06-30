import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useNamespacesForApplication,
  useGroupContexts,
  useCreateNamespaceInvitation,
  useJoinNamespace,
  useMero,
} from '@calimero-network/mero-react';
import type { GroupMember } from '@calimero-network/mero-react';
import { useNamespaceBootstrap } from './useNamespaceBootstrap';
import { SERVICE_NAME, SELECTED_NAMESPACE_KEY, DEFAULT_WORKSPACE_NAME } from '../config';
import { decodeInvitation } from '../utils/invitation';

const SELECTED_NS_KEY = SELECTED_NAMESPACE_KEY;

export interface LobbyRecord {
  namespaceId: string;
  lobbyContextId: string | null;
  applicationId: string;
  alias?: string;
}

export interface UseChatLobbyReturn {
  lobbies: LobbyRecord[];
  lobbiesLoading: boolean;
  lobbiesError: Error | null;
  selectedLobby: LobbyRecord | null;
  selectLobby: (namespaceId: string) => void;
  clearLobby: () => void;
  refetchLobbies: () => Promise<void>;

  createLobby: (name?: string) => Promise<string | null>;
  createLobbyLoading: boolean;
  createLobbyError: Error | null;

  namespaceId: string | null;
  groupId: string | null;
  groupLoading: boolean;

  members: GroupMember[];
  selfIdentity: string | null;
  membersLoading: boolean;
  refetchMembers: () => Promise<void>;
  isAdmin: boolean;
  /** Promote/demote a member's workspace role ('Admin' | 'Member'). Admin only. */
  setMemberRole: (identity: string, role: 'Admin' | 'Member') => Promise<void>;
  /** Remove a member from the workspace (namespace group). Admin only. */
  removeMember: (identity: string) => Promise<void>;

  lobbyJoined: boolean;
  /** Executor identity for the lobby context. Per-room contexts use their
   *  own identities, resolved by `useChatRoom` via `getContextIdentitiesOwned`. */
  executorPublicKey: string | null;
  /** Alias for `executorPublicKey`, named to make the binding to the lobby
   *  context explicit (used by `useLobbyDirectory`). */
  lobbyExecutorPublicKey: string | null;
  lobbyContextId: string | null;

  inviteUser: (validForSeconds?: number) => Promise<unknown>;
  inviteLoading: boolean;

  joinLobby: (invitationJson: string) => Promise<boolean>;
  joinLoading: boolean;

  refetchContexts: () => Promise<void>;
}

function loadSelectedNamespaceId(): string | null {
  try {
    return localStorage.getItem(SELECTED_NS_KEY);
  } catch {
    return null;
  }
}

function persistSelectedNamespaceId(nsId: string | null) {
  try {
    if (nsId) {
      localStorage.setItem(SELECTED_NS_KEY, nsId);
    } else {
      localStorage.removeItem(SELECTED_NS_KEY);
    }
  } catch {
    // storage unavailable
  }
}

const ENV_APPLICATION_ID = import.meta.env.VITE_APPLICATION_ID?.trim() || null;

export function useChatLobby(): UseChatLobbyReturn {
  const { applicationId: authApplicationId, mero, contextIdentity } = useMero();
  const applicationId = authApplicationId || ENV_APPLICATION_ID;

  // --- Namespace listing ---
  const {
    namespaces,
    loading: namespacesLoading,
    error: namespacesError,
    refetch: refetchNamespaces,
  } = useNamespacesForApplication(applicationId);

  // Propagated workspace names. `ns.name` (from useNamespacesForApplication) is
  // a node-local alias; the shared name lives in the namespace group's metadata
  // (set on create via setGroupMetadata), so every member sees the same name.
  const [namespaceNames, setNamespaceNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!mero || namespaces.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        namespaces.map((ns) =>
          mero.admin.getGroupMetadata(ns.namespaceId).then(
            (m) => [ns.namespaceId, m?.name ?? ''] as const,
            () => [ns.namespaceId, ''] as const,
          ),
        ),
      );
      if (cancelled) return;
      setNamespaceNames(Object.fromEntries(entries.filter(([, name]) => name)));
    })();
    return () => { cancelled = true; };
  }, [mero, namespaces]);

  // --- Derive lobby context from namespace's root group contexts ---
  const [selectedNsId, setSelectedNsId] = useState<string | null>(loadSelectedNamespaceId);
  const namespaceId = namespaces.find((ns) => ns.namespaceId === selectedNsId)?.namespaceId ?? null;
  const groupId = namespaceId;

  const {
    contexts: namespaceContexts,
    loading: contextsLoading,
    refetch: refetchGroupContexts,
  } = useGroupContexts(namespaceId);

  // `useGroupContexts` returns only `{contextId, alias}` — no serviceName.
  // The lobby is no longer guaranteed to be at index 0 once rooms (also
  // contexts in the same namespace) are created, so we resolve each context's
  // serviceName via `mero.admin.getContext(id)` and pick the one whose
  // serviceName === 'lobby'. Returns null until the lookup completes.
  const [lobbyContextId, setLobbyContextId] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || namespaceContexts.length === 0) {
      setLobbyContextId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const details = await Promise.all(
          namespaceContexts.map((c) =>
            mero.admin.getContext(c.contextId).then(
              (d) => ({ contextId: c.contextId, serviceName: (d as { serviceName?: string })?.serviceName }),
              () => ({ contextId: c.contextId, serviceName: undefined as string | undefined }),
            ),
          ),
        );
        if (cancelled) return;
        const lobby = details.find((d) => d.serviceName === SERVICE_NAME.directory)?.contextId ?? null;
        setLobbyContextId(lobby);
      } catch {
        if (!cancelled) setLobbyContextId(null);
      }
    })();
    return () => { cancelled = true; };
  }, [mero, namespaceContexts]);

  const lobbies: LobbyRecord[] = useMemo(
    () => namespaces.map((ns) => ({
      namespaceId: ns.namespaceId,
      lobbyContextId: ns.namespaceId === selectedNsId ? lobbyContextId : null,
      applicationId: ns.targetApplicationId,
      // Prefer the propagated (shared) name; fall back to the local alias.
      alias: namespaceNames[ns.namespaceId] || ns.name,
    })),
    [namespaces, selectedNsId, lobbyContextId, namespaceNames],
  );

  const selectedLobby = lobbies.find((l) => l.namespaceId === selectedNsId) ?? null;
  const groupLoading = namespacesLoading || contextsLoading;

  // --- Members ---
  // Custom replacement for SDK's useGroupMembers because the SDK reads
  // `response.data` but the server returns `{members, selfIdentity}`.
  // (Filed/to-file as upstream bug in @calimero-network/mero-react.)
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [selfIdentity, setSelfIdentity] = useState<string | null>(null);
  const [selfIsAdmin, setSelfIsAdmin] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);

  const refetchMembers = useCallback(async () => {
    if (!mero || !namespaceId) {
      setMembers([]);
      setSelfIdentity(null);
      setSelfIsAdmin(false);
      return;
    }
    setMembersLoading(true);
    try {
      const raw = await mero.admin.listGroupMembers(namespaceId);
      const r = raw as unknown as { members?: GroupMember[]; selfIdentity?: string };
      const all = r.members ?? [];
      const self = r.selfIdentity ?? null;
      // Check admin role from the full list before filtering self out.
      const selfMember = self ? all.find((m) => m.identity === self) : null;
      setSelfIsAdmin(selfMember?.role === 'Admin');
      // Match SDK semantics: members excludes self.
      setMembers(all.filter((m) => m.identity !== self));
      setSelfIdentity(self);
    } catch {
      // leave previous state in place on transient errors
    } finally {
      setMembersLoading(false);
    }
  }, [mero, namespaceId]);

  useEffect(() => {
    void refetchMembers();
  }, [refetchMembers]);

  // --- Mutations ---
  const { createNamespaceInvitation, loading: inviteLoading } = useCreateNamespaceInvitation();
  const { joinNamespace, loading: joinNamespaceLoading } = useJoinNamespace();
  const {
    createNamespaceWithLobby,
    loading: createLobbyLoading,
    error: createLobbyError,
  } = useNamespaceBootstrap(applicationId);

  // --- Lobby join state ---
  const [lobbyJoined, setLobbyJoined] = useState(false);
  const [executorPublicKey, setExecutorPublicKey] = useState<string | null>(null);

  const userCleared = useRef(false);

  // Auto-select namespace
  useEffect(() => {
    if (lobbies.length === 0) return;
    if (userCleared.current) return;
    if (selectedNsId && lobbies.some((l) => l.namespaceId === selectedNsId)) return;

    const persisted = loadSelectedNamespaceId();
    const match = persisted ? lobbies.find((l) => l.namespaceId === persisted) : null;
    if (match) {
      setSelectedNsId(match.namespaceId);
      return;
    }

    setSelectedNsId(lobbies[0].namespaceId);
    persistSelectedNamespaceId(lobbies[0].namespaceId);
  }, [lobbies, selectedNsId]);

  // Reset join state when namespace changes
  useEffect(() => {
    setLobbyJoined(false);
    setExecutorPublicKey(null);
  }, [selectedNsId]);

  // Resolve executor identity
  useEffect(() => {
    if (!lobbyContextId || !mero) return;
    let cancelled = false;

    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(lobbyContextId);
        if (!cancelled && identities.length > 0) {
          setExecutorPublicKey(identities[0]);
          return;
        }
        if (!cancelled && contextIdentity) {
          setExecutorPublicKey(contextIdentity);
        }
      } catch {
        if (!cancelled && contextIdentity) {
          setExecutorPublicKey(contextIdentity);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [lobbyContextId, mero, contextIdentity]);

  // Mark lobby as joined once we have identity
  useEffect(() => {
    if (lobbyContextId && executorPublicKey && !lobbyJoined) {
      setLobbyJoined(true);
    }
  }, [lobbyContextId, executorPublicKey, lobbyJoined]);

  // selfIsAdmin is set in refetchMembers from the full members list (before
  // self is filtered out), so it is correct even though `members` excludes self.
  const isAdmin = selfIsAdmin;

  // --- Callbacks ---

  const selectLobby = useCallback((nsId: string) => {
    userCleared.current = false;
    setSelectedNsId(nsId);
    persistSelectedNamespaceId(nsId);
  }, []);

  const clearLobby = useCallback(() => {
    userCleared.current = true;
    setSelectedNsId(null);
    persistSelectedNamespaceId(null);
  }, []);

  const createLobby = useCallback(async (name?: string) => {
    const result = await createNamespaceWithLobby(name || DEFAULT_WORKSPACE_NAME);
    if (result) {
      setExecutorPublicKey(result.memberPublicKey);
      setLobbyJoined(true);
      setSelectedNsId(result.namespaceId);
      persistSelectedNamespaceId(result.namespaceId);
      await refetchNamespaces();
      return result.namespaceId;
    }
    return null;
  }, [createNamespaceWithLobby, refetchNamespaces]);

  const inviteUser = useCallback(async (_validForSeconds = 86400) => {
    if (!namespaceId) return null;
    return createNamespaceInvitation(namespaceId, { recursive: true });
  }, [namespaceId, createNamespaceInvitation]);

  // Workspace = the namespace root group; roles/membership are managed there.
  const setMemberRole = useCallback(async (identity: string, role: 'Admin' | 'Member') => {
    if (!mero || !namespaceId) throw new Error('No workspace selected');
    await mero.admin.updateMemberRole(namespaceId, identity, { role });
    await refetchMembers();
  }, [mero, namespaceId, refetchMembers]);

  const removeMember = useCallback(async (identity: string) => {
    if (!mero || !namespaceId) throw new Error('No workspace selected');
    await mero.admin.removeGroupMembers(namespaceId, { members: [identity] });
    await refetchMembers();
  }, [mero, namespaceId, refetchMembers]);

  const joinLobbyViaInvitation = useCallback(async (invitationCode: string): Promise<boolean> => {
    if (!mero) return false;
    try {
      // Accepts a base64 share code (from encodeInvitation) or raw JSON.
      const parsed = decodeInvitation(invitationCode) as any;

      let nsId: string | null = null;
      let invitation = parsed;
      let groupAlias: string | undefined;

      if (Array.isArray(parsed?.invitations) && parsed.invitations.length > 0) {
        const first = parsed.invitations[0];
        nsId = first.groupId;
        invitation = first.invitation;
        groupAlias = first.groupAlias || undefined;
      } else if (parsed?.invitation?.groupId) {
        const gid = parsed.invitation.groupId;
        nsId = Array.isArray(gid)
          ? gid.map((b: number) => b.toString(16).padStart(2, '0')).join('')
          : String(gid);
        groupAlias = parsed.groupAlias || undefined;
      }

      if (!nsId) {
        throw new Error('Invalid invitation: cannot determine namespace ID');
      }

      const result = await joinNamespace(nsId, { invitation, groupName: groupAlias });

      if (result) {
        await refetchNamespaces();
        return true;
      }
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('already')) return true;
      throw err;
    }
  }, [mero, joinNamespace, refetchNamespaces]);

  const refetchContexts = useCallback(async () => {
    await Promise.all([refetchNamespaces(), refetchGroupContexts()]);
  }, [refetchNamespaces, refetchGroupContexts]);

  return {
    lobbies,
    lobbiesLoading: namespacesLoading || contextsLoading,
    lobbiesError: namespacesError,
    selectedLobby,
    selectLobby,
    clearLobby,
    refetchLobbies: refetchNamespaces,

    createLobby,
    createLobbyLoading: createLobbyLoading,
    createLobbyError: createLobbyError,

    namespaceId,
    groupId,
    groupLoading,

    members,
    selfIdentity,
    membersLoading,
    refetchMembers,
    isAdmin,
    setMemberRole,
    removeMember,

    lobbyJoined,
    executorPublicKey,
    lobbyExecutorPublicKey: executorPublicKey,
    lobbyContextId,

    inviteUser,
    inviteLoading,

    joinLobby: joinLobbyViaInvitation,
    joinLoading: joinNamespaceLoading,

    refetchContexts,
  };
}
