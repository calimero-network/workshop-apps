import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { useChatLobby } from '../../hooks/useChatLobby';
import { usePoll } from '../../hooks/usePoll';
import { PollOption, Ranking } from '../../api/voting/VotingClient';
import Sidebar from '../../components/Sidebar';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import WorkspacesEmptyState from '../../components/WorkspacesEmptyState';

/* ── helpers ──────────────────────────────────────────────────────────────── */
function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

interface Standing {
  id: string;
  label: string;
  avgRank: number;
  firstPlaceVotes: number;
  voteCount: number;
}

function computeStandings(options: PollOption[], rankings: Ranking[]): Standing[] {
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  const firsts: Record<string, number> = {};
  for (const opt of options) {
    sums[opt.id] = 0;
    counts[opt.id] = 0;
    firsts[opt.id] = 0;
  }
  for (const r of rankings) {
    const ordered = r.ordered_option_ids.split(',').filter(Boolean);
    ordered.forEach((optId, idx) => {
      sums[optId] = (sums[optId] ?? 0) + (idx + 1);
      counts[optId] = (counts[optId] ?? 0) + 1;
      if (idx === 0) firsts[optId] = (firsts[optId] ?? 0) + 1;
    });
  }
  return options
    .map((opt) => ({
      id: opt.id,
      label: opt.label,
      avgRank: counts[opt.id] > 0 ? sums[opt.id] / counts[opt.id] : Infinity,
      firstPlaceVotes: firsts[opt.id] ?? 0,
      voteCount: counts[opt.id] ?? 0,
    }))
    .sort((a, b) => a.avgRank - b.avgRank);
}

/* ── PollSetupView ─────────────────────────────────────────────────────────── */
function PollSetupView({
  onCreate,
  isLoading,
}: {
  onCreate: (title: string) => Promise<void>;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    const t = title.trim();
    if (!t) { setErr('Poll title is required'); return; }
    setBusy(true);
    setErr('');
    try {
      await onCreate(t);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create poll');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.centered}>
      <div style={styles.card}>
        <div style={styles.cardIcon} aria-hidden>🗳️</div>
        <h2 style={styles.cardTitle}>Create a new poll</h2>
        <p style={styles.cardDesc}>
          Name your poll, invite your group, then let everyone rank the options.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 8 }}>
          <input
            style={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            placeholder="e.g. Where should we eat Friday?"
            maxLength={120}
            aria-label="Poll title"
            autoFocus
          />
          {err && <p style={{ fontSize: 12, color: 'var(--c-danger, #d23b2f)', margin: 0 }}>{err}</p>}
          <button
            style={isLoading || busy ? { ...styles.primaryBtn, opacity: 0.6 } : styles.primaryBtn}
            onClick={submit}
            disabled={isLoading || busy}
          >
            {busy ? 'Creating…' : 'Create Poll'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── PollOpenView ──────────────────────────────────────────────────────────── */
function PollOpenView({
  poll,
  options,
  rankings,
  executorKey,
  isAdmin,
  onAddOption,
  onRemoveOption,
  onSubmitRanking,
  onClosePoll,
}: {
  poll: { id: string; title: string; status: string; created_at: number };
  options: PollOption[];
  rankings: Ranking[];
  executorKey: string | null;
  isAdmin: boolean;
  onAddOption: (label: string) => Promise<void>;
  onRemoveOption: (id: string) => Promise<void>;
  onSubmitRanking: (ids: string[]) => Promise<void>;
  onClosePoll: () => Promise<void>;
}) {
  const [newLabel, setNewLabel] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<'rank' | 'results'>('rank');

  // Ranking state — user drags to reorder
  const [rankOrder, setRankOrder] = useState<string[]>([]);
  const dragIdx = useRef<number | null>(null);

  // Find the current user's submitted ranking (if any) to pre-populate the list.
  const myRanking = executorKey
    ? rankings.find((r) => r.author === executorKey)
    : null;

  // Sync rankOrder when options change (add/remove) or user's existing ranking arrives.
  useEffect(() => {
    const myIds = myRanking
      ? myRanking.ordered_option_ids.split(',').filter(Boolean)
      : [];
    // Keep order from existing ranking, append any new options at the end.
    const existingValid = myIds.filter((id) => options.some((o) => o.id === id));
    const unranked = options.map((o) => o.id).filter((id) => !existingValid.includes(id));
    setRankOrder([...existingValid, ...unranked]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.length, myRanking?.ordered_option_ids]);

  const handleDragStart = (idx: number) => { dragIdx.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === idx) return;
    const next = [...rankOrder];
    const [item] = next.splice(from, 1);
    next.splice(idx, 0, item);
    setRankOrder(next);
    dragIdx.current = idx;
  };
  const handleDrop = () => { dragIdx.current = null; };

  const addOption = async () => {
    const label = newLabel.trim();
    if (!label) { setAddErr('Option text is required'); return; }
    setAddBusy(true);
    setAddErr('');
    try {
      await onAddOption(label);
      setNewLabel('');
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : 'Failed to add option');
    } finally {
      setAddBusy(false);
    }
  };

  const submitRanking = async () => {
    if (rankOrder.length === 0) return;
    setSubmitBusy(true);
    try {
      await onSubmitRanking(rankOrder);
    } catch {
      // errors surface via poll.error upstream
    } finally {
      setSubmitBusy(false);
    }
  };

  const closePoll = async () => {
    if (!window.confirm('Close the poll? No more rankings can be submitted after this.')) return;
    setCloseBusy(true);
    try { await onClosePoll(); } catch { setCloseBusy(false); }
  };

  const standings = computeStandings(options, rankings);
  const totalVotes = rankings.length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Poll header */}
      <div style={styles.pollHeader}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={styles.pollStatus}>
            <span style={styles.statusBadgeOpen}>● OPEN</span>
            <span style={styles.voteCount}>{totalVotes} vote{totalVotes !== 1 ? 's' : ''} in</span>
          </div>
          <h1 style={styles.pollTitle}>{poll.title}</h1>
        </div>
        {isAdmin && (
          <button
            style={closeBusy ? { ...styles.dangerBtn, opacity: 0.6 } : styles.dangerBtn}
            onClick={closePoll}
            disabled={closeBusy}
          >
            {closeBusy ? 'Closing…' : 'Close Poll'}
          </button>
        )}
      </div>

      {/* Two-column layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Options */}
        <div style={styles.optionsPanel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelLabel}>Options</span>
            <span style={styles.panelMeta}>{options.length} option{options.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {options.length === 0 && (
              <div style={styles.emptyMsg}>No options yet — add the first one below.</div>
            )}
            {options.map((opt) => {
              const isMine = opt.author === executorKey;
              return (
                <div key={opt.id} style={styles.optionRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={styles.optionLabel}>{opt.label}</span>
                    {isMine && <span style={styles.mineBadge}>mine</span>}
                  </div>
                  {isMine && (
                    <button
                      style={styles.removeBtn}
                      onClick={() => onRemoveOption(opt.id)}
                      title="Remove your option"
                      aria-label="Remove option"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {/* Add option */}
          <div style={styles.addOptionForm}>
            <input
              style={styles.inputSm}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void addOption(); }}
              placeholder="Suggest an option…"
              maxLength={120}
              aria-label="New option text"
            />
            {addErr && <p style={{ fontSize: 11, color: 'var(--c-danger, #d23b2f)', margin: '4px 0 0' }}>{addErr}</p>}
            <button
              style={addBusy ? { ...styles.secondaryBtn, opacity: 0.6 } : styles.secondaryBtn}
              onClick={addOption}
              disabled={addBusy}
            >
              {addBusy ? 'Adding…' : '+ Add Option'}
            </button>
          </div>
        </div>

        {/* Right: Rank / Results tabs */}
        <div style={styles.rightPanel}>
          {/* Tab bar */}
          <div style={styles.tabBar}>
            <button
              style={activeTab === 'rank' ? styles.tabActive : styles.tab}
              onClick={() => setActiveTab('rank')}
            >
              Your Ranking
            </button>
            <button
              style={activeTab === 'results' ? styles.tabActive : styles.tab}
              onClick={() => setActiveTab('results')}
            >
              Live Results
            </button>
          </div>

          {activeTab === 'rank' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 16px' }}>
              {options.length === 0 ? (
                <div style={styles.emptyMsg}>Add options on the left to start ranking.</div>
              ) : (
                <>
                  <p style={styles.rankHint}>
                    Drag options to reorder — top = most preferred.
                    {myRanking && <span style={{ color: 'var(--color-accent)', marginLeft: 6, fontWeight: 600 }}>✓ Ranking submitted</span>}
                  </p>
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {rankOrder.map((optId, idx) => {
                      const opt = options.find((o) => o.id === optId);
                      if (!opt) return null;
                      return (
                        <div
                          key={optId}
                          draggable
                          onDragStart={() => handleDragStart(idx)}
                          onDragOver={(e) => handleDragOver(e, idx)}
                          onDrop={handleDrop}
                          style={styles.rankRow}
                        >
                          <span style={styles.rankNum}>{idx + 1}</span>
                          <span style={styles.rankLabel}>{opt.label}</span>
                          <span style={styles.dragHandle} aria-hidden>⠿</span>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    style={submitBusy || rankOrder.length === 0
                      ? { ...styles.primaryBtn, marginTop: 12, opacity: 0.6 }
                      : { ...styles.primaryBtn, marginTop: 12 }}
                    onClick={submitRanking}
                    disabled={submitBusy || rankOrder.length === 0}
                  >
                    {submitBusy ? 'Submitting…' : myRanking ? 'Update Ranking' : 'Submit Ranking'}
                  </button>
                </>
              )}
            </div>
          )}

          {activeTab === 'results' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {totalVotes === 0 ? (
                <div style={styles.emptyMsg}>No rankings yet — be the first to vote!</div>
              ) : (
                <>
                  <p style={styles.rankHint}>Sorted by average rank — lower is better.</p>
                  {standings.map((s, rank) => {
                    const isWinner = rank === 0;
                    const maxAvg = standings.length;
                    const barPct = Math.round(Math.max(0, (maxAvg - s.avgRank + 0.5) / maxAvg) * 100);
                    return (
                      <div key={s.id} style={isWinner ? { ...styles.resultRow, ...styles.resultRowWinner } : styles.resultRow}>
                        <span style={isWinner ? styles.resultRankWinner : styles.resultRank}>{rank + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={isWinner ? styles.resultLabelWinner : styles.resultLabel}>{s.label}</span>
                            {s.firstPlaceVotes > 0 && (
                              <span style={styles.firstBadge}>{s.firstPlaceVotes}×1st</span>
                            )}
                          </div>
                          <div style={styles.barTrack}>
                            <div style={{ ...styles.barFill, width: `${barPct}%`, background: isWinner ? 'var(--color-primary)' : 'rgba(79,70,229,0.4)' }} />
                          </div>
                        </div>
                        <span style={styles.avgLabel}>
                          {s.voteCount > 0 ? `avg ${s.avgRank.toFixed(1)}` : '—'}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── ResultsView ───────────────────────────────────────────────────────────── */
function ResultsView({
  poll,
  options,
  rankings,
}: {
  poll: { id: string; title: string; status: string; created_at: number };
  options: PollOption[];
  rankings: Ranking[];
}) {
  const standings = computeStandings(options, rankings);
  const totalVotes = rankings.length;
  const winner = standings[0];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={styles.pollHeader}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={styles.pollStatus}>
            <span style={styles.statusBadgeClosed}>✓ CLOSED</span>
            <span style={styles.voteCount}>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</span>
          </div>
          <h1 style={styles.pollTitle}>{poll.title}</h1>
        </div>
      </div>

      {/* Winner banner */}
      {winner && totalVotes > 0 && (
        <div style={styles.winnerBanner}>
          <span style={styles.winnerEmoji} aria-hidden>🏆</span>
          <div>
            <div style={styles.winnerLabel}>Winner</div>
            <div style={styles.winnerName}>{winner.label}</div>
          </div>
          <div style={styles.winnerStats}>
            <span>avg rank {winner.avgRank.toFixed(1)}</span>
            {winner.firstPlaceVotes > 0 && <span>{winner.firstPlaceVotes}× 1st place</span>}
          </div>
        </div>
      )}

      {/* Full standings */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {totalVotes === 0 ? (
          <div style={styles.emptyMsg}>No rankings were submitted before the poll closed.</div>
        ) : (
          <>
            <p style={styles.rankHint}>Final standings — sorted by average rank, lower is better.</p>
            {standings.map((s, rank) => {
              const isWinner = rank === 0;
              const maxAvg = standings.length;
              const barPct = Math.round(Math.max(0, (maxAvg - s.avgRank + 0.5) / maxAvg) * 100);
              return (
                <div key={s.id} style={isWinner ? { ...styles.resultRow, ...styles.resultRowWinner } : styles.resultRow}>
                  <span style={isWinner ? styles.resultRankWinner : styles.resultRank}>{rank + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={isWinner ? styles.resultLabelWinner : styles.resultLabel}>{s.label}</span>
                      {s.firstPlaceVotes > 0 && <span style={styles.firstBadge}>{s.firstPlaceVotes}×1st</span>}
                    </div>
                    <div style={styles.barTrack}>
                      <div style={{ ...styles.barFill, width: `${barPct}%`, background: isWinner ? 'var(--color-primary)' : 'rgba(79,70,229,0.4)' }} />
                    </div>
                  </div>
                  <span style={styles.avgLabel}>
                    {s.voteCount > 0 ? `avg ${s.avgRank.toFixed(1)}` : '—'}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/* ── ChatPage (VotingPage) ──────────────────────────────────────────────────── */
export default function ChatPage() {
  const { mero } = useMero();
  const lobby = useChatLobby();
  const poll = usePoll(lobby.lobbyContextId, lobby.executorPublicKey);

  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Auto-join the voting context when it becomes available (new member joining
  // via invitation needs to join the context before they can read poll state).
  useEffect(() => {
    if (!mero || !lobby.lobbyContextId) return;
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5_000));
    void Promise.race([
      mero.admin.joinContext(lobby.lobbyContextId).then(() => {}).catch(() => {}),
      timeout,
    ]);
  }, [mero, lobby.lobbyContextId]);

  // Poll namespace membership (no SSE channel for joins).
  useEffect(() => {
    if (!lobby.namespaceId) return;
    const id = setInterval(() => { void lobby.refetchMembers(); }, 5_000);
    return () => clearInterval(id);
  }, [lobby.namespaceId, lobby.refetchMembers]);

  // React to lobby context events (name changes, new members in the context).
  useSubscription(
    lobby.lobbyContextId ? [lobby.lobbyContextId] : [],
    () => { void lobby.refetchMembers(); },
  );

  // Empty state — no workspaces at all.
  if (lobby.lobbies.length === 0 && !lobby.lobbiesLoading) {
    return (
      <>
        <WorkspacesEmptyState
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          onJoin={() => setShowJoin(true)}
        />
        {showCreateWorkspace && (
          <CreateWorkspaceModal
            onCreate={async (name) => { await lobby.createLobby(name); }}
            onClose={() => setShowCreateWorkspace(false)}
          />
        )}
        {showJoin && (
          <JoinModal
            onJoin={async (json) => { await lobby.joinLobby(json); setShowJoin(false); }}
            onClose={() => setShowJoin(false)}
          />
        )}
      </>
    );
  }

  // Determine which view to show.
  const view = poll.poll === null
    ? 'setup'
    : poll.poll.status === 'closed'
      ? 'results'
      : 'voting';

  return (
    <div style={{ background: 'var(--c-paper)', color: 'var(--c-ink)' }}>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar
          workspaces={lobby.lobbies}
          selectedNamespaceId={lobby.namespaceId}
          onSelectWorkspace={lobby.selectLobby}
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          workspaceAlias={lobby.selectedLobby?.alias}
          members={lobby.members}
          selfIdentity={lobby.selfIdentity}
          onInvite={() => setShowInvite(true)}
          viewerIsAdmin={lobby.isAdmin}
          onSetMemberRole={lobby.setMemberRole}
          onRemoveMember={lobby.removeMember}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--c-paper2)', minWidth: 0, overflow: 'hidden' }}>
          {view === 'setup' && (
            <PollSetupView
              onCreate={poll.createPoll}
              isLoading={poll.loading}
            />
          )}
          {view === 'voting' && poll.poll && (
            <PollOpenView
              poll={poll.poll}
              options={poll.options}
              rankings={poll.rankings}
              executorKey={poll.executorKey}
              isAdmin={lobby.isAdmin}
              onAddOption={poll.addOption}
              onRemoveOption={poll.removeOption}
              onSubmitRanking={poll.submitRanking}
              onClosePoll={poll.closePoll}
            />
          )}
          {view === 'results' && poll.poll && (
            <ResultsView
              poll={poll.poll}
              options={poll.options}
              rankings={poll.rankings}
            />
          )}
        </div>
      </div>

      {showInvite && (
        <InviteModal
          onInvite={lobby.inviteUser}
          onClose={() => setShowInvite(false)}
        />
      )}
      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={async (name) => { await lobby.createLobby(name); }}
          onClose={() => setShowCreateWorkspace(false)}
        />
      )}
      {showJoin && (
        <JoinModal
          onJoin={async (json) => { await lobby.joinLobby(json); setShowJoin(false); }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </div>
  );
}

/* ── inline styles (avoids styled-components churn; uses theme CSS vars) ──── */
const styles: Record<string, React.CSSProperties> = {
  centered: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    maxWidth: 480,
    width: '100%',
    background: 'var(--c-paper)',
    border: '1px solid var(--c-line)',
    borderRadius: 16,
    padding: '32px 28px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    boxShadow: '0 8px 32px -16px rgba(0,0,0,0.18)',
  },
  cardIcon: { fontSize: 40 },
  cardTitle: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '-0.5px',
    color: 'var(--c-ink)',
    margin: 0,
    textAlign: 'center',
  },
  cardDesc: {
    fontSize: 14,
    color: 'var(--c-muted)',
    textAlign: 'center',
    margin: 0,
    lineHeight: 1.55,
    maxWidth: 360,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    fontSize: 14,
    borderRadius: 10,
    border: '1px solid var(--c-line)',
    background: 'var(--c-paper)',
    color: 'var(--c-ink)',
    outline: 'none',
    boxSizing: 'border-box',
  },
  inputSm: {
    width: '100%',
    padding: '8px 12px',
    fontSize: 13,
    borderRadius: 9,
    border: '1px solid var(--c-line)',
    background: 'var(--c-paper)',
    color: 'var(--c-ink)',
    outline: 'none',
    boxSizing: 'border-box',
  },
  primaryBtn: {
    width: '100%',
    padding: '11px 16px',
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 10,
    border: 'none',
    background: 'var(--color-primary)',
    color: '#fff',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  secondaryBtn: {
    width: '100%',
    padding: '9px 12px',
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 9,
    border: '1px solid var(--c-line)',
    background: 'var(--c-paper)',
    color: 'var(--c-ink)',
    cursor: 'pointer',
    marginTop: 8,
    transition: 'background 0.14s',
  },
  dangerBtn: {
    padding: '9px 18px',
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 10,
    border: '1px solid rgba(210,59,47,0.4)',
    background: 'rgba(210,59,47,0.06)',
    color: '#d23b2f',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.14s',
  },
  pollHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
    padding: '20px 24px 16px',
    borderBottom: '1px solid var(--c-line)',
    background: 'var(--c-paper)',
    flexShrink: 0,
  },
  pollStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  statusBadgeOpen: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: '#16a34a',
    background: 'rgba(22,163,74,0.1)',
    border: '1px solid rgba(22,163,74,0.3)',
    borderRadius: 999,
    padding: '2px 8px',
  },
  statusBadgeClosed: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: 'var(--color-primary)',
    background: 'rgba(79,70,229,0.1)',
    border: '1px solid rgba(79,70,229,0.3)',
    borderRadius: 999,
    padding: '2px 8px',
  },
  voteCount: {
    fontSize: 12,
    color: 'var(--c-muted)',
    fontWeight: 500,
  },
  pollTitle: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '-0.5px',
    color: 'var(--c-ink)',
    margin: 0,
    lineHeight: 1.15,
  },
  optionsPanel: {
    width: 320,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--c-line)',
    background: 'var(--c-paper)',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px 8px',
    borderBottom: '1px solid var(--c-line)',
    flexShrink: 0,
  },
  panelLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: 'var(--c-muted)',
  },
  panelMeta: {
    fontSize: 11,
    color: 'var(--c-muted)',
  },
  optionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    borderBottom: '1px solid var(--c-line)',
  },
  optionLabel: {
    fontSize: 13,
    color: 'var(--c-ink)',
    fontWeight: 500,
    wordBreak: 'break-word' as const,
  },
  mineBadge: {
    marginLeft: 6,
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--color-primary)',
    background: 'rgba(79,70,229,0.1)',
    borderRadius: 999,
    padding: '1px 6px',
  },
  removeBtn: {
    flexShrink: 0,
    width: 22,
    height: 22,
    display: 'grid',
    placeItems: 'center',
    fontSize: 11,
    fontWeight: 700,
    color: '#d23b2f',
    background: 'rgba(210,59,47,0.08)',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  addOptionForm: {
    padding: '12px 16px',
    borderTop: '1px solid var(--c-line)',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  rightPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--c-paper2)',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--c-line)',
    background: 'var(--c-paper)',
    flexShrink: 0,
  },
  tab: {
    padding: '11px 20px',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--c-muted)',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    transition: 'color 0.14s',
  },
  tabActive: {
    padding: '11px 20px',
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--color-primary)',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid var(--color-primary)',
    cursor: 'pointer',
  },
  rankHint: {
    fontSize: 12,
    color: 'var(--c-muted)',
    margin: '0 0 10px',
    lineHeight: 1.5,
  },
  rankRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    marginBottom: 6,
    borderRadius: 10,
    border: '1px solid var(--c-line)',
    background: 'var(--c-paper)',
    cursor: 'grab',
    userSelect: 'none' as const,
    transition: 'box-shadow 0.14s',
  },
  rankNum: {
    flexShrink: 0,
    width: 22,
    height: 22,
    display: 'grid',
    placeItems: 'center',
    fontSize: 11,
    fontWeight: 800,
    color: '#fff',
    background: 'var(--color-primary)',
    borderRadius: '50%',
  },
  rankLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--c-ink)',
  },
  dragHandle: {
    fontSize: 16,
    color: 'var(--c-muted)',
    flexShrink: 0,
    letterSpacing: -1,
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    marginBottom: 8,
    borderRadius: 10,
    border: '1px solid var(--c-line)',
    background: 'var(--c-paper)',
  },
  resultRowWinner: {
    border: '1.5px solid var(--color-primary)',
    background: 'rgba(79,70,229,0.06)',
  },
  resultRank: {
    flexShrink: 0,
    width: 26,
    height: 26,
    display: 'grid',
    placeItems: 'center',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--c-muted)',
    background: 'var(--c-paper2)',
    borderRadius: '50%',
    border: '1px solid var(--c-line)',
  },
  resultRankWinner: {
    flexShrink: 0,
    width: 26,
    height: 26,
    display: 'grid',
    placeItems: 'center',
    fontSize: 12,
    fontWeight: 800,
    color: '#fff',
    background: 'var(--color-primary)',
    borderRadius: '50%',
    border: 'none',
  },
  resultLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--c-ink)',
  },
  resultLabelWinner: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--color-primary)',
  },
  firstBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    background: 'var(--color-accent)',
    borderRadius: 999,
    padding: '1px 6px',
  },
  barTrack: {
    height: 5,
    background: 'var(--c-line)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    transition: 'width 0.45s cubic-bezier(0.22,1,0.36,1)',
  },
  avgLabel: {
    flexShrink: 0,
    fontSize: 11,
    color: 'var(--c-muted)',
    fontWeight: 500,
    fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
  },
  emptyMsg: {
    padding: '24px 16px',
    fontSize: 13,
    color: 'var(--c-muted)',
    textAlign: 'center' as const,
    lineHeight: 1.6,
  },
  winnerBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    margin: '16px 24px 0',
    padding: '16px 20px',
    borderRadius: 14,
    border: '1.5px solid var(--color-primary)',
    background: 'rgba(79,70,229,0.07)',
    flexShrink: 0,
  },
  winnerEmoji: { fontSize: 32, flexShrink: 0 },
  winnerLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: 'var(--color-primary)',
  },
  winnerName: {
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: '-0.4px',
    color: 'var(--c-ink)',
    marginTop: 2,
  },
  winnerStats: {
    marginLeft: 'auto',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 3,
    fontSize: 12,
    color: 'var(--c-muted)',
    textAlign: 'right' as const,
    flexShrink: 0,
  },
};
