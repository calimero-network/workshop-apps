import { useCallback, useEffect, useRef, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { VotingClient, Poll, PollOption, Ranking } from '../api/voting/VotingClient';

export interface UsePollReturn {
  poll: Poll | null;
  options: PollOption[];
  rankings: Ranking[];
  loading: boolean;
  error: Error | null;
  /** executor identity for the voting context (different from namespace identity) */
  executorKey: string | null;

  createPoll: (title: string) => Promise<void>;
  addOption: (label: string) => Promise<void>;
  removeOption: (optionId: string) => Promise<void>;
  submitRanking: (orderedOptionIds: string[]) => Promise<void>;
  closePoll: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function usePoll(
  contextId: string | null,
  lobbyExecutorPublicKey: string | null,
): UsePollReturn {
  const { mero } = useMero();

  const [poll, setPoll] = useState<Poll | null>(null);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [executorKey, setExecutorKey] = useState<string | null>(null);

  // Resolve the executor identity for this voting context.
  // May differ from the lobby/namespace identity when the context has its own key.
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
        // Fall back to the lobby key while the context identity is provisioned.
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

  const getClient = useCallback((): VotingClient | null => {
    if (!mero || !contextId || !executorKey) return null;
    return new VotingClient(mero, contextId, executorKey);
  }, [mero, contextId, executorKey]);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      // get_poll errors when no poll exists yet — treat that as null.
      let fetchedPoll: Poll | null = null;
      try {
        fetchedPoll = await client.getPoll();
      } catch {
        fetchedPoll = null;
      }
      setPoll(fetchedPoll);

      if (fetchedPoll !== null) {
        const [fetchedOptions, fetchedRankings] = await Promise.all([
          client.getOptions(),
          client.getRankings(),
        ]);
        setOptions(fetchedOptions);
        setRankings(fetchedRankings);
      } else {
        setOptions([]);
        setRankings([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  // Load on mount and whenever the context/executor changes.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // React to any voting-context state change (local or synced from peers).
  useSubscription(contextId ? [contextId] : [], () => {
    void refresh();
  });

  const createPoll = useCallback(async (title: string) => {
    const client = getClient();
    if (!client) throw new Error('Voting client not ready');
    await client.createPoll({ title });
    await refresh();
  }, [getClient, refresh]);

  const addOption = useCallback(async (label: string) => {
    const client = getClient();
    if (!client) throw new Error('Voting client not ready');
    await client.addOption({ label });
    await refresh();
  }, [getClient, refresh]);

  const removeOption = useCallback(async (optionId: string) => {
    const client = getClient();
    if (!client) throw new Error('Voting client not ready');
    await client.removeOption({ option_id: optionId });
    await refresh();
  }, [getClient, refresh]);

  const submitRanking = useCallback(async (orderedOptionIds: string[]) => {
    const client = getClient();
    if (!client) throw new Error('Voting client not ready');
    await client.submitRanking({ ordered_option_ids: orderedOptionIds });
    await refresh();
  }, [getClient, refresh]);

  const closePoll = useCallback(async () => {
    const client = getClient();
    if (!client) throw new Error('Voting client not ready');
    await client.closePoll();
    await refresh();
  }, [getClient, refresh]);

  return {
    poll,
    options,
    rankings,
    loading,
    error,
    executorKey,
    createPoll,
    addOption,
    removeOption,
    submitRanking,
    closePoll,
    refresh,
  };
}
