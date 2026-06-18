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

export interface WorkspaceRecord {
  namespaceId: string;
  boardContextId: string | null;
  applicationId: string;
  alias?: string;
}

export interface UseBoardWorkspaceReturn {
  workspaces: WorkspaceRecord[];
  workspacesLoading: boolean;
  workspacesError: Error | null;
  selectedWorkspace: WorkspaceRecord | null;
  selectWorkspace: (namespaceId: string) => void;
  clearWorkspace: () => void;
  refetchWorkspaces: () => Promise<void>;

  createWorkspace: (name?: string) => Promise<string | null>;
  createWorkspaceLoading: boolean;
  createWorkspaceError: Error | null;

  namespaceId: string | null;
  groupId: string | null;
  groupLoading: boolean;

  members: GroupMember[];
  selfIdentity: string | null;
  membersLoading: boolean;
  refetchMembers: () => Promise<void>;
  isAdmin: boolean;
  setMemberRole: (identity: string, role: 'Admin' | 'Member') => Promise<void>;
  removeMember: (identity: string) => Promise<void>;

  boardJoined: boolean;
  executorPublicKey: string | null;
  boardContextId: string | null;

  inviteUser: (validForSeconds?: number) => Promise<unknown>;
  inviteLoading: boolean;

  joinWorkspace: (invitationJson: string) => Promise<boolean>;
  joinLoading: boolean;

  refetchContexts: () => Promise<void>;
}

function loadSelectedNamespaceId(): string | null {
  try { return localStorage.getItem(SELECTED_NS_KEY); } catch { return null; }
}

function persistSelectedNamespaceId(nsId: string | null) {
  try {
    if (nsId) localStorage.setItem(SELECTED_NS_KEY, nsId);
    else localStorage.removeItem(SELECTED_NS_KEY);
  } catch { /* storage unavailable */ }
}

const ENV_APPLICATION_ID = import.meta.env.VITE_APPLICATION_ID?.trim() || null;

export function useBoardWorkspace(): UseBoardWorkspaceReturn {
  const { applicationId: authApplicationId, mero, contextIdentity } = useMero();
  const applicationId = authApplicationId || ENV_APPLICATION_ID;

  // --- Namespace listing ---
  const {
    namespaces,
    loading: namespacesLoading,
    error: namespacesError,
    refetch: refetchNamespaces,
  } = useNamespacesForApplication(applicationId);

  // Propagated workspace names (shared via group metadata).
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

  // --- Derive board context from namespace ---
  const [selectedNsId, setSelectedNsId] = useState<string | null>(loadSelectedNamespaceId);
  const namespaceId = namespaces.find((ns) => ns.namespaceId === selectedNsId)?.namespaceId ?? null;
  const groupId = namespaceId;

  const {
    contexts: namespaceContexts,
    loading: contextsLoading,
    refetch: refetchGroupContexts,
  } = useGroupContexts(namespaceId);

  // Resolve board context by serviceName (safe across multi-context namespaces).
  const [boardContextId, setBoardContextId] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || namespaceContexts.length === 0) {
      setBoardContextId(null);
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
        const board =
          details.find((d) => d.serviceName === SERVICE_NAME.board)?.contextId ?? null;
        setBoardContextId(board);
      } catch {
        if (!cancelled) setBoardContextId(null);
      }
    })();
    return () => { cancelled = true; };
  }, [mero, namespaceContexts]);

  const workspaces: WorkspaceRecord[] = useMemo(
    () => namespaces.map((ns) => ({
      namespaceId: ns.namespaceId,
      boardContextId: ns.namespaceId === selectedNsId ? boardContextId : null,
      applicationId: ns.targetApplicationId,
      alias: namespaceNames[ns.namespaceId] || ns.name,
    })),
    [namespaces, selectedNsId, boardContextId, namespaceNames],
  );

  const selectedWorkspace = workspaces.find((w) => w.namespaceId === selectedNsId) ?? null;
  const groupLoading = namespacesLoading || contextsLoading;

  // --- Members (custom, SDK bug workaround) ---
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [selfIdentity, setSelfIdentity] = useState<string | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);

  const refetchMembers = useCallback(async () => {
    if (!mero || !namespaceId) { setMembers([]); setSelfIdentity(null); return; }
    setMembersLoading(true);
    try {
      const raw = await mero.admin.listGroupMembers(namespaceId);
      const r = raw as unknown as { members?: GroupMember[]; selfIdentity?: string };
      const all = r.members ?? [];
      const self = r.selfIdentity ?? null;
      setMembers(all.filter((m) => m.identity !== self));
      setSelfIdentity(self);
    } catch { /* keep previous on transient errors */ } finally {
      setMembersLoading(false);
    }
  }, [mero, namespaceId]);

  useEffect(() => { void refetchMembers(); }, [refetchMembers]);

  // --- Mutations ---
  const { createNamespaceInvitation, loading: inviteLoading } = useCreateNamespaceInvitation();
  const { joinNamespace, loading: joinNamespaceLoading } = useJoinNamespace();
  const {
    createNamespaceWithLobby,
    loading: createWorkspaceLoading,
    error: createWorkspaceError,
  } = useNamespaceBootstrap(applicationId);

  // --- Join state ---
  const [boardJoined, setBoardJoined] = useState(false);
  const [executorPublicKey, setExecutorPublicKey] = useState<string | null>(null);
  const userCleared = useRef(false);

  // Auto-select namespace
  useEffect(() => {
    if (workspaces.length === 0) return;
    if (userCleared.current) return;
    if (selectedNsId && workspaces.some((w) => w.namespaceId === selectedNsId)) return;
    const persisted = loadSelectedNamespaceId();
    const match = persisted ? workspaces.find((w) => w.namespaceId === persisted) : null;
    if (match) { setSelectedNsId(match.namespaceId); return; }
    setSelectedNsId(workspaces[0].namespaceId);
    persistSelectedNamespaceId(workspaces[0].namespaceId);
  }, [workspaces, selectedNsId]);

  // Reset join state on namespace change
  useEffect(() => { setBoardJoined(false); setExecutorPublicKey(null); }, [selectedNsId]);

  // Resolve executor identity for the board context
  useEffect(() => {
    if (!boardContextId || !mero) return;
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(boardContextId);
        if (!cancelled && identities.length > 0) { setExecutorPublicKey(identities[0]); return; }
        if (!cancelled && contextIdentity) setExecutorPublicKey(contextIdentity);
      } catch {
        if (!cancelled && contextIdentity) setExecutorPublicKey(contextIdentity);
      }
    })();
    return () => { cancelled = true; };
  }, [boardContextId, mero, contextIdentity]);

  // Mark board as joined once we have identity
  useEffect(() => {
    if (boardContextId && executorPublicKey && !boardJoined) setBoardJoined(true);
  }, [boardContextId, executorPublicKey, boardJoined]);

  const isAdmin = selfIdentity !== null
    && members.some((m) => m.identity === selfIdentity && m.role === 'Admin');

  // --- Callbacks ---
  const selectWorkspace = useCallback((nsId: string) => {
    userCleared.current = false;
    setSelectedNsId(nsId);
    persistSelectedNamespaceId(nsId);
  }, []);

  const clearWorkspace = useCallback(() => {
    userCleared.current = true;
    setSelectedNsId(null);
    persistSelectedNamespaceId(null);
  }, []);

  const createWorkspace = useCallback(async (name?: string) => {
    const result = await createNamespaceWithLobby(name || DEFAULT_WORKSPACE_NAME);
    if (result) {
      setExecutorPublicKey(result.memberPublicKey);
      setBoardJoined(true);
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

  const joinWorkspaceViaInvitation = useCallback(async (invitationCode: string): Promise<boolean> => {
    if (!mero) return false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          ? (gid as number[]).map((b: number) => b.toString(16).padStart(2, '0')).join('')
          : String(gid);
        groupAlias = parsed.groupAlias || undefined;
      }

      if (!nsId) throw new Error('Invalid invitation: cannot determine namespace ID');

      const result = await joinNamespace(nsId, { invitation, groupName: groupAlias });
      if (result) { await refetchNamespaces(); return true; }
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
    workspaces,
    workspacesLoading: namespacesLoading || contextsLoading,
    workspacesError: namespacesError,
    selectedWorkspace,
    selectWorkspace,
    clearWorkspace,
    refetchWorkspaces: refetchNamespaces,

    createWorkspace,
    createWorkspaceLoading,
    createWorkspaceError,

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

    boardJoined,
    executorPublicKey,
    boardContextId,

    inviteUser,
    inviteLoading,

    joinWorkspace: joinWorkspaceViaInvitation,
    joinLoading: joinNamespaceLoading,

    refetchContexts,
  };
}
