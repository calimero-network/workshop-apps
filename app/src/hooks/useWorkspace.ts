/**
 * useWorkspace — resolves the ONE shared Calimero context this single-context
 * app runs in, and exposes invite / join so peers can collaborate in it.
 *
 * Single-context model (the neutral foundation):
 *  - The app installs as a Calimero application → a namespace. The shared state
 *    lives in one context inside that namespace, created from `PRIMARY_SERVICE`.
 *  - When launched from the desktop app (SSO), `useMero()` already carries a
 *    `contextId` + `contextIdentity` from the auth callback — we use those
 *    directly and skip bootstrap.
 *  - On the web, first run has no context: we create the namespace + context
 *    once and remember it. Peers join via a namespace invitation (Invite/Join
 *    modals) — no rooms, no per-instance contexts.
 *
 * The build agent rarely touches this: it reshapes the DATA hook (`useItems`)
 * and the page, not the workspace wiring. Multi-context specs replace this with
 * the per-context topology documented in the calimero-client-js skill.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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

// Active-namespace selection persists across reloads so the switcher restores
// the last workspace. Single-context: this only picks WHICH namespace the one
// shared context binds to - it does not add contexts.
const ACTIVE_NS_KEY = 'app:active-namespace';
function getStoredActiveNs(): string | null {
  try { return localStorage.getItem(ACTIVE_NS_KEY); } catch { return null; }
}
function storeActiveNs(id: string): void {
  try { localStorage.setItem(ACTIVE_NS_KEY, id); } catch { /* ignore */ }
}

const ENV_APPLICATION_ID = import.meta.env.VITE_APPLICATION_ID?.trim() || null;

// Members can create per-namespace contexts + invite others. Mirrors core's
// MemberCapabilities bits (CAN_CREATE_CONTEXT | CAN_INVITE_MEMBERS).
const DEFAULT_CAPABILITIES = 1 | 2; // = 3

export interface UseWorkspaceReturn {
  /** The shared context's id — null until resolved/created. Feeds useItems. */
  contextId: string | null;
  /** The namespace (group) the context lives in — keys member display names. */
  namespaceId: string | null;
  /** Executor public key for that context (the signer for RPC calls). */
  executorPublicKey: string | null;
  /** True when the identity came from an injected/SSO callback context
   *  (desktop launch or the e2e harness). The display-name gate is suppressed
   *  for these — they never take the manual create-workspace path. */
  injectedContext: boolean;
  /** True once a context exists and we hold an executor identity for it. */
  ready: boolean;
  loading: boolean;
  error: Error | null;
  /** Create the namespace + shared context (first-run web bootstrap). The
   *  optional `name` becomes the namespace alias shown to peers. When the
   *  service's `init(...)` takes arguments, pass `initializationParams` keyed
   *  by the Rust arg names (snake_case). */
  bootstrap: (name?: string, initializationParams?: Record<string, unknown>) => Promise<void>;
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
  /** Rebind the single shared context to another namespace and persist it. */
  switchNamespace: (namespaceId: string) => void;
  /** Remove self from the current namespace and return to the create-or-join gate. */
  leaveWorkspace: () => Promise<void>;
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

  // The namespace this app operates in. Resolve it from the bound context
  // (a context's group IS its namespace) so invite() targets the right
  // namespace even when the node hosts several, falling back to the first
  // discovered namespace before a context resolves. Production single-context
  // launches resolve to the same value the old `namespaces[0]` gave.
  const [nsForContext, setNsForContext] = useState<string | null>(null);
  const [activeNsId, setActiveNsId] = useState<string | null>(getStoredActiveNs);
  // The bound context's group wins; then the persisted selection; then the
  // first discovered namespace (the pre-switcher default).
  // A persisted selection for a namespace that no longer exists must not
  // shadow a valid namespace and strand the user on the create-or-join gate.
  const validActive = activeNsId && namespaces.some((n) => n.namespaceId === activeNsId) ? activeNsId : null;
  const namespaceId = nsForContext ?? validActive ?? namespaces[0]?.namespaceId ?? null;

  // Contexts inside that namespace; the shared context is the first one.
  const { contexts: nsContexts, loading: ctxLoading, refetch: refetchContexts } =
    useGroupContexts(namespaceId);

  const [contextId, setContextId] = useState<string | null>(callbackContextId);
  const [executorPublicKey, setExecutorPublicKey] = useState<string | null>(
    callbackContextIdentity,
  );
  const [bootstrapping, setBootstrapping] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Prefer the auth-callback context (desktop SSO) over the discovered one.
  useEffect(() => {
    if (callbackContextId) {
      setContextId(callbackContextId);
      if (callbackContextIdentity) setExecutorPublicKey(callbackContextIdentity);
      return;
    }
    if (nsContexts.length > 0) setContextId(nsContexts[0].contextId);
  }, [callbackContextId, callbackContextIdentity, nsContexts]);

  // Resolve the executor identity we own in the resolved context.
  useEffect(() => {
    if (!mero || !contextId || executorPublicKey) return;
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) setExecutorPublicKey(identities[0]);
      } catch {
        /* leave null — useItems stays not-ready until an identity resolves */
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, executorPublicKey]);

  // Resolve the bound context's namespace (its group) so invite() targets it
  // regardless of how many namespaces the node hosts. Falls back to
  // namespaces[0] when it can't resolve (older nodes / pre-context).
  useEffect(() => {
    if (!mero || !contextId) { setNsForContext(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const gid = await mero.admin.getContextGroup(contextId);
        if (!cancelled && gid) setNsForContext(gid);
      } catch {
        /* fall back to namespaces[0] */
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId]);

  const creatingRef = useRef(false);
  const bootstrap = useCallback(async (name?: string, initializationParams?: Record<string, unknown>) => {
    if (!mero || !applicationId || creatingRef.current) return;
    creatingRef.current = true;
    setBootstrapping(true);
    setError(null);
    try {
      const trimmedName = name?.trim() || undefined;
      // The namespace name IS the workspace alias peers see. Single-context app,
      // so naming the namespace is enough — no separate context-group naming.
      const ns = await mero.admin.createNamespace({
        applicationId,
        upgradePolicy: 'Automatic',
        name: trimmedName,
      });
      await mero.admin.setDefaultCapabilities(ns.namespaceId, {
        defaultCapabilities: DEFAULT_CAPABILITIES,
      });
      // initializationParams keys are the service's Rust init(...) argument names
      // (snake_case), JSON-encoded to bytes the way client-js expects; omit for a
      // parameterless init(). `name` above is the namespace alias, not an init arg.
      const initBytes = initializationParams
        ? Array.from(new TextEncoder().encode(JSON.stringify(initializationParams)))
        : [];
      const ctx = await mero.admin.createContext({
        applicationId,
        groupId: ns.namespaceId,
        serviceName: PRIMARY_SERVICE.name,
        initializationParams: initBytes,
      });
      storeActiveNs(ns.namespaceId);
      setActiveNsId(ns.namespaceId);
      setContextId(ctx.contextId);
      setExecutorPublicKey(ctx.memberPublicKey);
      await refetchNamespaces();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      // Rethrow so awaiting callers (e.g. the create-workspace modal) can react
      // instead of treating a failed create as success; the Empty screen ignores
      // it and renders ws.error.
      throw e;
    } finally {
      creatingRef.current = false;
      setBootstrapping(false);
    }
  }, [mero, applicationId, refetchNamespaces]);

  // Rebind the single context to another namespace: persist the choice and
  // drop the current context so the bind effect re-resolves the target's
  // first context. nsForContext resets to null (contextId is null), so
  // namespaceId falls through to activeNsId.
  const switchNamespace = useCallback((nsId: string) => {
    if (!nsId || nsId === namespaceId) return;
    storeActiveNs(nsId);
    setActiveNsId(nsId);
    setContextId(null);
    setExecutorPublicKey(null);
  }, [namespaceId]);

  const leaveWorkspace = useCallback(async () => {
    if (!namespaceId || !executorPublicKey) throw new Error('No workspace to leave.');
    await removeGroupMembers(namespaceId, { members: [executorPublicKey] });
    try { localStorage.removeItem(ACTIVE_NS_KEY); } catch { /* ignore */ }
    setActiveNsId(null);
    setContextId(null);
    setExecutorPublicKey(null);
    await refetchNamespaces();
  }, [namespaceId, executorPublicKey, removeGroupMembers, refetchNamespaces]);

  const invite = useCallback(async () => {
    if (!namespaceId) throw new Error('No workspace yet — create one first.');
    return createNamespaceInvitation(namespaceId, { recursive: true });
  }, [namespaceId, createNamespaceInvitation]);

  const join = useCallback(async (code: string) => {
    const parsed = decodeInvitation(code) as any;

    // Share codes wrap the raw namespace invitation; unwrap to {nsId, invitation}.
    let nsId: string | null = null;
    let invitation = parsed;
    let groupName: string | undefined;
    if (Array.isArray(parsed?.invitations) && parsed.invitations.length > 0) {
      const first = parsed.invitations[0];
      nsId = first.groupId;
      invitation = first.invitation;
      groupName = first.groupAlias || undefined;
    } else if (parsed?.invitation?.groupId) {
      const gid = parsed.invitation.groupId;
      nsId = Array.isArray(gid)
        ? gid.map((b: number) => b.toString(16).padStart(2, '0')).join('')
        : String(gid);
      groupName = parsed.groupAlias || undefined;
    }
    if (!nsId) throw new Error('Invalid invitation: cannot determine namespace.');

    await joinNamespace(nsId, { invitation, groupName });
    storeActiveNs(nsId);
    setActiveNsId(nsId);
    setContextId(null);
    setExecutorPublicKey(null);
    await Promise.all([refetchNamespaces(), refetchContexts()]);
  }, [joinNamespace, refetchNamespaces, refetchContexts]);

  return {
    contextId,
    namespaceId,
    executorPublicKey,
    injectedContext: callbackContextId !== null,
    ready: contextId !== null && executorPublicKey !== null,
    loading: nsLoading || ctxLoading || bootstrapping,
    error,
    bootstrap,
    invite,
    join,
    inviteLoading,
    joinLoading,
    namespaces,
    activeNamespaceId: namespaceId,
    switchNamespace,
    leaveWorkspace,
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
