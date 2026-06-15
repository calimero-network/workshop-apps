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
import { ClubClient } from '../api/club/ClubClient';
import rawConfig from '../../studio.config.json';

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

  createLobby: (name?: string, weeklyGoal?: number) => Promise<string | null>;
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

  lobbyJoined: boolean;
  executorPublicKey: string | null;
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

/**
 * Safely gets the directory service name for context resolution.
 * Multi-service apps use SERVICE_NAME.directory; single-service apps (no
 * 'directory' role declared) fall back to the first service's name.
 */
function safeDirectoryServiceName(): string | null {
  try {
    return SERVICE_NAME.directory;
  } catch {
    const raw = rawConfig as { services?: { name: string }[] };
    return raw.services?.[0]?.name ?? null;
  }
}

const DIRECTORY_SERVICE_NAME = safeDirectoryServiceName();

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

  const [selectedNsId, setSelectedNsId] = useState<string | null>(loadSelectedNamespaceId);
  const namespaceId = namespaces.find((ns) => ns.namespaceId === selectedNsId)?.namespaceId ?? null;
  const groupId = namespaceId;

  const {
    contexts: namespaceContexts,
    loading: contextsLoading,
    refetch: refetchGroupContexts,
  } = useGroupContexts(namespaceId);

  // Resolve the lobby/club context id by serviceName.
  // useGroupContexts returns only {contextId, alias} — no serviceName.
  // We resolve each context via mero.admin.getContext and pick the one
  // whose serviceName matches DIRECTORY_SERVICE_NAME.
  // For single-service apps (namespacePerInstance), all contexts share the
  // same service, so we fall back to the first context.
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
        let matched: string | null = null;
        if (DIRECTORY_SERVICE_NAME) {
          matched = details.find((d) => d.serviceName === DIRECTORY_SERVICE_NAME)?.contextId ?? null;
        }
        // Fallback: single-service app → first context is the club context
        if (!matched) matched = details[0]?.contextId ?? null;
        setLobbyContextId(matched);
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
      alias: ns.name,
    })),
    [namespaces, selectedNsId, lobbyContextId],
  );

  const selectedLobby = lobbies.find((l) => l.namespaceId === selectedNsId) ?? null;
  const groupLoading = namespacesLoading || contextsLoading;

  // --- Members ---
  // Custom replacement for SDK's useGroupMembers because the SDK reads
  // `response.data` but the server returns `{members, selfIdentity}`.
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [selfIdentity, setSelfIdentity] = useState<string | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);

  const refetchMembers = useCallback(async () => {
    if (!mero || !namespaceId) {
      setMembers([]);
      setSelfIdentity(null);
      return;
    }
    setMembersLoading(true);
    try {
      const raw = await mero.admin.listGroupMembers(namespaceId);
      const r = raw as unknown as { members?: GroupMember[]; selfIdentity?: string };
      const all = r.members ?? [];
      const self = r.selfIdentity ?? null;
      setMembers(all.filter((m) => m.identity !== self));
      setSelfIdentity(self);
    } catch {
      // keep previous state on transient errors
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

  // Resolve executor identity for the lobby/club context
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

  const isAdmin = selfIdentity !== null
    && members.some((m) => m.identity === selfIdentity && m.role === 'Admin');

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

  const createLobby = useCallback(async (name?: string, weeklyGoal = 3) => {
    const clubName = name || DEFAULT_WORKSPACE_NAME;
    const result = await createNamespaceWithLobby(clubName);
    if (result) {
      setExecutorPublicKey(result.memberPublicKey);
      setLobbyJoined(true);
      setSelectedNsId(result.namespaceId);
      persistSelectedNamespaceId(result.namespaceId);

      // Initialize the club data (name + weekly goal) right after context creation.
      // This is the first mutation on the freshly-created club context.
      if (mero) {
        try {
          const client = new ClubClient(mero, result.lobbyContextId, result.memberPublicKey);
          await client.initClub({ name: clubName, weekly_goal: weeklyGoal });
        } catch (err) {
          console.warn('init_club failed (club may need manual init):', err);
        }
      }

      await refetchNamespaces();
      return result.namespaceId;
    }
    return null;
  }, [createNamespaceWithLobby, refetchNamespaces, mero]);

  const inviteUser = useCallback(async (_validForSeconds = 86400) => {
    if (!namespaceId) return null;
    return createNamespaceInvitation(namespaceId, { recursive: true });
  }, [namespaceId, createNamespaceInvitation]);

  const joinLobbyViaInvitation = useCallback(async (invitationJson: string): Promise<boolean> => {
    if (!mero) return false;
    try {
      const parsed = JSON.parse(invitationJson);

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
    createLobbyLoading,
    createLobbyError,

    namespaceId,
    groupId,
    groupLoading,

    members,
    selfIdentity,
    membersLoading,
    refetchMembers,
    isAdmin,

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
