import React, { useEffect, useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import type { ClubSettings } from '../api/club/ClubClient';

interface ClubSettingsViewProps {
  settings: ClubSettings | null;
  members: GroupMember[];
  selfIdentity: string | null;
  memberNames: Record<string, string>;
  isCreator: boolean;
  onSetWeeklyGoal: (goal: number) => Promise<void>;
  onInvite: () => void;
}

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export default function ClubSettingsView({
  settings,
  members,
  selfIdentity,
  memberNames,
  isCreator,
  onSetWeeklyGoal,
  onInvite,
}: ClubSettingsViewProps) {
  const persistedGoal = settings?.weekly_goal ?? 0;
  const [goalStr, setGoalStr] = useState(String(persistedGoal));
  const [goalBusy, setGoalBusy] = useState(false);
  const [goalErr, setGoalErr] = useState<string | null>(null);

  // Sync input when server value changes (e.g. another node updates it)
  useEffect(() => {
    setGoalStr(String(persistedGoal));
  }, [persistedGoal]);

  const handleSaveGoal = async () => {
    const goal = parseInt(goalStr, 10);
    if (!goal || goal < 1) { setGoalErr('Enter a valid goal (≥ 1)'); return; }
    if (goal === persistedGoal) return;
    setGoalBusy(true);
    setGoalErr(null);
    try {
      await onSetWeeklyGoal(goal);
    } catch (e) {
      setGoalErr(e instanceof Error ? e.message : 'Failed to update goal');
    } finally {
      setGoalBusy(false);
    }
  };

  const allMembers = selfIdentity
    ? [{ identity: selfIdentity, name: memberNames[selfIdentity] || '', role: 'Self' }, ...members]
    : members;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid #1e293b' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', color: '#f1f5f9', fontWeight: 700 }}>
          Club Settings
        </h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>

        {/* Club info */}
        {settings && (
          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>Club</h3>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={statBoxStyle}>
                <span style={statLabelStyle}>Name</span>
                <span style={statValueStyle}>{settings.name || '—'}</span>
              </div>
              <div style={statBoxStyle}>
                <span style={statLabelStyle}>Created</span>
                <span style={statValueStyle}>{new Date(settings.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </section>
        )}

        {/* Weekly goal (creator can edit) */}
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Weekly Goal</h3>
          {isCreator ? (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="number"
                min={1}
                max={99}
                value={goalStr}
                onChange={(e) => setGoalStr(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveGoal()}
                style={{
                  width: 80, padding: '0.4rem 0.6rem',
                  background: '#1e293b', border: '1px solid #334155',
                  borderRadius: 6, color: '#e2e8f0', fontSize: '0.9rem',
                }}
              />
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>sessions / week</span>
              <button
                onClick={handleSaveGoal}
                disabled={goalBusy}
                style={{
                  padding: '0.4rem 0.9rem',
                  background: 'var(--color-primary, #E11D48)', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: goalBusy ? 'default' : 'pointer',
                  fontSize: '0.82rem', fontWeight: 600, opacity: goalBusy ? 0.7 : 1,
                }}
              >
                {goalBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : (
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
              {persistedGoal > 0 ? `${persistedGoal} sessions / week` : '—'}
              <span style={{ fontSize: '0.75rem', color: '#475569', marginLeft: '0.5rem' }}>
                (only the creator can change this)
              </span>
            </p>
          )}
          {goalErr && <p style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '0.25rem' }}>{goalErr}</p>}
        </section>

        {/* Members */}
        <section style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>
              Members ({allMembers.length})
            </h3>
            <button
              onClick={onInvite}
              style={{
                padding: '0.3rem 0.8rem',
                background: 'transparent', color: 'var(--color-accent, #F59E0B)',
                border: '1px solid var(--color-accent, #F59E0B)', borderRadius: 6,
                cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
              }}
            >
              + Invite
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {allMembers.map((m) => {
              const isSelf = m.identity === selfIdentity;
              const label = memberNames[m.identity] || m.name || shortenId(m.identity);
              return (
                <div
                  key={m.identity}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.4rem 0.6rem', borderRadius: 6,
                    background: isSelf ? 'rgba(225,29,72,0.06)' : 'transparent',
                  }}
                >
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: 'var(--color-accent, #F59E0B)', flexShrink: 0,
                  }} />
                  <span style={{ color: isSelf ? '#e2e8f0' : '#94a3b8', fontSize: '0.85rem' }}>
                    {label}
                    {isSelf && <span style={{ color: '#475569', fontSize: '0.72rem', marginLeft: '0.35rem' }}>(you)</span>}
                  </span>
                  {m.role && m.role !== 'Self' && (
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#475569' }}>{m.role}</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  marginBottom: '1.5rem',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 700, color: '#64748b',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  marginBottom: '0.65rem',
};

const statBoxStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.2rem',
  padding: '0.6rem 0.9rem', background: '#0f172a',
  border: '1px solid #1e293b', borderRadius: 8,
};

const statLabelStyle: React.CSSProperties = {
  fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em',
};

const statValueStyle: React.CSSProperties = {
  fontSize: '0.95rem', color: '#e2e8f0', fontWeight: 600,
};
