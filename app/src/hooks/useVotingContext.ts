import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { VotingClient, Vote, Ranking } from '../api/voting/VotingClient';

export interface UseVotingContextReturn {
  votes: Vote[];
  rankings: Ranking[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  fetchRankings: (voteId: string) => Promise<void>;
  createVote: (title: string, options: string[]) => Promise<string>;
  submitRanking: (voteId: string, rankedOptions: string[]) => Promise<string>;
  updateRanking: (rankingId: string, newOrder: string[]) => Promise<void>;
  closeVote: (voteId: string) => Promise<void>;
  votingExecutorKey: string | null;
}

export function useVotingContext(
  contextId: string | null,
  _lobbyExecutorPublicKey: string | null,
): UseVotingContextReturn {
  const { mero } = useMero();
  const [votes, setVotes] = useState<Vote[]>([]);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Per-context identity (may differ from lobby key)
  const [votingExecutorKey, setVotingExecutorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) { setVotingExecutorKey(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) { setVotingExecutorKey(identities[0]); return; }
        if (!cancelled && _lobbyExecutorPublicKey) setVotingExecutorKey(_lobbyExecutorPublicKey);
      } catch {
        if (!cancelled && _lobbyExecutorPublicKey) setVotingExecutorKey(_lobbyExecutorPublicKey);
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, _lobbyExecutorPublicKey]);

  const getClient = useCallback((): VotingClient | null => {
    if (!mero || !contextId || !votingExecutorKey) return null;
    return new VotingClient(mero, contextId, votingExecutorKey);
  }, [mero, contextId, votingExecutorKey]);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const voteList = await client.listVotes();
      setVotes(voteList);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  const fetchRankings = useCallback(async (voteId: string) => {
    const client = getClient();
    if (!client) return;
    try {
      const r = await client.getRankingsForVote({ vote_id: voteId });
      setRankings(r);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [getClient]);

  useEffect(() => { void refresh(); }, [refresh]);

  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const createVote = useCallback(async (title: string, options: string[]): Promise<string> => {
    const client = getClient();
    if (!client) throw new Error('Voting client not ready');
    const id = await client.createVote({ title, options });
    await refresh();
    return id;
  }, [getClient, refresh]);

  const submitRanking = useCallback(async (voteId: string, rankedOptions: string[]): Promise<string> => {
    const client = getClient();
    if (!client) throw new Error('Voting client not ready');
    const id = await client.submitRanking({ vote_id: voteId, ranked_options: rankedOptions });
    await fetchRankings(voteId);
    return id;
  }, [getClient, fetchRankings]);

  const updateRanking = useCallback(async (rankingId: string, newOrder: string[]): Promise<void> => {
    const client = getClient();
    if (!client) throw new Error('Voting client not ready');
    await client.updateRanking({ ranking_id: rankingId, new_order: newOrder });
    // Find the vote this ranking belongs to so we can refresh its rankings
    const ranking = rankings.find((r) => r.id === rankingId);
    if (ranking) await fetchRankings(ranking.vote_id);
  }, [getClient, rankings, fetchRankings]);

  const closeVote = useCallback(async (voteId: string): Promise<void> => {
    const client = getClient();
    if (!client) throw new Error('Voting client not ready');
    await client.closeVote({ vote_id: voteId });
    await refresh();
  }, [getClient, refresh]);

  return {
    votes,
    rankings,
    loading,
    error,
    refresh,
    fetchRankings,
    createVote,
    submitRanking,
    updateRanking,
    closeVote,
    votingExecutorKey,
  };
}
