/**
 * useIncidentWorkspace — namespace + workspace management for incident-command.
 *
 * Architecture: single service `incident-manager`, one context per workspace.
 * There are no separate "lobby" or "room" contexts; the incident_manager context
 * IS the workspace. The hook resolves the contextId by serviceName, not by index.
 */

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
  contextId: string | null;   // the incident_manager context for this workspace
  applicationId: string;
  alias?: string;
}

export interface UseIncidentWorkspaceReturn {
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
  groupLoading: boolean;

  members: GroupMember[];
  selfIdentity: string | null;
  membersLoading: boolean;
  refetchMembers: () => Promise<void>;
  isAdmin: boolean;
  setMemberRole: (identity: string, role: 'Admin' | 'Member') => Promise<void>;
  removeMember: (identity: string) => Promise<void>;

  workspaceJoined: boolean;
  executorPublicKey: string | null;
  contextId: string | null;     // the incident_manager context id

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

export function useIncidentWorkspace(): UseIncidentWorkspaceReturn {
  const { applicationId: authApplicationId, mero, contextIdentity } = useMero();
  const applicationId = authApplicationId || ENV_APPLICATION_ID;

  // --- Namespace listing ---
  const {
    namespaces,
    loading: namespacesLoading,
    error: namespacesError,
    refetch: refetchNamespaces,
  } = useNamespacesForApplication(applicationId);

  // Shared workspace names from group metadata (propagated to all members).
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

  // --- Selected namespace ---
  const [selectedNsId, setSelectedNsId] = useState<string | null>(loadSelectedNamespaceId);
  const namespaceId = namespaces.find((ns) => ns.namespaceId === selectedNsId)?.namespaceId ?? null;

  const {
    contexts: namespaceContexts,
    loading: contextsLoading,
    refetch: refetchGroupContexts,
  } = useGroupContexts(namespaceId);

  // Resolve the incident_manager context by serviceName (not by index).
  // `useGroupContexts` returns only `{contextId, alias}` — no serviceName.
  const [incidentContextId, setIncidentContextId] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || namespaceContexts.length === 0) {
      setIncidentContextId(null);
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
        const found = details.find((d) => d.serviceName === SERVICE_NAME.directory)?.contextId ?? null;
        setIncidentContextId(found);
      } catch {
        if (!cancelled) setIncidentContextId(null);
      }
    })();
    return () => { cancelled = true; };
  }, [mero, namespaceContexts]);

  const workspaces: WorkspaceRecord[] = useMemo(
    () => namespaces.map((ns) => ({
      namespaceId: ns.namespaceId,
      contextId: ns.namespaceId === selectedNsId ? incidentContextId : null,
      applicationId: ns.targetApplicationId,
      alias: namespaceNames[ns.namespaceId] || ns.name,
    })),
    [namespaces, selectedNsId, incidentContextId, namespaceNames],
  );

  const selectedWorkspace = workspaces.find((w) => w.namespaceId === selectedNsId) ?? null;
  const groupLoading = namespacesLoading || contextsLoading;

  // --- Members (SDK bug workaround: listGroupMembers returns {members,selfIdentity} directly) ---
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
      /* leave previous state on transient error */
    } finally {
      setMembersLoading(false);
    }
  }, [mero, namespaceId]);

  useEffect(() => { void refetchMembers(); }, [refetchMembers]);

  // --- Mutations ---
  const { createNamespaceInvitation, loading: inviteLoading } = useCreateNamespaceInvitation();
  const { joinNamespace, loading: joinLoading } = useJoinNamespace();
  const {
    createNamespaceWithLobby,
    loading: createWorkspaceLoading,
    error: createWorkspaceError,
  } = useNamespaceBootstrap(applicationId);

  // --- Join/identity state ---
  const [workspaceJoined, setWorkspaceJoined] = useState(false);
  const [executorPublicKey, setExecutorPublicKey] = useState<string | null>(null);
  const userCleared = useRef(false);

  // Auto-select persisted namespace
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

  // Resolve executor identity for the incident_manager context
  useEffect(() => {
    if (!incidentContextId || !mero) return;
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(incidentContextId);
        if (!cancelled && identities.length > 0) {
          setExecutorPublicKey(identities[0]);
          return;
        }
        if (!cancelled && contextIdentity) setExecutorPublicKey(contextIdentity);
      } catch {
        if (!cancelled && contextIdentity) setExecutorPublicKey(contextIdentity);
      }
    })();
    return () => { cancelled = true; };
  }, [incidentContextId, mero, contextIdentity]);

  // Mark joined once we have both contextId and executor key
  useEffect(() => {
    if (incidentContextId && executorPublicKey && !workspaceJoined) {
      setWorkspaceJoined(true);
    }
  }, [incidentContextId, executorPublicKey, workspaceJoined]);

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

  const joinWorkspace = useCallback(async (invitationCode: string): Promise<boolean> => {
    if (!mero) return false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = decodeInvitation(invitationCode) as any;

      let nsId: string | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let invitation: any = parsed;
      let groupAlias: string | undefined;

      if (Array.isArray(parsed?.invitations) && parsed.invitations.length > 0) {
        const first = parsed.invitations[0];
        nsId = first.groupId;
        invitation = first.invitation;
        groupAlias = first.groupAlias;
      } else if (parsed?.invitation?.groupId) {
        const gid = parsed.invitation.groupId;
        nsId = Array.isArray(gid)
          ? (gid as number[]).map((b: number) => b.toString(16).padStart(2, '0')).join('')
          : String(gid);
        groupAlias = parsed.groupAlias;
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
    groupLoading,

    members,
    selfIdentity,
    membersLoading,
    refetchMembers,
    isAdmin,
    setMemberRole,
    removeMember,

    workspaceJoined,
    executorPublicKey,
    contextId: incidentContextId,

    inviteUser,
    inviteLoading,

    joinWorkspace,
    joinLoading,

    refetchContexts,
  };
}
