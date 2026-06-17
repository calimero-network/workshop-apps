import React, { useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

interface TripSettingsViewProps {
  tripAlias: string | undefined;
  tripStatus: string | null;
  members: GroupMember[];
  selfIdentity: string | null;
  onlineMembers: Set<string>;
  memberNames: Record<string, string>;
  onFinishTrip: () => Promise<void>;
  onInvite: () => void;
}

export default function TripSettingsView({
  tripAlias,
  tripStatus,
  members,
  selfIdentity,
  onlineMembers,
  memberNames,
  onFinishTrip,
  onInvite,
}: TripSettingsViewProps) {
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const isFinished = tripStatus === 'finished';

  const allMembers: Array<{ identity: string; alias?: string; isSelf: boolean }> = selfIdentity
    ? [
        { identity: selfIdentity, isSelf: true },
        ...members.map((m) => ({ identity: m.identity, alias: m.alias, isSelf: false })),
      ]
    : members.map((m) => ({ identity: m.identity, alias: m.alias, isSelf: false }));

  const memberLabel = (id: string, alias?: string) => memberNames[id] || alias || shortenId(id);

  const handleFinish = async () => {
    if (!confirmFinish) { setConfirmFinish(true); return; }
    setFinishing(true);
    setFinishError(null);
    try {
      await onFinishTrip();
      setConfirmFinish(false);
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : String(err));
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', maxWidth: 560 }}>
      {/* Trip info */}
      <section style={{ marginBottom: '1.5rem' }}>
        <SectionTitle>Trip</SectionTitle>
        <div style={{
          padding: '0.9rem 1rem',
          background: '#0f172a',
          borderRadius: 8,
          border: '1px solid #1e293b',
        }}>
          <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '1.05rem', marginBottom: 4 }}>
            {tripAlias || 'Unnamed trip'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
            <span style={{
              display: 'inline-block',
              padding: '0.15rem 0.5rem',
              borderRadius: 4,
              background: isFinished ? 'rgba(78,205,196,0.15)' : 'rgba(255,107,107,0.15)',
              color: isFinished ? 'var(--color-accent)' : 'var(--color-primary)',
              border: `1px solid ${isFinished ? 'rgba(78,205,196,0.4)' : 'rgba(255,107,107,0.4)'}`,
              fontWeight: 600,
            }}>
              {isFinished ? '🏁 Finished' : '✈️ Active'}
            </span>
          </div>
        </div>
      </section>

      {/* Members */}
      <section style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <SectionTitle>Members ({allMembers.length})</SectionTitle>
          {!isFinished && (
            <button
              onClick={onInvite}
              style={{
                padding: '0.3rem 0.7rem',
                background: 'rgba(78,205,196,0.1)',
                color: 'var(--color-accent)',
                border: '1px solid rgba(78,205,196,0.3)',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '0.78rem',
              }}
            >
              + Invite
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {allMembers.map((m) => (
            <div key={m.identity} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.55rem 0.75rem',
              background: '#0f172a',
              borderRadius: 8,
              border: '1px solid #1e293b',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: onlineMembers.has(m.identity) ? 'var(--color-accent)' : '#475569',
              }} />
              <span style={{ flex: 1, color: '#e2e8f0', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {memberLabel(m.identity, m.alias)}
                {m.isSelf && <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: 6 }}>(you)</span>}
              </span>
              <span style={{ fontSize: '0.7rem', color: '#475569', fontFamily: 'monospace' }}>
                {shortenId(m.identity)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Finish trip */}
      {!isFinished && (
        <section>
          <SectionTitle>Organizer Actions</SectionTitle>
          <div style={{
            padding: '1rem',
            background: '#0f172a',
            borderRadius: 8,
            border: '1px solid #1e293b',
          }}>
            <p style={{ color: '#94a3b8', fontSize: '0.84rem', marginBottom: '0.75rem', lineHeight: 1.6 }}>
              Finishing the trip locks the ledger and photo feed. No new expenses,
              locations, or photos can be added after this.
            </p>
            {confirmFinish && (
              <p style={{ color: 'var(--color-primary)', fontSize: '0.82rem', marginBottom: '0.5rem', fontWeight: 600 }}>
                Are you sure? This action cannot be undone.
              </p>
            )}
            {finishError && (
              <p style={{ color: '#f08080', fontSize: '0.78rem', marginBottom: '0.5rem' }}>{finishError}</p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleFinish}
                disabled={finishing}
                style={{
                  padding: '0.45rem 1rem',
                  background: confirmFinish ? '#7f1d1d' : '#1e293b',
                  color: confirmFinish ? '#fca5a5' : '#94a3b8',
                  border: `1px solid ${confirmFinish ? '#991b1b' : '#334155'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                }}
              >
                {finishing ? 'Finishing…' : confirmFinish ? '🏁 Confirm Finish Trip' : 'Finish Trip'}
              </button>
              {confirmFinish && (
                <button
                  onClick={() => setConfirmFinish(false)}
                  style={{
                    padding: '0.45rem 0.8rem',
                    background: 'transparent',
                    color: '#64748b',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {isFinished && (
        <section>
          <div style={{
            padding: '1rem',
            background: 'rgba(78,205,196,0.05)',
            borderRadius: 8,
            border: '1px solid rgba(78,205,196,0.2)',
            color: 'var(--color-accent)',
            fontSize: '0.84rem',
            lineHeight: 1.6,
          }}>
            🏁 This trip has been finished and archived. The ledger and photo feed are frozen.
          </div>
        </section>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '0.7rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      color: '#64748b',
      textTransform: 'uppercase',
      marginBottom: '0.5rem',
    }}>
      {children}
    </div>
  );
}
