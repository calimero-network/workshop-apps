/**
 * useIncidentTracker — primary data hook for the incident-command app.
 *
 * Wraps IncidentcommandClient, fetches all incidents + on-call on mount,
 * and re-fetches on every sync event so changes from remote peers appear live.
 *
 * Used by: DashboardPage (active incidents), HistoryPage (resolved incidents),
 * and any component that needs the full incident list.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { IncidentcommandClient } from '../generated/IncidentcommandClient';
import type { Incident, OnCallEntry } from '../types/incidents';

export interface UseIncidentTrackerArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

export interface UseIncidentTrackerReturn {
  incidents: Incident[];
  onCall: OnCallEntry | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  createIncident: (title: string, description: string, severity: string) => Promise<void>;
  acknowledgeIncident: (incidentId: string) => Promise<void>;
  resolveIncident: (incidentId: string) => Promise<void>;
  updateIncident: (incidentId: string, severity: string | null, assignee: string | null) => Promise<void>;
  setOnCall: (responder: string) => Promise<void>;
}

export function useIncidentTracker({
  contextId,
  executorPublicKey,
}: UseIncidentTrackerArgs): UseIncidentTrackerReturn {
  const { mero } = useMero();

  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new IncidentcommandClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [onCall, setOnCall] = useState<OnCallEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [incs, oc] = await Promise.all([client.listIncidents(), client.getOnCall()]);
      setIncidents(incs);
      setOnCall(oc);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live sync: re-fetch on any peer sync event for this context.
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const createIncident = useCallback(async (title: string, description: string, severity: string) => {
    if (!client) return;
    await client.createIncident(title, description, severity);
    await refresh();
  }, [client, refresh]);

  const acknowledgeIncident = useCallback(async (incidentId: string) => {
    if (!client) return;
    await client.acknowledgeIncident(incidentId);
    await refresh();
  }, [client, refresh]);

  const resolveIncident = useCallback(async (incidentId: string) => {
    if (!client) return;
    await client.resolveIncident(incidentId);
    await refresh();
  }, [client, refresh]);

  const updateIncident = useCallback(async (
    incidentId: string,
    severity: string | null,
    assignee: string | null,
  ) => {
    if (!client) return;
    await client.updateIncident(incidentId, severity, assignee);
    await refresh();
  }, [client, refresh]);

  const setOnCallFn = useCallback(async (responder: string) => {
    if (!client) return;
    await client.setOnCall(responder);
    await refresh();
  }, [client, refresh]);

  return {
    incidents,
    onCall,
    loading,
    error,
    refresh,
    createIncident,
    acknowledgeIncident,
    resolveIncident,
    updateIncident,
    setOnCall: setOnCallFn,
  };
}
