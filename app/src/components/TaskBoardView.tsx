import React, { useState } from 'react';
import type { Submission, TriageResult } from '../api/tracker/TrackerClient';

interface TaskBoardViewProps {
  /** Approved triage results, pre-sorted by priority (impact − effort desc). */
  approvedTasks: TriageResult[];
  /** All submissions — used to resolve titles for approved tasks. */
  submissions: Submission[];
  onSubmitRequest: (title: string, description: string, type_: string) => Promise<void>;
}

export default function TaskBoardView({
  approvedTasks,
  submissions,
  onSubmitRequest,
}: TaskBoardViewProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type_, setType] = useState<'bug' | 'feature'>('bug');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Build lookup: submission_id → Submission
  const subMap = new Map<string, Submission>(submissions.map((s) => [s.id, s]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    const d = description.trim();
    if (!t || !d) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmitRequest(t, d, type_);
      setTitle('');
      setDescription('');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Submit new request form */}
      <div style={{
        padding: '1.25rem',
        borderBottom: '1px solid #1e293b',
        background: '#0f172a',
      }}>
        <h3 style={{ fontSize: '0.82rem', color: '#64748b', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
          SUBMIT NEW REQUEST
        </h3>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input
              type="text"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
              style={inputStyle}
            />
            <select
              value={type_}
              onChange={(e) => setType(e.target.value as 'bug' | 'feature')}
              style={{ ...inputStyle, width: 120, flexShrink: 0 }}
            >
              <option value="bug">🐛 Bug</option>
              <option value="feature">✨ Feature</option>
            </select>
          </div>
          <textarea
            placeholder="Describe the bug or feature request…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            required
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', marginBottom: '0.5rem' }}
          />
          {submitError && (
            <div style={{ color: '#fca5a5', fontSize: '0.75rem', marginBottom: '0.4rem' }}>
              {submitError}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || !title.trim() || !description.trim()}
            style={{
              padding: '0.4rem 1.25rem',
              background: 'var(--color-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: submitting ? 'default' : 'pointer',
              fontSize: '0.85rem',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </form>
      </div>

      {/* Approved task board */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
        <h3 style={{ fontSize: '0.82rem', color: '#64748b', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
          APPROVED TASKS — ranked by priority
        </h3>

        {approvedTasks.length === 0 && (
          <div style={{ color: '#475569', fontSize: '0.85rem', padding: '1rem 0' }}>
            No approved tasks yet. The project owner reviews submissions in the Submissions tab.
          </div>
        )}

        {approvedTasks.map((task, index) => {
          const sub = subMap.get(task.submission_id);
          const priority = task.impact - task.effort;

          return (
            <div
              key={task.id}
              data-testid={`task-${task.id}`}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 8,
                padding: '0.85rem 1rem',
                marginBottom: '0.6rem',
                display: 'flex',
                gap: '1rem',
                alignItems: 'flex-start',
              }}
            >
              {/* Rank badge */}
              <div style={{
                flexShrink: 0,
                width: 28, height: 28, borderRadius: '50%',
                background: index === 0 ? 'rgba(16,185,129,0.2)' : 'rgba(100,116,139,0.15)',
                color: index === 0 ? '#6ee7b7' : '#64748b',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 700,
              }}>
                #{index + 1}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.92rem', marginBottom: '0.15rem' }}>
                  {sub?.title ?? task.submission_id}
                </div>
                {sub?.description && (
                  <div style={{ color: '#64748b', fontSize: '0.78rem', marginBottom: '0.4rem' }}>
                    {sub.description}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem' }}>
                  <span style={{ color: '#94a3b8' }}>
                    {sub?.submission_type === 'bug' ? '🐛 Bug' : '✨ Feature'}
                  </span>
                  <span title="Impact score (1–10)">
                    Impact&nbsp;
                    <strong style={{ color: '#6ee7b7' }}>{task.impact}</strong>
                  </span>
                  <span title="Effort score (1–10)">
                    Effort&nbsp;
                    <strong style={{ color: '#fca5a5' }}>{task.effort}</strong>
                  </span>
                  <span title="Priority = Impact − Effort (higher is better)">
                    Priority&nbsp;
                    <strong style={{ color: priority >= 0 ? '#93c5fd' : '#f87171' }}>
                      {priority >= 0 ? '+' : ''}{priority}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.4rem 0.6rem',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 6,
  color: '#e2e8f0',
  fontSize: '0.85rem',
};
