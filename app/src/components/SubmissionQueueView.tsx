import React, { useState } from 'react';
import type { Submission, TriageResult } from '../api/tracker/TrackerClient';

interface SubmissionQueueViewProps {
  submissions: Submission[];
  triageResults: TriageResult[];
  /** Current user's executor public key — used for authorship checks. */
  selfIdentity: string | null;
  /** True when the current user is the project owner (namespace admin proxy). */
  isOwner: boolean;
  onTriage: (
    submissionId: string,
    status: string,
    impact: number,
    effort: number,
  ) => Promise<void>;
  onEdit: (submissionId: string, title: string, description: string) => Promise<void>;
  onWithdraw: (submissionId: string) => Promise<void>;
}

type StatusBadgeColor = { bg: string; text: string };

function statusColors(status: string): StatusBadgeColor {
  switch (status) {
    case 'approved':  return { bg: 'rgba(16,185,129,0.15)', text: '#6ee7b7' };
    case 'declined':  return { bg: 'rgba(239,68,68,0.15)', text: '#fca5a5' };
    default:          return { bg: 'rgba(99,102,241,0.15)', text: '#a5b4fc' };
  }
}

function typeBadge(type: string): string {
  return type === 'bug' ? '🐛 Bug' : '✨ Feature';
}

interface TriageFormState {
  status: 'approved' | 'declined';
  impact: number;
  effort: number;
}

interface EditFormState {
  title: string;
  description: string;
}

export default function SubmissionQueueView({
  submissions,
  triageResults,
  selfIdentity,
  isOwner,
  onTriage,
  onEdit,
  onWithdraw,
}: SubmissionQueueViewProps) {
  const [triageForms, setTriageForms] = useState<Record<string, TriageFormState>>({});
  const [editForms, setEditForms] = useState<Record<string, EditFormState>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Build a map: submission_id → TriageResult
  const triageMap = new Map<string, TriageResult>(
    triageResults.map((t) => [t.submission_id, t]),
  );

  const pending = submissions.filter((s) => s.status === 'pending');
  const triaged = submissions.filter((s) => s.status !== 'pending');

  const setTriageField = (id: string, field: keyof TriageFormState, value: string | number) => {
    setTriageForms((prev) => {
      const current: TriageFormState = prev[id] ?? { status: 'approved', impact: 5, effort: 5 };
      return { ...prev, [id]: { ...current, [field]: value } as TriageFormState };
    });
  };

  const handleTriage = async (sub: Submission) => {
    const form = triageForms[sub.id] ?? { status: 'approved', impact: 5, effort: 5 };
    setBusy((p) => ({ ...p, [sub.id]: true }));
    setErrors((p) => ({ ...p, [sub.id]: '' }));
    try {
      await onTriage(sub.id, form.status, form.impact, form.effort);
    } catch (err) {
      setErrors((p) => ({ ...p, [sub.id]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy((p) => ({ ...p, [sub.id]: false }));
    }
  };

  const handleWithdraw = async (sub: Submission) => {
    if (!confirm(`Withdraw "${sub.title}"?`)) return;
    setBusy((p) => ({ ...p, [sub.id]: true }));
    setErrors((p) => ({ ...p, [sub.id]: '' }));
    try {
      await onWithdraw(sub.id);
    } catch (err) {
      setErrors((p) => ({ ...p, [sub.id]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy((p) => ({ ...p, [sub.id]: false }));
    }
  };

  const startEdit = (sub: Submission) => {
    setEditForms((p) => ({ ...p, [sub.id]: { title: sub.title, description: sub.description } }));
  };

  const cancelEdit = (id: string) => {
    setEditForms((p) => { const n = { ...p }; delete n[id]; return n; });
  };

  const handleEdit = async (sub: Submission) => {
    const form = editForms[sub.id];
    if (!form) return;
    setBusy((p) => ({ ...p, [sub.id]: true }));
    setErrors((p) => ({ ...p, [sub.id]: '' }));
    try {
      await onEdit(sub.id, form.title.trim(), form.description.trim());
      cancelEdit(sub.id);
    } catch (err) {
      setErrors((p) => ({ ...p, [sub.id]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy((p) => ({ ...p, [sub.id]: false }));
    }
  };

  const renderSubmission = (sub: Submission) => {
    const isSelf = sub.author === selfIdentity;
    const isPending = sub.status === 'pending';
    const isEditing = !!editForms[sub.id];
    const isBusy = !!busy[sub.id];
    const form = triageForms[sub.id] ?? { status: 'approved', impact: 5, effort: 5 };
    const editForm = editForms[sub.id];
    const errMsg = errors[sub.id];
    const colors = statusColors(sub.status);
    const triage = triageMap.get(sub.id);

    return (
      <div
        key={sub.id}
        data-testid={`submission-${sub.id}`}
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: '1rem',
          marginBottom: '0.75rem',
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <div style={{ flex: 1 }}>
            {isEditing ? (
              <input
                value={editForm?.title ?? sub.title}
                onChange={(e) => setEditForms((p) => ({ ...p, [sub.id]: { ...p[sub.id], title: e.target.value } }))}
                style={{
                  width: '100%', background: '#0f172a', border: '1px solid #475569',
                  borderRadius: 4, color: '#e2e8f0', padding: '0.25rem 0.5rem',
                  fontSize: '0.9rem', fontWeight: 600,
                }}
              />
            ) : (
              <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.95rem' }}>{sub.title}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
            <span style={{
              fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: 4,
              background: colors.bg, color: colors.text,
            }}>
              {sub.status}
            </span>
            <span style={{
              fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: 4,
              background: 'rgba(100,116,139,0.2)', color: '#94a3b8',
            }}>
              {typeBadge(sub.submission_type)}
            </span>
          </div>
        </div>

        {/* Description */}
        {isEditing ? (
          <textarea
            value={editForm?.description ?? sub.description}
            onChange={(e) => setEditForms((p) => ({ ...p, [sub.id]: { ...p[sub.id], description: e.target.value } }))}
            rows={3}
            style={{
              width: '100%', background: '#0f172a', border: '1px solid #475569',
              borderRadius: 4, color: '#94a3b8', padding: '0.25rem 0.5rem',
              fontSize: '0.82rem', resize: 'vertical', fontFamily: 'inherit',
              marginBottom: '0.5rem',
            }}
          />
        ) : (
          <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: '0.2rem 0 0.5rem 0' }}>
            {sub.description}
          </p>
        )}

        {/* Meta */}
        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.5rem' }}>
          {sub.author.slice(0, 8)}… · {new Date(sub.created_at).toLocaleDateString()}
          {triage && (
            <span style={{ marginLeft: '0.75rem' }}>
              Impact <strong style={{ color: '#6ee7b7' }}>{triage.impact}</strong>&nbsp;/&nbsp;
              Effort <strong style={{ color: '#fca5a5' }}>{triage.effort}</strong>
            </span>
          )}
        </div>

        {/* Author actions (own pending submissions only) */}
        {isSelf && isPending && (
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: isOwner ? '0.75rem' : 0 }}>
            {isEditing ? (
              <>
                <button
                  onClick={() => handleEdit(sub)}
                  disabled={isBusy}
                  style={actionBtn('var(--color-primary)', '#fff')}
                >
                  {isBusy ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => cancelEdit(sub.id)}
                  disabled={isBusy}
                  style={actionBtn('#334155', '#94a3b8')}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => startEdit(sub)}
                  disabled={isBusy}
                  style={actionBtn('#334155', '#94a3b8')}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleWithdraw(sub)}
                  disabled={isBusy}
                  style={actionBtn('#3a1414', '#f0a8a8')}
                >
                  {isBusy ? 'Withdrawing…' : 'Withdraw'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Owner triage form (pending only) */}
        {isOwner && isPending && (
          <div style={{
            background: '#0f172a', borderRadius: 6, padding: '0.75rem',
            border: '1px solid #1e293b',
          }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.5rem' }}>
              Triage
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Status */}
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {(['approved', 'declined'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setTriageField(sub.id, 'status', s)}
                    style={{
                      padding: '0.2rem 0.6rem', borderRadius: 4, fontSize: '0.78rem',
                      border: 'none', cursor: 'pointer',
                      background: form.status === s
                        ? (s === 'approved' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)')
                        : '#1e293b',
                      color: form.status === s
                        ? (s === 'approved' ? '#6ee7b7' : '#fca5a5')
                        : '#64748b',
                    }}
                  >
                    {s === 'approved' ? '✓ Approve' : '✕ Decline'}
                  </button>
                ))}
              </div>

              {/* Impact */}
              <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                Impact
                <input
                  type="number"
                  min={1} max={10}
                  value={form.impact}
                  onChange={(e) => setTriageField(sub.id, 'impact', Number(e.target.value))}
                  style={scoreInput}
                />
              </label>

              {/* Effort */}
              <label style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                Effort
                <input
                  type="number"
                  min={1} max={10}
                  value={form.effort}
                  onChange={(e) => setTriageField(sub.id, 'effort', Number(e.target.value))}
                  style={scoreInput}
                />
              </label>

              <button
                onClick={() => handleTriage(sub)}
                disabled={isBusy}
                style={actionBtn('var(--color-primary)', '#fff')}
              >
                {isBusy ? 'Saving…' : 'Submit triage'}
              </button>
            </div>
          </div>
        )}

        {errMsg && (
          <div style={{ marginTop: '0.4rem', color: '#fca5a5', fontSize: '0.75rem' }}>
            {errMsg}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
      {/* Pending */}
      <section>
        <h3 style={{ fontSize: '0.82rem', color: '#64748b', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
          PENDING ({pending.length})
        </h3>
        {pending.length === 0 && (
          <div style={{ color: '#475569', fontSize: '0.85rem', padding: '1rem 0' }}>
            No pending submissions.
          </div>
        )}
        {pending.map(renderSubmission)}
      </section>

      {/* Triaged */}
      {triaged.length > 0 && (
        <section style={{ marginTop: '1.5rem' }}>
          <h3 style={{ fontSize: '0.82rem', color: '#64748b', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
            TRIAGED ({triaged.length})
          </h3>
          {triaged.map(renderSubmission)}
        </section>
      )}
    </div>
  );
}

const scoreInput: React.CSSProperties = {
  width: 48, padding: '0.15rem 0.3rem', textAlign: 'center',
  background: '#1e293b', border: '1px solid #334155', borderRadius: 4,
  color: '#e2e8f0', fontSize: '0.82rem',
};

function actionBtn(bg: string, color: string): React.CSSProperties {
  return {
    padding: '0.2rem 0.7rem', borderRadius: 4, fontSize: '0.78rem',
    border: 'none', cursor: 'pointer', background: bg, color,
  };
}
