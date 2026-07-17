/**
 * useIncidents — CRUD + live sync over the incident-tracker's shared
 * `Incident` entity, following the same pattern as the foundation's
 * `useItems` (typed generated client + `useSubscription` refetch).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { IncidentTrackerClient, Incident } from '../api/incident-tracker/IncidentTrackerClient';

export interface UseIncidentsArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

export interface UseIncidentsReturn {
  incidents: Incident[];
  loading: boolean;
  error: Error | null;
  ready: boolean;
  createIncident: (
    title: string,
    description: string,
    severity: string,
    affectedArea: string,
  ) => Promise<void>;
  updateStatus: (incidentId: string, status: string) => Promise<void>;
  assignIncident: (incidentId: string, assignee: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useIncidents({ contextId, executorPublicKey }: UseIncidentsArgs): UseIncidentsReturn {
  const { mero } = useMero();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new IncidentTrackerClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      setIncidents(await client.listIncidents());
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates: re-fetch on any sync event for this context (local or remote peers).
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const createIncident = useCallback(
    async (title: string, description: string, severity: string, affectedArea: string) => {
      if (!client) return;
      await client.createIncident({ title, description, severity, affected_area: affectedArea });
      await refresh();
    },
    [client, refresh],
  );

  const updateStatus = useCallback(
    async (incidentId: string, status: string) => {
      if (!client) return;
      await client.updateStatus({ incident_id: incidentId, status });
      await refresh();
    },
    [client, refresh],
  );

  const assignIncident = useCallback(
    async (incidentId: string, assignee: string) => {
      if (!client) return;
      await client.assignIncident({ incident_id: incidentId, assignee });
      await refresh();
    },
    [client, refresh],
  );

  return {
    incidents,
    loading,
    error,
    ready: client !== null,
    createIncident,
    updateStatus,
    assignIncident,
    refresh,
  };
}
