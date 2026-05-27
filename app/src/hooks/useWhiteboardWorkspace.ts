/**
 * useWhiteboardWorkspace — workspace (namespace) management for collab-whiteboard.
 *
 * Differences from the chat scaffold's useChatLobby:
 * - No lobby/directory context: every context in the namespace IS a project.
 * - Projects are listed via useGroupContexts (all contexts in the namespace).
 * - createProject creates a context then calls create_project(name) on it.
 * - No presence / display-name directory (whiteboard service has no such API).
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
import {
  SERVICE_NAME,
  SELECTED_NAMESPACE_KEY,
  DEFAULT_WORKSPACE_NAME,
} from '../config';
import { WhiteboardClient } from '../api/whiteboard/WhiteboardClient';

const SELECTED_NS_KEY = SELECTED_NAMESPACE_KEY;
const PROJECT_NAMES_KEY = `${SELECTED_NAMESPACE_KEY}:projectNames`;

function loadProjectNames(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(PROJECT_NAMES_KEY) ?? '{}'); } catch { return {}; }
}

function persistProjectName(contextId: string, name: string) {
  try {
    const map = loadProjectNames();
    map[contextId] = name;
    localStorage.setItem(PROJECT_NAMES_KEY, JSON.stringify(map));
  } catch { /* storage unavailable */ }
}

export interface WorkspaceRecord {
  namespaceId: string;
  applicationId: string;
  alias?: string;
}

export interface ProjectRecord {
  contextId: string;
  alias: string;
}

export interface UseWhiteboardWorkspaceReturn {
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

  projects: ProjectRecord[];
  projectsLoading: boolean;
  fetchProjects: () => Promise<void>;

  createProject: (name: string) => Promise<void>;
  createProjectLoading: boolean;
  createProjectError: Error | null;

  members: GroupMember[];
  selfIdentity: string | null;
  membersLoading: boolean;
  refetchMembers: () => Promise<void>;

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

export function useWhiteboardWorkspace(): UseWhiteboardWorkspaceReturn {
  const { applicationId: authApplicationId, mero } = useMero();
  const applicationId = authApplicationId || ENV_APPLICATION_ID;

  // ── Namespace listing ──────────────────────────────────────────────────────
  const {
    namespaces,
    loading: namespacesLoading,
    error: namespacesError,
    refetch: refetchNamespaces,
  } = useNamespacesForApplication(applicationId);

  const [selectedNsId, setSelectedNsId] = useState<string | null>(loadSelectedNamespaceId);
  const namespaceId = namespaces.find((ns) => ns.namespaceId === selectedNsId)?.namespaceId ?? null;

  const workspaces: WorkspaceRecord[] = useMemo(
    () => namespaces.map((ns) => ({
      namespaceId: ns.namespaceId,
      applicationId: ns.targetApplicationId,
      alias: ns.alias,
    })),
    [namespaces],
  );

  const selectedWorkspace = workspaces.find((w) => w.namespaceId === selectedNsId) ?? null;

  // ── Project (context) listing ──────────────────────────────────────────────
  // useGroupContexts returns all contexts in the namespace — in this app,
  // every context IS a project (no separate lobby context exists).
  const {
    contexts: namespaceContexts,
    loading: contextsLoading,
    refetch: refetchGroupContexts,
  } = useGroupContexts(namespaceId);

  // Project names are persisted in localStorage because the SDK's createContext
  // doesn't accept an alias parameter and list_shapes doesn't return project name.
  const [projectNamesMap, setProjectNamesMap] = useState<Record<string, string>>(loadProjectNames);

  const projects: ProjectRecord[] = useMemo(
    () => namespaceContexts.map((c) => ({
      contextId: c.contextId,
      alias: projectNamesMap[c.contextId] ?? c.alias ?? `Project ${c.contextId.slice(0, 8)}`,
    })),
    [namespaceContexts, projectNamesMap],
  );

  // ── Members ────────────────────────────────────────────────────────────────
  // SDK bug workaround: useGroupMembers reads response.data but server returns
  // {members, selfIdentity} directly. Call listGroupMembers and unwrap manually.
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
    } catch { /* keep previous on transient error */ } finally { setMembersLoading(false); }
  }, [mero, namespaceId]);

  useEffect(() => { void refetchMembers(); }, [refetchMembers]);

  // Poll members — no SSE channel for namespace membership joins.
  useEffect(() => {
    if (!namespaceId) return;
    const interval = setInterval(() => { void refetchMembers(); }, 5_000);
    return () => clearInterval(interval);
  }, [namespaceId, refetchMembers]);

  // ── Namespace bootstrap / create workspace ─────────────────────────────────
  const {
    createNamespaceWithLobby,
    loading: createWorkspaceLoading,
    error: createWorkspaceError,
  } = useNamespaceBootstrap(applicationId);

  // ── Invitations ────────────────────────────────────────────────────────────
  const { createNamespaceInvitation, loading: inviteLoading } = useCreateNamespaceInvitation();
  const { joinNamespace, loading: joinLoading } = useJoinNamespace();

  // ── Auto-select namespace ──────────────────────────────────────────────────
  const userCleared = useRef(false);

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

  // ── Create project (context) ───────────────────────────────────────────────
  const [createProjectLoading, setCreateProjectLoading] = useState(false);
  const [createProjectError, setCreateProjectError] = useState<Error | null>(null);

  const fetchProjects = useCallback(async () => {
    await refetchGroupContexts();
  }, [refetchGroupContexts]);

  const createProject = useCallback(async (name: string) => {
    if (!mero || !namespaceId) throw new Error('No workspace selected');
    const appId = selectedWorkspace?.applicationId ?? applicationId;
    if (!appId) throw new Error('No applicationId available');

    const serviceName = SERVICE_NAME.instance;
    if (!serviceName) throw new Error('No instance service declared in studio.config.json');

    setCreateProjectLoading(true);
    setCreateProjectError(null);
    try {
      // Create a new context for this project in the namespace root group.
      const { contextId, memberPublicKey } = await mero.admin.createContext({
        applicationId: appId,
        groupId: namespaceId,
        serviceName,
        initializationParams: [],
      });

      // Resolve per-context executor key — prefer owned identity over memberPublicKey.
      let executorKey = memberPublicKey ?? '';
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (identities.length > 0) executorKey = identities[0];
      } catch { /* fall back to memberPublicKey */ }

      if (!executorKey) throw new Error('Could not resolve executor key for new context');

      // Initialize the project in the new context.
      const client = new WhiteboardClient(mero, contextId, executorKey);
      await client.createProject({ name });

      // Persist the project name locally (no list_projects API on this service).
      persistProjectName(contextId, name);
      setProjectNamesMap((prev) => ({ ...prev, [contextId]: name }));

      await fetchProjects();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setCreateProjectError(e);
      throw e;
    } finally {
      setCreateProjectLoading(false);
    }
  }, [mero, namespaceId, selectedWorkspace, applicationId, fetchProjects]);

  // ── Callbacks ──────────────────────────────────────────────────────────────
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
    workspacesLoading: namespacesLoading,
    workspacesError: namespacesError,
    selectedWorkspace,
    selectWorkspace,
    clearWorkspace,
    refetchWorkspaces: refetchNamespaces,

    createWorkspace,
    createWorkspaceLoading,
    createWorkspaceError,

    namespaceId,
    groupLoading: namespacesLoading || contextsLoading,

    projects,
    projectsLoading: contextsLoading,
    fetchProjects,

    createProject,
    createProjectLoading,
    createProjectError,

    members,
    selfIdentity,
    membersLoading,
    refetchMembers,

    inviteUser,
    inviteLoading,

    joinWorkspace,
    joinLoading,

    refetchContexts,
  };
}
