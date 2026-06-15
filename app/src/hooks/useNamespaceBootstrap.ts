import { useCallback, useState } from 'react';
import { useMero } from '@calimero-network/mero-react';
import { SERVICE_NAME } from '../config';
import rawConfig from '../../studio.config.json';

/**
 * Capability bits for the namespace.
 *
 * CAN_CREATE_CONTEXT (1) — members can create per-instance contexts
 * CAN_INVITE_MEMBERS (2) — members can invite other users
 * MANAGE_MEMBERS     (8) — members can manage membership
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

/**
 * Safely resolves the wire service name for the namespace's root context.
 *
 * Multi-service apps declare a service with id="directory" in studio.config.json
 * and SERVICE_NAME.directory returns its wire name. Single-service apps (like
 * this one) don't have an id="directory" entry, so SERVICE_NAME.directory throws.
 * In that case, fall back to the first declared service's name.
 */
function resolveDirectoryServiceName(): string {
  try {
    return SERVICE_NAME.directory;
  } catch {
    const raw = rawConfig as { services?: { name: string }[] };
    const first = raw.services?.[0]?.name;
    if (!first) throw new Error('studio.config.json: no services declared');
    return first;
  }
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
        // 1. Create namespace (root group bound to the application)
        const ns = await mero.admin.createNamespace({
          applicationId,
          upgradePolicy: 'Automatic',
          name: alias,
        });

        const namespaceId = ns.namespaceId;

        // 2. Configure default capabilities so all members can operate within the namespace
        await mero.admin.setDefaultCapabilities(namespaceId, {
          defaultCapabilities: DEFAULT_CAPABILITIES,
        });

        // 3. Create the root context inside the namespace group.
        //    For single-service apps this is the only context (the club itself).
        //    For multi-service apps this is the directory/lobby context.
        const serviceName = resolveDirectoryServiceName();
        const ctx = await mero.admin.createContext({
          applicationId,
          groupId: namespaceId,
          serviceName,
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
