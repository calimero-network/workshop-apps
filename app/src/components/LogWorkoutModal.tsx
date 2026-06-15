import React, { useState } from 'react';
import type { Workout } from '../api/club/ClubClient';

interface LogWorkoutModalProps {
  /** If provided, the modal is in edit mode. */
  existing?: Workout;
  onSubmit: (activity: string, durationMinutes: number, note: string) => Promise<void>;
  onClose: () => void;
}

export default function LogWorkoutModal({ existing, onSubmit, onClose }: LogWorkoutModalProps) {
  const [activity, setActivity] = useState(existing?.activity ?? '');
  const [durationStr, setDurationStr] = useState(String(existing?.duration_minutes ?? ''));
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isEdit = !!existing;

  const handleSubmit = async () => {
    const trimActivity = activity.trim();
    if (!trimActivity) { setErr('Activity is required'); return; }
    const mins = parseInt(durationStr, 10);
    if (!mins || mins < 1) { setErr('Enter a valid duration (minutes)'); return; }
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(trimActivity, mins, note.trim());
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save workout');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: '#1a1a1a', borderRadius: 12, padding: '1.5rem',
        width: 420, border: '1px solid #333',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: '0.25rem', color: '#f1f5f9' }}>
          {isEdit ? 'Edit Workout' : 'Log Workout'}
        </h3>
        <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '1rem' }}>
          {isEdit ? 'Update your workout entry.' : 'Record what you did today — your club will see it instantly.'}
        </p>

        <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
          Activity *
        </label>
        <input
          autoFocus
          type="text"
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
          placeholder="e.g. Running, Cycling, Yoga"
          style={inputStyle}
        />

        <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem', marginTop: '0.75rem' }}>
          Duration (minutes) *
        </label>
        <input
          type="number"
          min={1}
          value={durationStr}
          onChange={(e) => setDurationStr(e.target.value)}
          placeholder="e.g. 30"
          style={inputStyle}
        />

        <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem', marginTop: '0.75rem' }}>
          Note (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="How did it go?"
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />

        {err && (
          <p style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '0.5rem' }}>{err}</p>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button onClick={handleSubmit} disabled={busy} style={submitBtnStyle(busy)}>
            {busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Log It'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.75rem',
  background: '#222', border: '1px solid #444', borderRadius: 6,
  color: '#eee', fontSize: '0.9rem',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '0.4rem 1rem', background: '#333', color: '#ccc',
  border: '1px solid #444', borderRadius: 6, cursor: 'pointer',
};

const submitBtnStyle = (busy: boolean): React.CSSProperties => ({
  padding: '0.4rem 1.2rem', background: 'var(--color-primary, #E11D48)', color: '#fff',
  border: 'none', borderRadius: 6, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1,
  fontWeight: 600,
});
