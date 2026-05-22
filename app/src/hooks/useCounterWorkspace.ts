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
import { COUNTER_SERVICE_NAME, SELECTED_NAMESPACE_KEY, DEFAULT_WORKSPACE_NAME } from '../config';

const SELECTED_NS_KEY = SELECTED_NAMESPACE_KEY;

export interface WorkspaceRecord {
  namespaceId: string;
  counterContextId: string | null;
  applicationId: string;
  alias?: string;
}

export interface UseCounterWorkspaceReturn {
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

  workspaceJoined: boolean;
  /** Executor identity for the counter context. */
  executorPublicKey: string | null;
  counterContextId: string | null;

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
    if (nsId) { localStorage.setItem(SELECTED_NS_KEY, nsId); }
    else { localStorage.removeItem(SELECTED_NS_KEY); }
  } catch { /* storage unavailable */ }
}

const ENV_APPLICATION_ID = import.meta.env.VITE_APPLICATION_ID?.trim() || null;

export function useCounterWorkspace(): UseCounterWorkspaceReturn {
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

  // Resolve the counter context: find the context whose serviceName === COUNTER_SERVICE_NAME.
  // useGroupContexts returns only {contextId, alias} — no serviceName — so we fetch each one.
  const [counterContextId, setCounterContextId] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || namespaceContexts.length === 0) {
      setCounterContextId(null);
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
        const found = details.find((d) => d.serviceName === COUNTER_SERVICE_NAME)?.contextId ?? null;
        setCounterContextId(found);
      } catch {
        if (!cancelled) setCounterContextId(null);
      }
    })();
    return () => { cancelled = true; };
  }, [mero, namespaceContexts]);

  const workspaces: WorkspaceRecord[] = useMemo(
    () => namespaces.map((ns) => ({
      namespaceId: ns.namespaceId,
      counterContextId: ns.namespaceId === selectedNsId ? counterContextId : null,
      applicationId: ns.targetApplicationId,
      alias: ns.alias,
    })),
    [namespaces, selectedNsId, counterContextId],
  );

  const selectedWorkspace = workspaces.find((w) => w.namespaceId === selectedNsId) ?? null;
  const groupLoading = namespacesLoading || contextsLoading;

  // --- Members (SDK bug workaround: response is {members, selfIdentity}, not response.data) ---
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
    } catch { /* keep previous state */ } finally { setMembersLoading(false); }
  }, [mero, namespaceId]);

  useEffect(() => { void refetchMembers(); }, [refetchMembers]);

  // --- Bootstrap + invite/join ---
  const { createNamespaceInvitation, loading: inviteLoading } = useCreateNamespaceInvitation();
  const { joinNamespace, loading: joinLoading } = useJoinNamespace();
  const {
    createNamespaceWithLobby,
    loading: createWorkspaceLoading,
    error: createWorkspaceError,
  } = useNamespaceBootstrap(applicationId);

  const [workspaceJoined, setWorkspaceJoined] = useState(false);
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
  useEffect(() => {
    setWorkspaceJoined(false);
    setExecutorPublicKey(null);
  }, [selectedNsId]);

  // Resolve executor identity for the counter context
  useEffect(() => {
    if (!counterContextId || !mero) return;
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(counterContextId);
        if (!cancelled && identities.length > 0) { setExecutorPublicKey(identities[0]); return; }
        if (!cancelled && contextIdentity) setExecutorPublicKey(contextIdentity);
      } catch {
        if (!cancelled && contextIdentity) setExecutorPublicKey(contextIdentity);
      }
    })();
    return () => { cancelled = true; };
  }, [counterContextId, mero, contextIdentity]);

  // Mark as joined once identity is resolved
  useEffect(() => {
    if (counterContextId && executorPublicKey && !workspaceJoined) setWorkspaceJoined(true);
  }, [counterContextId, executorPublicKey, workspaceJoined]);

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
      setWorkspaceJoined(true);
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

  const joinWorkspace = useCallback(async (invitationJson: string): Promise<boolean> => {
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

      if (!nsId) throw new Error('Invalid invitation: cannot determine namespace ID');
      const result = await joinNamespace(nsId, { invitation, groupAlias });
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

    workspaceJoined,
    executorPublicKey,
    counterContextId,

    inviteUser,
    inviteLoading,

    joinWorkspace,
    joinLoading,

    refetchContexts,
  };
}
