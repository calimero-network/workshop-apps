/**
 * useIncidentManager — live incident state for a single incident_manager context.
 *
 * Subscribes to the context via useSubscription so any change (local or synced
 * from a peer) triggers a refresh within 5 s. Exposes all API methods as stable
 * callbacks; always calls refresh() after mutations so the UI doesn't lag.
 */

import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import {
  IncidentManagerClient,
  type Incident,
  type TimelineEntry,
  type Postmortem,
  type OnCallSlot,
} from '../api/incident_manager/IncidentManagerClient';

export interface UseIncidentManagerReturn {
  // Incidents
  incidents: Incident[];
  incidentsLoading: boolean;
  incidentsError: Error | null;
  refreshIncidents: () => Promise<void>;

  // Selected incident detail
  selectedIncident: Incident | null;
  selectIncident: (id: string | null) => void;

  // Timeline for selected incident
  timeline: TimelineEntry[];
  timelineLoading: boolean;
  refreshTimeline: (incidentId: string) => Promise<void>;

  // Postmortem for selected incident
  postmortem: Postmortem | null;
  postmortemLoading: boolean;
  refreshPostmortem: (incidentId: string) => Promise<void>;

  // On-call schedule
  oncallSchedule: OnCallSlot[];
  oncallLoading: boolean;
  refreshOncall: () => Promise<void>;

  // Mutations
  reportIncident: (title: string, description: string, severity: string) => Promise<string>;
  acknowledgeIncident: (incidentId: string) => Promise<void>;
  escalateIncident: (incidentId: string, nextResponderId: string) => Promise<void>;
  resolveIncident: (incidentId: string, rootCause: string) => Promise<void>;
  postTimelineEntry: (incidentId: string, body: string, entryType: string) => Promise<void>;
  createPostmortem: (incidentId: string, summary: string, rootCause: string, actionItems: string) => Promise<string>;
  updatePostmortem: (postmortemId: string, summary: string, rootCause: string, actionItems: string) => Promise<void>;
  setOncallSlot: (memberName: string, memberId: string, startTime: number, endTime: number, order: number) => Promise<string>;
  removeOncallSlot: (slotId: string) => Promise<void>;

  // Filter
  statusFilter: string | null;
  setStatusFilter: (f: string | null) => void;

  // Executor identity for this context
  executorPublicKey: string | null;
}

export function useIncidentManager(
  contextId: string | null,
  lobbyExecutorPublicKey: string | null,
): UseIncidentManagerReturn {
  const { mero } = useMero();

  // Resolve per-context executor identity (may differ from lobby key in
  // subgroup architectures; future-proof even though this spec has one context).
  const [executorPublicKey, setExecutorPublicKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) { setExecutorPublicKey(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) { setExecutorPublicKey(identities[0]); return; }
        if (!cancelled) setExecutorPublicKey(lobbyExecutorPublicKey);
      } catch {
        if (!cancelled) setExecutorPublicKey(lobbyExecutorPublicKey);
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, lobbyExecutorPublicKey]);

  const getClient = useCallback((): IncidentManagerClient | null => {
    if (!mero || !contextId || !executorPublicKey) return null;
    return new IncidentManagerClient(mero, contextId, executorPublicKey);
  }, [mero, contextId, executorPublicKey]);

  // --- Incidents ---
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentsError, setIncidentsError] = useState<Error | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const refreshIncidents = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setIncidentsLoading(true);
    setIncidentsError(null);
    try {
      const list = await client.listIncidents({ status_filter: statusFilter });
      // Sort by severity P1→P4, then by creation time descending
      list.sort((a, b) => {
        const sev = (s: string) => parseInt(s.replace('P', ''), 10) || 99;
        const diff = sev(a.severity) - sev(b.severity);
        if (diff !== 0) return diff;
        return b.created_at - a.created_at;
      });
      setIncidents(list);
    } catch (err) {
      setIncidentsError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIncidentsLoading(false);
    }
  }, [getClient, statusFilter]);

  useEffect(() => { void refreshIncidents(); }, [refreshIncidents]);

  // --- Selected incident + live detail ---
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  const selectIncident = useCallback((id: string | null) => {
    setSelectedIncidentId(id);
    if (!id) { setSelectedIncident(null); setTimeline([]); setPostmortem(null); }
  }, []);

  useEffect(() => {
    if (!selectedIncidentId) return;
    const found = incidents.find((i) => i.id === selectedIncidentId) ?? null;
    setSelectedIncident(found);
  }, [selectedIncidentId, incidents]);

  // --- Timeline ---
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const refreshTimeline = useCallback(async (incidentId: string) => {
    const client = getClient();
    if (!client) return;
    setTimelineLoading(true);
    try {
      const entries = await client.getTimeline({ incident_id: incidentId });
      entries.sort((a, b) => a.created_at - b.created_at);
      setTimeline(entries);
    } catch {
      /* keep previous */
    } finally {
      setTimelineLoading(false);
    }
  }, [getClient]);

  // Auto-refresh timeline when selected incident changes
  useEffect(() => {
    if (selectedIncidentId) { void refreshTimeline(selectedIncidentId); }
    else { setTimeline([]); }
  }, [selectedIncidentId, refreshTimeline]);

  // --- Postmortem ---
  const [postmortem, setPostmortem] = useState<Postmortem | null>(null);
  const [postmortemLoading, setPostmortemLoading] = useState(false);

  const refreshPostmortem = useCallback(async (incidentId: string) => {
    const client = getClient();
    if (!client) return;
    setPostmortemLoading(true);
    try {
      const pm = await client.getPostmortem({ incident_id: incidentId });
      setPostmortem(pm);
    } catch {
      /* keep previous */
    } finally {
      setPostmortemLoading(false);
    }
  }, [getClient]);

  useEffect(() => {
    if (selectedIncidentId) { void refreshPostmortem(selectedIncidentId); }
    else { setPostmortem(null); }
  }, [selectedIncidentId, refreshPostmortem]);

  // --- On-call schedule ---
  const [oncallSchedule, setOncallSchedule] = useState<OnCallSlot[]>([]);
  const [oncallLoading, setOncallLoading] = useState(false);

  const refreshOncall = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setOncallLoading(true);
    try {
      const slots = await client.getOncallSchedule();
      slots.sort((a, b) => a.order - b.order);
      setOncallSchedule(slots);
    } catch {
      /* keep previous */
    } finally {
      setOncallLoading(false);
    }
  }, [getClient]);

  useEffect(() => { void refreshOncall(); }, [refreshOncall]);

  // --- Subscription: refresh everything on any context event ---
  const refresh = useCallback(() => {
    void refreshIncidents();
    void refreshOncall();
    if (selectedIncidentId) {
      void refreshTimeline(selectedIncidentId);
      void refreshPostmortem(selectedIncidentId);
    }
  }, [refreshIncidents, refreshOncall, refreshTimeline, refreshPostmortem, selectedIncidentId]);

  useSubscription(contextId ? [contextId] : [], refresh);

  // --- Mutations ---
  const reportIncident = useCallback(async (
    title: string, description: string, severity: string,
  ): Promise<string> => {
    const client = getClient();
    if (!client) throw new Error('Client not ready');
    const id = await client.reportIncident({ title, description, severity });
    await refreshIncidents();
    return id;
  }, [getClient, refreshIncidents]);

  const acknowledgeIncident = useCallback(async (incidentId: string) => {
    const client = getClient();
    if (!client) throw new Error('Client not ready');
    await client.acknowledgeIncident({ incident_id: incidentId });
    await Promise.all([refreshIncidents(), refreshTimeline(incidentId)]);
  }, [getClient, refreshIncidents, refreshTimeline]);

  const escalateIncident = useCallback(async (incidentId: string, nextResponderId: string) => {
    const client = getClient();
    if (!client) throw new Error('Client not ready');
    await client.escalateIncident({ incident_id: incidentId, next_responder_id: nextResponderId });
    await Promise.all([refreshIncidents(), refreshTimeline(incidentId)]);
  }, [getClient, refreshIncidents, refreshTimeline]);

  const resolveIncident = useCallback(async (incidentId: string, rootCause: string) => {
    const client = getClient();
    if (!client) throw new Error('Client not ready');
    await client.resolveIncident({ incident_id: incidentId, root_cause: rootCause });
    await Promise.all([refreshIncidents(), refreshTimeline(incidentId)]);
  }, [getClient, refreshIncidents, refreshTimeline]);

  const postTimelineEntry = useCallback(async (
    incidentId: string, body: string, entryType: string,
  ) => {
    const client = getClient();
    if (!client) throw new Error('Client not ready');
    await client.postTimelineEntry({ incident_id: incidentId, body, entry_type: entryType });
    await refreshTimeline(incidentId);
  }, [getClient, refreshTimeline]);

  const createPostmortem = useCallback(async (
    incidentId: string, summary: string, rootCause: string, actionItems: string,
  ): Promise<string> => {
    const client = getClient();
    if (!client) throw new Error('Client not ready');
    const id = await client.createPostmortem({
      incident_id: incidentId, summary, root_cause: rootCause, action_items: actionItems,
    });
    await refreshPostmortem(incidentId);
    return id;
  }, [getClient, refreshPostmortem]);

  const updatePostmortem = useCallback(async (
    postmortemId: string, summary: string, rootCause: string, actionItems: string,
  ) => {
    const client = getClient();
    if (!client) throw new Error('Client not ready');
    await client.updatePostmortem({
      postmortem_id: postmortemId, summary, root_cause: rootCause, action_items: actionItems,
    });
    if (selectedIncidentId) await refreshPostmortem(selectedIncidentId);
  }, [getClient, refreshPostmortem, selectedIncidentId]);

  const setOncallSlot = useCallback(async (
    memberName: string, memberId: string, startTime: number, endTime: number, order: number,
  ): Promise<string> => {
    const client = getClient();
    if (!client) throw new Error('Client not ready');
    const id = await client.setOncallSlot({
      member_name: memberName, member_id: memberId,
      start_time: startTime, end_time: endTime, order,
    });
    await refreshOncall();
    return id;
  }, [getClient, refreshOncall]);

  const removeOncallSlot = useCallback(async (slotId: string) => {
    const client = getClient();
    if (!client) throw new Error('Client not ready');
    await client.removeOncallSlot({ slot_id: slotId });
    await refreshOncall();
  }, [getClient, refreshOncall]);

  return {
    incidents,
    incidentsLoading,
    incidentsError,
    refreshIncidents,

    selectedIncident,
    selectIncident,

    timeline,
    timelineLoading,
    refreshTimeline,

    postmortem,
    postmortemLoading,
    refreshPostmortem,

    oncallSchedule,
    oncallLoading,
    refreshOncall,

    reportIncident,
    acknowledgeIncident,
    escalateIncident,
    resolveIncident,
    postTimelineEntry,
    createPostmortem,
    updatePostmortem,
    setOncallSlot,
    removeOncallSlot,

    statusFilter,
    setStatusFilter,

    executorPublicKey,
  };
}
