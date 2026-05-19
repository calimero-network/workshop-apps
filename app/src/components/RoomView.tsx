import React, { useEffect, useState, useCallback } from 'react';
import { Vote, Ranking } from '../api/voting/VotingClient';

interface VoteDetailViewProps {
  vote: Vote;
  rankings: Ranking[];
  votingExecutorKey: string | null;
  onSubmitRanking: (voteId: string, rankedOptions: string[]) => Promise<string>;
  onUpdateRanking: (rankingId: string, newOrder: string[]) => Promise<void>;
  onCloseVote: (voteId: string) => Promise<void>;
  onFetchRankings: (voteId: string) => Promise<void>;
}

/** Compute aggregate Borda-style scores from all submitted rankings.
 *  Lower score = more preferred. Returns sorted array of {option, score}. */
function computeResults(options: string[], rankings: Ranking[]): Array<{ option: string; score: number; votes: number }> {
  const scores: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const opt of options) { scores[opt] = 0; counts[opt] = 0; }

  for (const ranking of rankings) {
    for (let i = 0; i < ranking.ranked_options.length; i++) {
      const opt = ranking.ranked_options[i];
      if (opt in scores) {
        scores[opt] += i; // position index: 0 = first choice
        counts[opt] += 1;
      }
    }
  }
  return options
    .map((opt) => ({ option: opt, score: scores[opt] ?? 0, votes: counts[opt] ?? 0 }))
    .sort((a, b) => a.score - b.score);
}

export default function VoteDetailView({
  vote,
  rankings,
  votingExecutorKey,
  onSubmitRanking,
  onUpdateRanking,
  onCloseVote,
  onFetchRankings,
}: VoteDetailViewProps) {
  const isOpen = vote.status === 'open';
  const isOrganizer = !!votingExecutorKey && vote.created_by === votingExecutorKey;

  // My existing ranking (if any)
  const myRanking: Ranking | undefined = rankings.find(
    (r) => r.voter === votingExecutorKey,
  );

  // Local ordering for the ranking UI — initialized from my existing ranking or the vote options
  const [order, setOrder] = useState<string[]>(() =>
    myRanking?.ranked_options.length ? [...myRanking.ranked_options] : [...vote.options],
  );
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // Reset order when vote changes or a new ranking arrives from server
  useEffect(() => {
    setOrder(myRanking?.ranked_options.length ? [...myRanking.ranked_options] : [...vote.options]);
  }, [vote.id, myRanking?.id, myRanking?.ranked_options.join(',')]);

  // Fetch rankings when vote changes
  useEffect(() => { void onFetchRankings(vote.id); }, [vote.id]);

  const moveUp = useCallback((i: number) => {
    if (i === 0) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((i: number) => {
    setOrder((prev) => {
      if (i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  }, []);

  const handleSubmit = async () => {
    if (!isOpen || submitting) return;
    setActionErr(null);
    setSubmitting(true);
    try {
      if (myRanking) {
        await onUpdateRanking(myRanking.id, order);
      } else {
        await onSubmitRanking(vote.id, order);
      }
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    if (closing) return;
    setActionErr(null);
    setClosing(true);
    try {
      await onCloseVote(vote.id);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : String(e));
    } finally {
      setClosing(false);
    }
  };

  const results = computeResults(vote.options, rankings);
  const hasMyRanking = !!myRanking;
  const rankingCount = rankings.length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.25rem',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexShrink: 0,
      }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
            {vote.title}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.3rem' }}>
            <span style={{
              display: 'inline-block',
              padding: '0.15rem 0.55rem',
              borderRadius: 20,
              fontSize: '0.7rem',
              fontWeight: 600,
              background: isOpen ? 'rgba(5,150,105,0.2)' : 'rgba(100,116,139,0.2)',
              color: isOpen ? 'var(--color-accent, #059669)' : '#94a3b8',
              border: `1px solid ${isOpen ? 'rgba(5,150,105,0.4)' : 'rgba(100,116,139,0.4)'}`,
            }}>
              {isOpen ? 'Open' : 'Closed'}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {rankingCount} vote{rankingCount !== 1 ? 's' : ''} submitted
            </span>
          </div>
        </div>

        {isOpen && isOrganizer && (
          <button
            onClick={handleClose}
            disabled={closing}
            style={{
              padding: '0.4rem 0.9rem',
              background: 'rgba(185,28,28,0.15)',
              color: '#fca5a5',
              border: '1px solid rgba(185,28,28,0.4)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.8rem',
              flexShrink: 0,
            }}
          >
            {closing ? 'Closing…' : 'Close Vote'}
          </button>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 0, minHeight: 0 }}>
        {/* Left: rank your choices */}
        <div style={{
          flex: 1,
          padding: '1.25rem',
          borderRight: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          overflowY: 'auto',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.05em' }}>
            {isOpen ? 'YOUR RANKING' : 'YOUR RANKING (CLOSED)'}
          </div>

          {isOpen && (
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
              {hasMyRanking
                ? 'Drag the options to update your ranking, then submit.'
                : 'Rank the options from most to least preferred, then submit.'}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {order.map((opt, i) => (
              <div
                key={opt}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.55rem 0.75rem',
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  opacity: isOpen ? 1 : 0.7,
                }}
              >
                <span style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: i === 0 ? 'var(--color-primary, #2563EB)' : '#1e293b',
                  color: i === 0 ? '#fff' : '#64748b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
                }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, fontSize: '0.9rem', color: '#e2e8f0' }}>{opt}</span>
                {isOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button
                      onClick={() => moveUp(i)}
                      disabled={i === 0}
                      title="Move up"
                      style={{
                        background: 'transparent', border: 'none', cursor: i === 0 ? 'default' : 'pointer',
                        color: i === 0 ? '#334155' : '#94a3b8', padding: '0 0.2rem', lineHeight: 1,
                      }}
                    >▲</button>
                    <button
                      onClick={() => moveDown(i)}
                      disabled={i === order.length - 1}
                      title="Move down"
                      style={{
                        background: 'transparent', border: 'none',
                        cursor: i === order.length - 1 ? 'default' : 'pointer',
                        color: i === order.length - 1 ? '#334155' : '#94a3b8', padding: '0 0.2rem', lineHeight: 1,
                      }}
                    >▼</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {isOpen && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                padding: '0.55rem 1.25rem',
                background: submitting ? '#334155' : 'var(--color-primary, #2563EB)',
                color: '#fff', border: 'none', borderRadius: 8,
                cursor: submitting ? 'default' : 'pointer',
                fontSize: '0.9rem', fontWeight: 600, alignSelf: 'flex-start',
              }}
            >
              {submitting ? 'Saving…' : hasMyRanking ? 'Update Ranking' : 'Submit Ranking'}
            </button>
          )}

          {actionErr && (
            <div style={{ color: '#f08080', fontSize: '0.78rem' }}>{actionErr}</div>
          )}
        </div>

        {/* Right: live results */}
        <div style={{
          width: 300,
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          overflowY: 'auto',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.05em' }}>
            LIVE RESULTS
          </div>

          {rankingCount === 0 ? (
            <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0 }}>
              No votes yet. Be the first to rank!
            </p>
          ) : (
            results.map((r, i) => {
              const maxScore = results.reduce((m, x) => Math.max(m, x.score), 1);
              const pct = rankingCount > 0 ? Math.max(5, Math.round((1 - r.score / (maxScore + 1)) * 100)) : 0;
              return (
                <div key={r.option} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: '50%',
                        background: i === 0 ? 'var(--color-accent, #059669)' : '#1e293b',
                        color: i === 0 ? '#fff' : '#64748b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.65rem', fontWeight: 700, flexShrink: 0,
                      }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>{r.option}</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      {r.votes} vote{r.votes !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: i === 0
                        ? 'var(--color-accent, #059669)'
                        : 'var(--color-primary, #2563EB)',
                      borderRadius: 3,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
