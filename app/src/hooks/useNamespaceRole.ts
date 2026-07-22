/**
 * useNamespaceRole - the caller's own role ('Admin' | 'Member' | 'ReadOnly')
 * in a namespace. mero-react's useGroupMembers excludes self, so read the raw
 * admin list (which includes self) and find our identity. Used to gate admin
 * controls and hide "Leave workspace" for the owner.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMero } from '@calimero-network/mero-react';

export interface NamespaceRole {
  role: string | null;
  isAdmin: boolean;
  refresh: () => Promise<void>;
}

export function useNamespaceRole(
  namespaceId: string | null,
  selfIdentity: string | null,
): NamespaceRole {
  const { mero } = useMero();
  const [role, setRole] = useState<string | null>(null);
  // Guards against a stale in-flight fetch (e.g. a fast namespace switch)
  // resolving after a newer one and clobbering role with old-namespace data.
  const reqIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    const apply = (next: string | null) => { if (reqIdRef.current === reqId) setRole(next); };
    if (!mero || !namespaceId || !selfIdentity) { apply(null); return; }
    try {
      // DTS types the response as { members } but some node versions send
      // { data }; both include self. Cast through unknown to read either.
      const raw = (await mero.admin.listGroupMembers(namespaceId)) as unknown as {
        members?: Array<{ identity: string; role?: string }>;
        data?: Array<{ identity: string; role?: string }>;
      };
      const list = raw.members ?? raw.data ?? [];
      const me = list.find((m) => m.identity === selfIdentity);
      apply(me?.role ?? null);
    } catch {
      apply(null);
    }
  }, [mero, namespaceId, selfIdentity]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { role, isAdmin: role === 'Admin', refresh };
}
