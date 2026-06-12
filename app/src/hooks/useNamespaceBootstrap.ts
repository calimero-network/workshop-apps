import { useCallback, useState } from 'react';
import { useMero } from '@calimero-network/mero-react';
import { SERVICE_NAME } from '../config';

/**
 * Capability bits for the namespace.
 *
 * CAN_CREATE_CONTEXT (1) — members can create per-instance contexts (e.g. rooms) in subgroups
 * CAN_INVITE_MEMBERS (2) — members can invite other users
 * MANAGE_MEMBERS     (8) — members can add users to per-instance subgroups
 */
const DEFAULT_CAPABILITIES = 1 | 2 | 8; // = 11

export interface NamespaceBootstrapResult {
  namespaceId: string;
  lobbyContextId: string;
  memberPublicKey: string;
}

export interface UseNamespaceBootstrapReturn {
  createNamespaceWithLobby: (alias?: string) => Promise<NamespaceBootstrapResult | null>;
  loading: boolean;
  error: Error | null;
}

export function useNamespaceBootstrap(
  applicationId: string | null,
): UseNamespaceBootstrapReturn {
  const { mero } = useMero();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createNamespaceWithLobby = useCallback(
    async (alias?: string): Promise<NamespaceBootstrapResult | null> => {
      if (!mero || !applicationId) {
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        // 1. Create namespace (root group bound to the chat application)
        const ns = await mero.admin.createNamespace({
          applicationId,
          upgradePolicy: 'Automatic',
          name: alias,
        });

        const namespaceId = ns.namespaceId;

        // 2. Configure default capabilities so all members can create per-instance contexts
        await mero.admin.setDefaultCapabilities(namespaceId, {
          defaultCapabilities: DEFAULT_CAPABILITIES,
        });

        // 3. Create the lobby (workspace directory) context inside the namespace root group
        const ctx = await mero.admin.createContext({
          applicationId,
          groupId: namespaceId,
          serviceName: SERVICE_NAME.directory,
          initializationParams: [],
        });

        return {
          namespaceId,
          lobbyContextId: ctx.contextId,
          memberPublicKey: ctx.memberPublicKey,
        };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [mero, applicationId],
  );

  return { createNamespaceWithLobby, loading, error };
}
