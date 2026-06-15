import React, { useState } from 'react';
import type { Workout, ClubSettings } from '../api/club/ClubClient';
import LogWorkoutModal from './LogWorkoutModal';

interface ActivityFeedProps {
  workouts: Workout[];
  settings: ClubSettings | null;
  loading: boolean;
  error: Error | null;
  selfExecutorKey: string | null;

  onLogWorkout: (activity: string, durationMinutes: number, note: string) => Promise<void>;
  onEditWorkout: (id: string, activity: string, durationMinutes: number, note: string) => Promise<void>;
  onDeleteWorkout: (id: string) => Promise<void>;
  onAddCheer: (workoutId: string) => Promise<void>;

  memberNames: Record<string, string>;
}

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getThisWeekCount(workouts: Workout[]): number {
  const now = Date.now();
  // Start of the current week (Monday)
  const dayOfWeek = new Date(now).getDay(); // 0=Sun
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const weekStart = now - daysSinceMonday * 86_400_000;
  return workouts.filter((w) => w.created_at >= weekStart).length;
}

export default function ActivityFeed({
  workouts,
  settings,
  loading,
  error,
  selfExecutorKey,
  onLogWorkout,
  onEditWorkout,
  onDeleteWorkout,
  onAddCheer,
  memberNames,
}: ActivityFeedProps) {
  const [showLog, setShowLog] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const [cheerBusy, setCheerBusy] = useState<Record<string, boolean>>({});
  const [deleteBusy, setDeleteBusy] = useState<Record<string, boolean>>({});

  const weekCount = getThisWeekCount(workouts);
  const weekGoal = settings?.weekly_goal ?? 0;
  const progressPct = weekGoal > 0 ? Math.min(100, Math.round((weekCount / weekGoal) * 100)) : 0;

  const handleCheer = async (workoutId: string) => {
    if (cheerBusy[workoutId]) return;
    setCheerBusy((p) => ({ ...p, [workoutId]: true }));
    try { await onAddCheer(workoutId); } finally {
      setCheerBusy((p) => ({ ...p, [workoutId]: false }));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this workout?')) return;
    setDeleteBusy((p) => ({ ...p, [id]: true }));
    try { await onDeleteWorkout(id); } finally {
      setDeleteBusy((p) => ({ ...p, [id]: false }));
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0.9rem 1.25rem',
        borderBottom: '1px solid #1e293b',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.05rem', color: '#f1f5f9', fontWeight: 700 }}>
            Activity Feed
          </h2>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            {workouts.length} workout{workouts.length !== 1 ? 's' : ''} logged
          </span>
        </div>
        <button
          onClick={() => setShowLog(true)}
          style={{
            padding: '0.45rem 1rem',
            background: 'var(--color-primary, #E11D48)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 700,
          }}
        >
          + Log Workout
        </button>
      </div>

      {/* Weekly goal progress */}
      {settings && (
        <div style={{
          padding: '0.75rem 1.25rem',
          borderBottom: '1px solid #1e293b',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Weekly Goal
            </span>
            <span style={{ fontSize: '0.78rem', color: progressPct >= 100 ? '#4ade80' : '#f59e0b', fontWeight: 700 }}>
              {weekCount} / {weekGoal} session{weekGoal !== 1 ? 's' : ''}
              {progressPct >= 100 ? ' 🎉' : ''}
            </span>
          </div>
          <div style={{
            height: 7, borderRadius: 999,
            background: '#1e293b', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${progressPct}%`,
              borderRadius: 999,
              background: progressPct >= 100
                ? 'linear-gradient(90deg, #4ade80, #22d3ee)'
                : 'linear-gradient(90deg, var(--color-primary, #E11D48), var(--color-accent, #F59E0B))',
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}

      {/* Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {loading && workouts.length === 0 && (
          <div style={{ color: '#475569', textAlign: 'center', padding: '3rem', fontSize: '0.9rem' }}>
            Loading workouts…
          </div>
        )}
        {!loading && workouts.length === 0 && (
          <div style={{ color: '#475569', textAlign: 'center', padding: '3rem', fontSize: '0.9rem' }}>
            No workouts yet — be the first to log one! 💪
          </div>
        )}
        {error && (
          <div style={{ color: '#f87171', fontSize: '0.8rem', padding: '0.5rem' }}>
            Error loading workouts: {error.message}
          </div>
        )}

        {workouts.map((w) => {
          const isSelf = w.author === selfExecutorKey;
          const authorLabel = memberNames[w.author] || shortenId(w.author);
          return (
            <div
              key={w.id}
              data-testid={`workout-card-${w.id}`}
              style={{
                background: '#0f172a',
                border: `1px solid ${isSelf ? 'color-mix(in srgb, var(--color-primary, #E11D48) 35%, #1e293b)' : '#1e293b'}`,
                borderRadius: 10,
                padding: '0.85rem 1rem',
              }}
            >
              {/* Top row: author + time */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: isSelf ? 'var(--color-primary, #E11D48)' : '#e2e8f0' }}>
                  {isSelf ? 'You' : authorLabel}
                </span>
                <span style={{ fontSize: '0.72rem', color: '#475569' }}>{formatRelativeTime(w.created_at)}</span>
              </div>

              {/* Activity + duration */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '0.2rem 0.55rem',
                  background: 'rgba(245,158,11,0.12)',
                  color: 'var(--color-accent, #F59E0B)',
                  borderRadius: 5,
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}>
                  {w.activity}
                </span>
                <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                  {formatDuration(w.duration_minutes)}
                </span>
              </div>

              {/* Note */}
              {w.note && (
                <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5 }}>
                  {w.note}
                </p>
              )}

              {/* Actions row */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.4rem' }}>
                {/* Cheer button */}
                <button
                  onClick={() => handleCheer(w.id)}
                  disabled={cheerBusy[w.id]}
                  title="Cheer this workout!"
                  data-testid={`cheer-btn-${w.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    padding: '0.25rem 0.65rem',
                    background: 'transparent',
                    border: '1px solid #334155',
                    borderRadius: 5,
                    cursor: cheerBusy[w.id] ? 'default' : 'pointer',
                    color: '#f59e0b',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    opacity: cheerBusy[w.id] ? 0.6 : 1,
                  }}
                >
                  👏 {w.cheer_count > 0 ? w.cheer_count : ''}
                </button>

                {/* Edit + Delete (own workouts only) */}
                {isSelf && (
                  <>
                    <button
                      onClick={() => setEditingWorkout(w)}
                      title="Edit workout"
                      data-testid={`edit-btn-${w.id}`}
                      style={ghostBtnStyle}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(w.id)}
                      disabled={deleteBusy[w.id]}
                      title="Delete workout"
                      data-testid={`delete-btn-${w.id}`}
                      style={{ ...ghostBtnStyle, color: '#f87171', borderColor: '#7f1d1d' }}
                    >
                      {deleteBusy[w.id] ? '…' : 'Delete'}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Log workout modal */}
      {showLog && (
        <LogWorkoutModal
          onSubmit={onLogWorkout}
          onClose={() => setShowLog(false)}
        />
      )}

      {/* Edit workout modal */}
      {editingWorkout && (
        <LogWorkoutModal
          existing={editingWorkout}
          onSubmit={async (activity, mins, note) => {
            await onEditWorkout(editingWorkout.id, activity, mins, note);
          }}
          onClose={() => setEditingWorkout(null)}
        />
      )}
    </div>
  );
}

const ghostBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0.65rem',
  background: 'transparent',
  border: '1px solid #334155',
  borderRadius: 5,
  cursor: 'pointer',
  color: '#64748b',
  fontSize: '0.78rem',
};
