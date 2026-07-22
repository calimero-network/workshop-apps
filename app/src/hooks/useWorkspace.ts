/**
 * useWorkspace (multi topology) - resolves the active namespace and the set of
 * SIBLING contexts ("units") inside it, and exposes create/select-unit plus
 * invite/join. Each unit is an independent instance of PRIMARY_SERVICE; peers
 * share a namespace and collaborate per unit (the issue-tracker pattern).
 *
 * Exposes the SAME UseWorkspaceReturn surface the base chrome consumes
 * (namespaces, activeNamespaceId, switchNamespace, bootstrap, invite, join,
 * leaveWorkspace, namespaceId, contextId, executorPublicKey, ready, ...),
 * extended with the unit list. `contextId`/`executorPublicKey` point at the
 * ACTIVE unit so base's DisplayNamesProvider + useItems bind to it unchanged.
 * `bootstrap` creates a namespace only; units are created explicitly.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useMero,
  useNamespacesForApplication,
  useCreateNamespaceInvitation,
  useJoinNamespace,
  useGroupContexts,
  useRemoveGroupMembers,
  type Namespace,
} from '@calimero-network/mero-react';
import { PRIMARY_SERVICE } from '../config';
import { decodeInvitation } from '../utils/invitation';

const ACTIVE_NS_KEY = 'app:active-namespace';
const activeUnitKey = (nsId: string) => `app:active-unit:${nsId}`;

// The two invitation shapes decodeInvitation (which returns `unknown`) can yield.
// groupId is a hex string or a raw byte array; fields stay optional so a malformed
// payload is caught by the runtime guards in join() rather than a bad cast.
type DecodedInvitation = {
  invitations?: Array<{ groupId?: string | number[]; invitation?: unknown; groupAlias?: string }>;
  invitation?: { groupId?: string | number[] };
  groupAlias?: string;
};
function read(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function write(k: string, v: string | null): void {
  try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ }
}

const ENV_APPLICATION_ID = import.meta.env.VITE_APPLICATION_ID?.trim() || null;

// Members can create per-namespace contexts + invite others. Mirrors core's
// MemberCapabilities bits (CAN_CREATE_CONTEXT | CAN_INVITE_MEMBERS).
const DEFAULT_CAPABILITIES = 1 | 2; // = 3

/** One sibling context inside the namespace. */
export interface Unit {
  contextId: string;
  /** Context label (createContext name) or a truncated id fallback. */
  name: string;
}

export interface UseWorkspaceReturn {
  /** Active unit's context id - feeds useItems and DisplayNamesProvider. */
  contextId: string | null;
  /** The namespace all units live in - keys member display names. */
  namespaceId: string | null;
  /** Executor public key for the active unit's context (RPC signer). */
  executorPublicKey: string | null;
  /** True when the identity came from an injected/SSO callback context. */
  injectedContext: boolean;
  /** True once a unit is active and we hold its executor identity. */
  ready: boolean;
  loading: boolean;
  error: Error | null;
  /** Create the namespace (no unit yet). Optional name becomes the alias. */
  bootstrap: (name?: string) => Promise<void>;
  /** Mint a shareable invitation for the current namespace. */
  invite: () => Promise<unknown>;
  inviteLoading: boolean;
  /** Join an existing namespace from a share code. */
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

  // ---- multi extensions ----
  /** Sibling contexts in the active namespace. */
  units: Unit[];
  /** The active unit's context id (mirrors contextId). */
  activeUnitId: string | null;
  /** Select a unit to view/collaborate in. */
  selectUnit: (contextId: string) => void;
  /** Create a new unit (a fresh context of PRIMARY_SERVICE). */
  createUnit: (name: string) => Promise<string | null>;
  createUnitLoading: boolean;
  unitsLoading: boolean;
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
  // else the first discovered namespace.
  const [activeNsId, setActiveNsId] = useState<string | null>(() => read(ACTIVE_NS_KEY));
  const [nsForCallback, setNsForCallback] = useState<string | null>(null);
  // An SSO/desktop session has callbackContextId at first render (ssoBootstrap
  // runs before React), but its namespace is resolved async below. Track that
  // lookup so `loading` covers it - otherwise the create-workspace screen can
  // flash (or a user can create a duplicate namespace) before it settles.
  const [resolvingCallbackNs, setResolvingCallbackNs] = useState<boolean>(!!callbackContextId);
  useEffect(() => {
    if (!mero || !callbackContextId) { setNsForCallback(null); setResolvingCallbackNs(false); return; }
    let cancelled = false;
    setResolvingCallbackNs(true);
    (async () => {
      try {
        const gid = await mero.admin.getContextGroup(callbackContextId);
        if (!cancelled && gid) setNsForCallback(gid);
      } catch { /* fall back to discovery */ }
      finally { if (!cancelled) setResolvingCallbackNs(false); }
    })();
    return () => { cancelled = true; };
  }, [mero, callbackContextId]);
  const validActive = activeNsId && namespaces.some((n) => n.namespaceId === activeNsId) ? activeNsId : null;
  const namespaceId = nsForCallback ?? validActive ?? namespaces[0]?.namespaceId ?? null;
  // Live namespaceId for async callbacks to detect a mid-flight switch (the value
  // captured in a useCallback closure goes stale after an await).
  const namespaceIdRef = useRef(namespaceId);
  namespaceIdRef.current = namespaceId;

  // Units = sibling contexts in the namespace.
  const { contexts, loading: unitsLoading, refetch: refetchContexts } = useGroupContexts(namespaceId);
  const units = useMemo<Unit[]>(
    () => contexts.map((c) => ({ contextId: c.contextId, name: c.name?.trim() || c.contextId.slice(0, 8) })),
    [contexts],
  );

  // Active unit: prefer callback context; else persisted per-namespace; else first.
  const [activeUnitId, setActiveUnitId] = useState<string | null>(callbackContextId);
  const userPickedUnit = useRef(false);
  useEffect(() => {
    if (callbackContextId) return;
    userPickedUnit.current = false;
    setActiveUnitId(null);
  }, [namespaceId, callbackContextId]);
  useEffect(() => {
    if (callbackContextId) { setActiveUnitId(callbackContextId); return; }
    if (!namespaceId) { setActiveUnitId(null); return; }
    // Keep an explicit user pick while the units list is still loading (so a
    // freshly created unit isn't clobbered back to units[0] mid-refetch), but
    // once the list has settled without it (e.g. the unit was deleted) fall
    // through and re-resolve instead of pointing at a dead context.
    if (userPickedUnit.current && activeUnitId && (unitsLoading || units.some((u) => u.contextId === activeUnitId))) return;
    const persisted = read(activeUnitKey(namespaceId));
    if (persisted && units.some((u) => u.contextId === persisted)) { setActiveUnitId(persisted); return; }
    if (activeUnitId && units.some((u) => u.contextId === activeUnitId)) return;
    setActiveUnitId(units[0]?.contextId ?? null);
  }, [callbackContextId, namespaceId, units, activeUnitId, unitsLoading]);

  const selectUnit = useCallback((contextId: string) => {
    userPickedUnit.current = true;
    setActiveUnitId(contextId);
    if (namespaceId) write(activeUnitKey(namespaceId), contextId);
  }, [namespaceId]);

  // Executor identity for the active unit.
  const [executorPublicKey, setExecutorPublicKey] = useState<string | null>(callbackContextIdentity);
  useEffect(() => {
    if (!mero || !activeUnitId) {
      setExecutorPublicKey(activeUnitId === callbackContextId ? callbackContextIdentity : null);
      return;
    }
    if (activeUnitId === callbackContextId && callbackContextIdentity) {
      setExecutorPublicKey(callbackContextIdentity);
      return;
    }
    let cancelled = false;
    setExecutorPublicKey(null);
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(activeUnitId);
        if (!cancelled && identities.length > 0) setExecutorPublicKey(identities[0]);
      } catch { /* stays null - useItems not-ready until an identity resolves */ }
    })();
    return () => { cancelled = true; };
  }, [mero, activeUnitId, callbackContextId, callbackContextIdentity]);

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
      try {
        await mero.admin.setDefaultCapabilities(ns.namespaceId, { defaultCapabilities: DEFAULT_CAPABILITIES });
      } catch { /* keep core's built-in default */ }
      write(ACTIVE_NS_KEY, ns.namespaceId);
      setActiveNsId(ns.namespaceId);
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

  const [createUnitLoading, setCreateUnitLoading] = useState(false);
  const creatingUnit = useRef(false);
  const createUnit = useCallback(async (name: string): Promise<string | null> => {
    if (creatingUnit.current) return null; // re-entrancy guard: a create is already in flight (double-Enter)
    if (!mero || !applicationId || !namespaceId) { setError(new Error('Workspace not ready yet - try again in a moment.')); return null; }
    const trimmed = name.trim();
    if (!trimmed) { setError(new Error('Name is required')); return null; }
    creatingUnit.current = true;
    const nsAtStart = namespaceId;
    setCreateUnitLoading(true);
    setError(null);
    try {
      const ctx = await mero.admin.createContext({
        applicationId,
        groupId: namespaceId,
        serviceName: PRIMARY_SERVICE.name,
        // The `group` service's #[app::init] takes `name: String` — encode it
        // as JSON bytes so the new context's GroupMetadata.name matches the
        // group's display name from the very first sync.
        initializationParams: Array.from(new TextEncoder().encode(JSON.stringify({ name: trimmed }))),
        name: trimmed,
      });
      if (!ctx?.contextId) throw new Error('createContext returned no contextId');
      // Best-effort node alias so tools can resolve the unit by name.
      try { await mero.admin.createContextAlias({ alias: trimmed, contextId: ctx.contextId }); } catch { /* convenience only */ }
      // If the user switched namespaces mid-flight, the new context belongs to the
      // old namespace - don't refetch/select it into the now-active one, and tell
      // the user where it went (it exists, just not in the current workspace).
      if (namespaceIdRef.current !== nsAtStart) {
        setError(new Error('Workspace changed before the space finished creating - switch back to see it.'));
        return null;
      }
      await refetchContexts();
      selectUnit(ctx.contextId);
      return ctx.contextId;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      return null;
    } finally {
      setCreateUnitLoading(false);
      creatingUnit.current = false;
    }
  }, [mero, applicationId, namespaceId, refetchContexts, selectUnit]);

  const switchNamespace = useCallback((nsId: string) => {
    // A callback (SSO/desktop) session pins namespaceId to nsForCallback, so a
    // switch can't take effect and would only wipe the active unit/executor.
    if (callbackContextId) return;
    if (!nsId || nsId === namespaceId) return;
    write(ACTIVE_NS_KEY, nsId);
    setActiveNsId(nsId);
    userPickedUnit.current = false;
    setActiveUnitId(null);
    setExecutorPublicKey(null);
  }, [namespaceId, callbackContextId]);

  const leaveWorkspace = useCallback(async () => {
    // A callback (SSO/desktop) session is pinned to the injected context: the
    // callback effects would restore activeUnitId/executorPublicKey and namespaceId
    // resolves back to nsForCallback, so leaving would only remove the member
    // server-side while the UI still renders as joined. Not supported here (see
    // switchNamespace).
    if (callbackContextId) throw new Error('Leaving is not available in a desktop session.');
    if (!namespaceId || !executorPublicKey) throw new Error('No workspace to leave.');
    await removeGroupMembers(namespaceId, { members: [executorPublicKey] });
    write(ACTIVE_NS_KEY, null);
    setActiveNsId(null);
    setActiveUnitId(null);
    setExecutorPublicKey(null);
    await refetchNamespaces();
  }, [namespaceId, executorPublicKey, removeGroupMembers, refetchNamespaces, callbackContextId]);

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
      const parsed = decodeInvitation(code) as DecodedInvitation;
      let nsId: string | null = null;
      let invitation: unknown = parsed;
      let groupName: string | undefined;
      if (Array.isArray(parsed.invitations) && parsed.invitations.length > 0) {
        const first = parsed.invitations[0];
        nsId = toHex(first.groupId);
        invitation = first.invitation;
        groupName = first.groupAlias || undefined;
      } else if (parsed.invitation?.groupId) {
        nsId = toHex(parsed.invitation.groupId);
        groupName = parsed.groupAlias || undefined;
      }
      if (!nsId) throw new Error('Invalid invitation: cannot determine namespace.');

      // Cast confined to this SDK handoff: the decoded payload is untrusted
      // external data, and joinNamespace owns its SignedGroupOpenInvitation type.
      await joinNamespace(nsId, { invitation: invitation as Parameters<typeof joinNamespace>[1]['invitation'], groupName });
      // Refresh the namespace list BEFORE activating nsId, so validActive accepts
      // it immediately - otherwise there's a frame where namespaceId falls back to
      // some other namespace (or null, flashing the create screen). useGroupContexts
      // then refetches off the namespaceId change; don't call its stale closure here.
      await refetchNamespaces();
      write(ACTIVE_NS_KEY, nsId);
      setActiveNsId(nsId);
      setActiveUnitId(null);
      setExecutorPublicKey(null);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e; // rethrow so JoinModal shows its error; setError also feeds the landing ws.error line.
    }
  }, [joinNamespace, refetchNamespaces]);

  return {
    contextId: activeUnitId,
    namespaceId,
    executorPublicKey,
    injectedContext: callbackContextId !== null,
    ready: activeUnitId !== null && executorPublicKey !== null,
    loading: nsLoading || unitsLoading || bootstrapping || resolvingCallbackNs,
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
    units,
    activeUnitId,
    selectUnit,
    createUnit,
    createUnitLoading,
    unitsLoading,
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
