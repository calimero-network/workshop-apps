/**
 * usePipeline — per-context hook for the deal-flow pipeline.
 *
 * Wraps PipelineClient and subscribes to context events so the board
 * refreshes within ~5 s of any peer mutation (stages changed, lead added,
 * moved, or closed).
 */
import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { PipelineClient, type Lead } from '../api/pipeline/PipelineClient';

const DEFAULT_STAGES = ['New', 'Contacted', 'Proposal', 'Won', 'Lost'];

export interface UsePipelineReturn {
  stages: string[];
  leads: Lead[];
  closedLeads: Lead[];
  loading: boolean;
  error: Error | null;
  setStages: (stages: string[]) => Promise<void>;
  addLead: (name: string, company: string, value: number) => Promise<void>;
  moveLead: (leadId: string, newStage: string) => Promise<void>;
  closeLead: (leadId: string, outcome: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function usePipeline(
  contextId: string | null,
  lobbyExecutorPublicKey: string | null,
): UsePipelineReturn {
  const { mero } = useMero();
  const [stages, setStagesState] = useState<string[]>(DEFAULT_STAGES);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [closedLeads, setClosedLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Resolve the executor identity for this context (may differ from lobby key).
  const [executorKey, setExecutorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) {
      setExecutorKey(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) {
          setExecutorKey(identities[0]);
          return;
        }
        if (!cancelled && lobbyExecutorPublicKey) {
          setExecutorKey(lobbyExecutorPublicKey);
        }
      } catch {
        if (!cancelled && lobbyExecutorPublicKey) {
          setExecutorKey(lobbyExecutorPublicKey);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, lobbyExecutorPublicKey]);

  const getClient = useCallback((): PipelineClient | null => {
    if (!mero || !contextId || !executorKey) return null;
    return new PipelineClient(mero, contextId, executorKey);
  }, [mero, contextId, executorKey]);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [stageList, leadList, closedList] = await Promise.all([
        client.getStages(),
        client.listLeads(),
        client.listClosedLeads(),
      ]);
      setStagesState(stageList.length > 0 ? stageList : DEFAULT_STAGES);
      setLeads(leadList);
      setClosedLeads(closedList);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  // Initial load whenever the executor key becomes available.
  useEffect(() => {
    if (executorKey) void refresh();
  }, [executorKey, refresh]);

  // React to any pipeline event (local or synced from a peer).
  useSubscription(contextId ? [contextId] : [], () => {
    void refresh();
  });

  const setStages = useCallback(async (newStages: string[]) => {
    const client = getClient();
    if (!client) throw new Error('Pipeline not ready');
    await client.setStages({ stages: newStages });
    await refresh();
  }, [getClient, refresh]);

  const addLead = useCallback(async (name: string, company: string, value: number) => {
    const client = getClient();
    if (!client) throw new Error('Pipeline not ready');
    await client.addLead({ name, company, value });
    await refresh();
  }, [getClient, refresh]);

  const moveLead = useCallback(async (leadId: string, newStage: string) => {
    const client = getClient();
    if (!client) throw new Error('Pipeline not ready');
    await client.moveLead({ lead_id: leadId, new_stage: newStage });
    await refresh();
  }, [getClient, refresh]);

  const closeLead = useCallback(async (leadId: string, outcome: string) => {
    const client = getClient();
    if (!client) throw new Error('Pipeline not ready');
    await client.closeLead({ lead_id: leadId, outcome });
    await refresh();
  }, [getClient, refresh]);

  return { stages, leads, closedLeads, loading, error, setStages, addLead, moveLead, closeLead, refresh };
}
