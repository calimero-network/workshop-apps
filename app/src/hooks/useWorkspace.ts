/**
 * useWorkspace (rooms topology) - resolves the active namespace and its
 * DIRECTORY (lobby) context, exposes the room list + create/select/join-room,
 * and satisfies the base-chrome contract so WorkspaceChrome/SettingsPanel bind
 * unchanged. `contextId`/`executorPublicKey` point at the ACTIVE room's context
 * (or the directory context when in the lobby) so base useItems binds to it.
 *
 * `bootstrap` creates the namespace AND the directory context (the auto-join
 * lobby in the root group). Rooms live in SUBGROUP contexts created by
 * useRooms. Peers join the namespace via a recursive invitation, then a
 * specific room via useRooms.joinRoom (staged joinContext).
 *
 * SSO/desktop launches always land on the directory context (the app's
 * primary contextId for base-chrome purposes) - never directly inside a
 * room - so `callbackContextId` is treated as the directory context below,
 * mirroring the single hook's one-context callback precedence.
 *
 * BUILD AGENT: do not reinvent this. Reskin copy/labels; keep the lobby/room
 * wiring, the capability preset, and the gate state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useMero,
  useNamespacesForApplication,
  useCreateNamespaceInvitation,
  useJoinNamespace,
  useGroupContexts,
  useRemoveGroupMembers,
  useSubscription,
  type Namespace,
} from '@calimero-network/mero-react';
import { CAPABILITIES } from '@calimero-network/mero-js';
import { requireService, TOPOLOGY } from '../config';
import { decodeInvitation } from '../utils/invitation';
import { useLobby, type RoomView } from './useLobby';
import { useRooms } from './useRooms';

const ACTIVE_NS_KEY = 'app:active-namespace';
const activeRoomKey = (nsId: string) => `app:active-room:${nsId}`;
function read(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function write(k: string, v: string | null): void {
  try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ }
}

const ENV_APPLICATION_ID = import.meta.env.VITE_APPLICATION_ID?.trim() || null;

// Precedence: spec (studio.config topology, author intent) -> env (deploy-time
// override) -> hardcoded default (private-rooms recipe: restricted, 2 min).
const ROOM_VISIBILITY: string = TOPOLOGY?.roomVisibility
  || (import.meta.env.VITE_ROOM_VISIBILITY as string | undefined)?.trim()
  || 'restricted';
// Spec value wins even when it is null ("no gate" -> 1: the creator alone starts it).
const MIN_MEMBERS: number = TOPOLOGY && 'minMembersToStart' in TOPOLOGY
  ? (TOPOLOGY.minMembersToStart === null ? 1 : Number(TOPOLOGY.minMembersToStart) || 2)
  : (Number(import.meta.env.VITE_MIN_MEMBERS) || 2);

// Rooms need room (subgroup) management + open self-join on top of the base
// single/multi default (CAN_CREATE_CONTEXT | CAN_INVITE_MEMBERS): MANAGE_MEMBERS
// so an owner can add a member to a restricted room, and CAN_JOIN_OPEN_SUBGROUPS
// so members can self-join open rooms.
const DEFAULT_CAPABILITIES =
  CAPABILITIES.CAN_CREATE_CONTEXT |
  CAPABILITIES.CAN_INVITE_MEMBERS |
  CAPABILITIES.MANAGE_MEMBERS |
  CAPABILITIES.CAN_JOIN_OPEN_SUBGROUPS;

export interface UseWorkspaceReturn {
  // ---- base contract (16 fields) ----
  /** The ACTIVE context's id (a room, or the directory when in the lobby). */
  contextId: string | null;
  /** The namespace all rooms live in - keys member display names. */
  namespaceId: string | null;
  /** Executor public key for the active context (the signer for RPC calls). */
  executorPublicKey: string | null;
  /** True when the identity came from an injected/SSO callback context. */
  injectedContext: boolean;
  /** True once an active context is resolved and we hold its executor identity. */
  ready: boolean;
  loading: boolean;
  error: Error | null;
  /** Create the namespace + directory context (first-run web bootstrap). */
  bootstrap: (name?: string) => Promise<void>;
  /** Mint a shareable invitation code for the current namespace. */
  invite: () => Promise<unknown>;
  inviteLoading: boolean;
  /** Join an existing workspace from a share code (base64 or raw JSON). */
  join: (code: string) => Promise<void>;
  joinLoading: boolean;
  /** All namespaces this app owns on the node - feeds the switcher. */
  namespaces: Namespace[];
  /** The namespace the switcher shows as active. */
  activeNamespaceId: string | null;
  /** Switch the active namespace and persist it. */
  switchNamespace: (namespaceId: string) => void;
  /** Remove self from the current namespace and return to the gate. */
  leaveWorkspace: () => Promise<void>;

  // ---- rooms extensions ----
  /** The directory (lobby) context's id - resolves display names in the lobby. */
  directoryContextId: string | null;
  /** Rooms registered in the directory. */
  rooms: RoomView[];
  roomsLoading: boolean;
  /** The active room's context id, or null while in the lobby. */
  activeRoomId: string | null;
  /** Select a room to enter, or null to return to the lobby. */
  selectRoom: (contextId: string | null) => void;
  /** Create a room and make it active. Returns its context id. */
  createRoom: (name: string) => Promise<string | null>;
  /** Join an existing room by context id and make it active. */
  joinRoom: (contextId: string) => Promise<void>;
  joinPhase: 'idle' | 'connecting' | 'joining' | 'syncing' | 'failed';
  /** Active room's member count (0 outside a room). */
  memberCount: number;
  /** The threshold a room needs to start. */
  minMembers: number;
  /** True once the active room has met `minMembers`. */
  started: boolean;
}

export function useWorkspace(): UseWorkspaceReturn {
  const {
    mero,
    applicationId: authApplicationId,
    contextId: callbackContextId,
    contextIdentity: callbackContextIdentity,
  } = useMero();
  const applicationId = authApplicationId || ENV_APPLICATION_ID;

  const { namespaces, loading: nsLoading, refetch: refetchNamespaces } =
    useNamespacesForApplication(applicationId);
  const { createNamespaceInvitation, loading: inviteLoading } = useCreateNamespaceInvitation();
  const { joinNamespace, loading: joinLoading } = useJoinNamespace();
  const { removeGroupMembers } = useRemoveGroupMembers();

  // Active namespace: persisted selection, else the callback context's group,
  // else the first discovered namespace. The callback context is always the
  // directory (never a room), so its group IS the namespace - safe to derive
  // directly, unlike a room's context which lives in a room subgroup.
  const [activeNsId, setActiveNsId] = useState<string | null>(() => read(ACTIVE_NS_KEY));
  const [nsForCallback, setNsForCallback] = useState<string | null>(null);
  useEffect(() => {
    if (!mero || !callbackContextId) { setNsForCallback(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const gid = await mero.admin.getContextGroup(callbackContextId);
        if (!cancelled && gid) setNsForCallback(gid);
      } catch { /* fall back to discovery */ }
    })();
    return () => { cancelled = true; };
  }, [mero, callbackContextId]);
  const validActive = activeNsId && namespaces.some((n) => n.namespaceId === activeNsId) ? activeNsId : null;
  const namespaceId = nsForCallback ?? validActive ?? namespaces[0]?.namespaceId ?? null;

  // Directory context = the first (only) context in the namespace root group.
  // It never gets a sibling (rooms live in subgroups), so unlike multi's
  // units this never needs a manual refetch after bootstrap.
  const { contexts: nsContexts, loading: dirCtxLoading } = useGroupContexts(namespaceId);
  const [directoryContextId, setDirectoryContextId] = useState<string | null>(callbackContextId);
  useEffect(() => {
    if (callbackContextId) { setDirectoryContextId(callbackContextId); return; }
    if (nsContexts.length > 0) setDirectoryContextId(nsContexts[0].contextId);
  }, [callbackContextId, nsContexts]);

  // Executor identity for the directory context - resolved independently of
  // the active room so useLobby (below) always has an identity to sign with,
  // even while a room is active. The callback context is always the
  // directory (never a room), so it wins here exactly like the single hook.
  const [directoryExecutorPublicKey, setDirectoryExecutorPublicKey] = useState<string | null>(callbackContextIdentity);
  useEffect(() => {
    if (!mero || !directoryContextId) { setDirectoryExecutorPublicKey(null); return; }
    if (directoryContextId === callbackContextId && callbackContextIdentity) {
      setDirectoryExecutorPublicKey(callbackContextIdentity);
      return;
    }
    let cancelled = false;
    setDirectoryExecutorPublicKey(null);
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(directoryContextId);
        if (!cancelled && identities.length > 0) setDirectoryExecutorPublicKey(identities[0]);
      } catch { /* stays null - not-ready until an identity resolves */ }
    })();
    return () => { cancelled = true; };
  }, [mero, directoryContextId, callbackContextId, callbackContextIdentity]);

  // Rooms registered in the directory (list detail delegated to useLobby).
  const { rooms, roomsLoading } = useLobby(directoryContextId, directoryExecutorPublicKey);

  // Active room: explicit pick wins over the persisted per-namespace choice;
  // no auto-fallback to the first room - default is the lobby, not a room.
  const [activeRoomId, setActiveRoomIdState] = useState<string | null>(null);
  const userPickedRoom = useRef(false);
  useEffect(() => {
    userPickedRoom.current = false;
    setActiveRoomIdState(null);
  }, [namespaceId]);
  useEffect(() => {
    if (!namespaceId || userPickedRoom.current) return;
    const persisted = read(activeRoomKey(namespaceId));
    if (persisted && rooms.some((r) => r.context_id === persisted)) {
      setActiveRoomIdState(persisted);
    }
  }, [namespaceId, rooms]);

  const selectRoom = useCallback((contextId: string | null) => {
    userPickedRoom.current = true;
    setActiveRoomIdState(contextId);
    if (namespaceId) write(activeRoomKey(namespaceId), contextId);
  }, [namespaceId]);

  // The context base chrome binds to: the active room, else the directory.
  const activeContextId = activeRoomId ?? directoryContextId;

  // Executor identity for the active room, resolved separately from the
  // directory's - a room is a different context, so it can carry a different
  // owned identity. Falls through to the directory's identity while no room
  // is active, so display names keep resolving in the lobby.
  const [roomExecutorPublicKey, setRoomExecutorPublicKey] = useState<string | null>(null);
  useEffect(() => {
    if (!mero || !activeRoomId) { setRoomExecutorPublicKey(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(activeRoomId);
        if (!cancelled && identities.length > 0) setRoomExecutorPublicKey(identities[0]);
      } catch { /* stays null - not-ready until an identity resolves */ }
    })();
    return () => { cancelled = true; };
  }, [mero, activeRoomId]);
  const executorPublicKey = activeRoomId ? roomExecutorPublicKey : directoryExecutorPublicKey;

  const [error, setError] = useState<Error | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const creatingNs = useRef(false);
  const bootstrap = useCallback(async (name?: string) => {
    if (creatingNs.current) return; // re-entrancy guard stays silent
    if (!mero || !applicationId) { setError(new Error('Not ready yet - try again in a moment.')); return; }
    creatingNs.current = true;
    setBootstrapping(true);
    setError(null);
    try {
      const ns = await mero.admin.createNamespace({
        applicationId,
        upgradePolicy: 'Automatic',
        name: name?.trim() || undefined,
      });
      // Capabilities are functional here (self-join, member management), not
      // cosmetic - unlike single/multi, a failure must not fall through to a
      // silently under-capable namespace.
      await mero.admin.setDefaultCapabilities(ns.namespaceId, { defaultCapabilities: DEFAULT_CAPABILITIES });
      const ctx = await mero.admin.createContext({
        applicationId,
        groupId: ns.namespaceId,
        serviceName: requireService('directory').name,
        initializationParams: [],
      });
      write(ACTIVE_NS_KEY, ns.namespaceId);
      setActiveNsId(ns.namespaceId);
      setDirectoryContextId(ctx.contextId);
      setDirectoryExecutorPublicKey(ctx.memberPublicKey);
      await refetchNamespaces();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      // Rethrow so the create-workspace modal can react instead of treating a
      // failed create as success.
      throw e;
    } finally {
      creatingNs.current = false;
      setBootstrapping(false);
    }
  }, [mero, applicationId, refetchNamespaces]);

  const switchNamespace = useCallback((nsId: string) => {
    // A callback (SSO/desktop) session pins namespaceId to nsForCallback, so a
    // switch can't take effect and would only wipe the active room/executor.
    if (callbackContextId) return;
    if (!nsId || nsId === namespaceId) return;
    write(ACTIVE_NS_KEY, nsId);
    setActiveNsId(nsId);
    setDirectoryContextId(null);
    setDirectoryExecutorPublicKey(null);
    userPickedRoom.current = false;
    setActiveRoomIdState(null);
  }, [namespaceId, callbackContextId]);

  const leaveWorkspace = useCallback(async () => {
    if (!namespaceId || !executorPublicKey) throw new Error('No workspace to leave.');
    await removeGroupMembers(namespaceId, { members: [executorPublicKey] });
    write(ACTIVE_NS_KEY, null);
    setActiveNsId(null);
    setDirectoryContextId(null);
    setDirectoryExecutorPublicKey(null);
    setActiveRoomIdState(null);
    await refetchNamespaces();
  }, [namespaceId, executorPublicKey, removeGroupMembers, refetchNamespaces]);

  const invite = useCallback(async () => {
    if (!namespaceId) throw new Error('No workspace yet - create one first.');
    return createNamespaceInvitation(namespaceId, { recursive: true });
  }, [namespaceId, createNamespaceInvitation]);

  const join = useCallback(async (code: string) => {
    setError(null);
    try {
      // groupId can arrive as a hex string or a raw byte array depending on the
      // invitation shape - normalize both to a hex string.
      const toHex = (g: unknown): string | null =>
        Array.isArray(g) ? g.map((b: number) => b.toString(16).padStart(2, '0')).join('')
          : typeof g === 'string' ? g : null;
      const parsed = decodeInvitation(code) as any;
      let nsId: string | null = null;
      let invitation = parsed;
      let groupName: string | undefined;
      if (Array.isArray(parsed?.invitations) && parsed.invitations.length > 0) {
        const first = parsed.invitations[0];
        nsId = toHex(first.groupId);
        invitation = first.invitation;
        groupName = first.groupAlias || undefined;
      } else if (parsed?.invitation?.groupId) {
        nsId = toHex(parsed.invitation.groupId);
        groupName = parsed.groupAlias || undefined;
      }
      if (!nsId) throw new Error('Invalid invitation: cannot determine namespace.');

      await joinNamespace(nsId, { invitation, groupName });
      write(ACTIVE_NS_KEY, nsId);
      setActiveNsId(nsId);
      setDirectoryContextId(null);
      setDirectoryExecutorPublicKey(null);
      userPickedRoom.current = false;
      setActiveRoomIdState(null);
      // useGroupContexts refetches on the namespaceId change (see switchNamespace);
      // calling the closure here would refetch the pre-join namespace.
      await refetchNamespaces();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e; // rethrow so JoinModal shows its error; setError also feeds the landing ws.error line.
    }
  }, [joinNamespace, refetchNamespaces]);

  // Room lifecycle (create/join detail) delegated to useRooms; this hook only
  // wires the result into activeRoomId so contextId/executorPublicKey follow.
  const { createRoom: createRoomImpl, joinRoom: joinRoomImpl, joinPhase } = useRooms({
    mero,
    applicationId,
    namespaceId,
    directoryContextId,
    roomVisibility: ROOM_VISIBILITY,
    minMembers: MIN_MEMBERS,
  });

  // Both wrappers mirror the bootstrap/join idiom: clear `error` up front, set
  // it and rethrow on failure - RoomList/RoomGate render it via `ws.error`
  // (createRoom/joinRoom in useRooms already throw on terminal failure; only
  // the error surfacing was missing here).
  const createRoom = useCallback(async (name: string): Promise<string | null> => {
    setError(null);
    try {
      const contextId = await createRoomImpl(name);
      if (contextId) selectRoom(contextId);
      return contextId;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    }
  }, [createRoomImpl, selectRoom]);

  const joinRoom = useCallback(async (contextId: string): Promise<void> => {
    setError(null);
    try {
      await joinRoomImpl(contextId);
      selectRoom(contextId);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    }
  }, [joinRoomImpl, selectRoom]);

  // Start-gate state for the active room: polled from the room crate's own
  // views (member_count/is_started), refreshed on every sync event for that
  // context - the same live-update pattern base useItems uses. minMembers is
  // the value every room is created with, so it needs no round-trip.
  const [memberCount, setMemberCount] = useState(0);
  const [started, setStarted] = useState(false);
  const refreshRoomGate = useCallback(async () => {
    if (!mero || !activeRoomId) { setMemberCount(0); setStarted(false); return; }
    try {
      const [count, isStarted] = await Promise.all([
        mero.rpc.execute<number>({ contextId: activeRoomId, method: 'member_count', argsJson: {} }),
        mero.rpc.execute<boolean>({ contextId: activeRoomId, method: 'is_started', argsJson: {} }),
      ]);
      setMemberCount(count);
      setStarted(isStarted);
    } catch { /* leave last-known values - a transient RPC error shouldn't flash the gate */ }
  }, [mero, activeRoomId]);
  useEffect(() => { void refreshRoomGate(); }, [refreshRoomGate]);
  useSubscription(activeRoomId ? [activeRoomId] : [], () => { void refreshRoomGate(); });

  return {
    contextId: activeContextId,
    namespaceId,
    executorPublicKey,
    injectedContext: callbackContextId !== null,
    ready: activeContextId !== null && executorPublicKey !== null,
    loading: nsLoading || dirCtxLoading || roomsLoading || bootstrapping,
    error,
    bootstrap,
    invite,
    inviteLoading,
    join,
    joinLoading,
    namespaces,
    activeNamespaceId: namespaceId,
    switchNamespace,
    leaveWorkspace,

    directoryContextId,
    rooms,
    roomsLoading,
    activeRoomId,
    selectRoom,
    createRoom,
    joinRoom,
    joinPhase,
    memberCount,
    minMembers: MIN_MEMBERS,
    started,
  };
}

/** Mint a recursive invitation for a specific namespace (Members panel). */
export function useWorkspaceInvite(namespaceId: string | null): () => Promise<unknown> {
  const { createNamespaceInvitation } = useCreateNamespaceInvitation();
  return useCallback(async () => {
    if (!namespaceId) throw new Error('No workspace resolved yet.');
    return createNamespaceInvitation(namespaceId, { recursive: true });
  }, [namespaceId, createNamespaceInvitation]);
}
