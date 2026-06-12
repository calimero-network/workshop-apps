import React, { useState } from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import { CommunitySummary } from '../api/hub/HubClient';
import { Moderator } from '../api/community/CommunityClient';

interface CommunitySettingsViewProps {
  community: CommunitySummary;
  moderators: Moderator[];
  members: GroupMember[];
  selfIdentity: string | null;
  onRenameCommunity: (newName: string, newTopic: string) => Promise<void>;
  onAppointModerator: (memberId: string) => Promise<void>;
  onRevokeModerator: (moderatorId: string) => Promise<void>;
  onRefreshModerators: () => Promise<void>;
  onBack: () => void;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

export default function CommunitySettingsView({
  community,
  moderators,
  members,
  selfIdentity,
  onRenameCommunity,
  onAppointModerator,
  onRevokeModerator,
  onRefreshModerators,
  onBack,
}: CommunitySettingsViewProps) {
  const [newName, setNewName] = useState(community.name);
  const [newTopic, setNewTopic] = useState(community.topic);
  const [renaming, setRenaming] = useState(false);
  const [appointId, setAppointId] = useState('');
  const [appointing, setAppointing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isFounder = selfIdentity === community.created_by;

  const handleRename = async () => {
    if (!newName.trim() || !newTopic.trim() || renaming) return;
    setRenaming(true);
    setError(null);
    try {
      await onRenameCommunity(newName.trim(), newTopic.trim());
      setSuccess('Community renamed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRenaming(false);
    }
  };

  const handleAppoint = async () => {
    if (!appointId.trim() || appointing) return;
    setAppointing(true);
    setError(null);
    try {
      await onAppointModerator(appointId.trim());
      setAppointId('');
      await onRefreshModerators();
      setSuccess('Moderator appointed');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAppointing(false);
    }
  };

  const handleRevoke = async (modId: string) => {
    setError(null);
    try {
      await onRevokeModerator(modId);
      await onRefreshModerators();
      setSuccess('Moderator revoked');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Moderator member IDs to exclude from the "appoint" dropdown
  const modMemberIds = new Set(moderators.map((m) => m.member_id));
  const eligibleMembers = members.filter((m) => !modMemberIds.has(m.identity) && m.identity !== selfIdentity);

  if (!isFounder) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
        <div style={{ textAlign: 'center' }}>
          <p>Only the community founder can access settings.</p>
          <button onClick={onBack} style={{
            marginTop: '1rem', padding: '0.4rem 1rem', background: 'var(--color-primary)',
            color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
          }}>Back to Feed</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', color: '#64748b',
            cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginBottom: '1rem',
          }}
        >
          ← Back to Feed
        </button>

        <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '1.5rem' }}>
          Community Settings
        </h1>

        {error && (
          <div style={{ padding: '0.5rem 0.75rem', background: '#3a1414', color: '#f08080', borderRadius: 6, marginBottom: '1rem', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ padding: '0.5rem 0.75rem', background: '#143a14', color: '#80f080', borderRadius: 6, marginBottom: '1rem', fontSize: '0.85rem' }}>
            {success}
          </div>
        )}

        {/* Rename section */}
        <div style={{
          background: '#0f172a', borderRadius: 10, border: '1px solid #1e293b',
          padding: '1rem', marginBottom: '1.5rem',
        }}>
          <h3 style={{ fontSize: '0.95rem', color: '#e2e8f0', marginBottom: '0.75rem' }}>
            Rename Community
          </h3>
          <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>
            Name
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{
              width: '100%', padding: '0.5rem', background: '#1e293b',
              border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0',
              fontSize: '0.9rem', marginBottom: '0.5rem',
            }}
          />
          <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>
            Topic
          </label>
          <input
            type="text"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            style={{
              width: '100%', padding: '0.5rem', background: '#1e293b',
              border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0',
              fontSize: '0.9rem', marginBottom: '0.75rem',
            }}
          />
          <button
            onClick={handleRename}
            disabled={renaming || !newName.trim() || !newTopic.trim()}
            style={{
              padding: '0.4rem 1rem', background: 'var(--color-primary)', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            {renaming ? 'Renaming...' : 'Save Changes'}
          </button>
        </div>

        {/* Moderators section */}
        <div style={{
          background: '#0f172a', borderRadius: 10, border: '1px solid #1e293b',
          padding: '1rem',
        }}>
          <h3 style={{ fontSize: '0.95rem', color: '#e2e8f0', marginBottom: '0.75rem' }}>
            Moderators
          </h3>

          {moderators.length === 0 && (
            <p style={{ color: '#475569', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              No moderators appointed yet.
            </p>
          )}

          {moderators.map((mod) => (
            <div
              key={mod.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.5rem 0.6rem', background: '#131b2e', borderRadius: 6,
                marginBottom: '0.35rem',
              }}
            >
              <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                {shortenId(mod.member_id)}
              </span>
              <button
                onClick={() => handleRevoke(mod.id)}
                style={{
                  padding: '0.2rem 0.5rem', background: '#3a1414',
                  color: '#f08080', border: '1px solid #6a2828',
                  borderRadius: 4, fontSize: '0.75rem', cursor: 'pointer',
                }}
              >
                Revoke
              </button>
            </div>
          ))}

          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>
              Appoint a moderator
            </label>
            {eligibleMembers.length > 0 ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select
                  value={appointId}
                  onChange={(e) => setAppointId(e.target.value)}
                  style={{
                    flex: 1, padding: '0.4rem', background: '#1e293b',
                    border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="">Select member...</option>
                  {eligibleMembers.map((m) => (
                    <option key={m.identity} value={m.identity}>
                      {m.name || shortenId(m.identity)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAppoint}
                  disabled={!appointId.trim() || appointing}
                  style={{
                    padding: '0.4rem 0.75rem', background: 'var(--color-accent)', color: '#fff',
                    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem',
                  }}
                >
                  {appointing ? '...' : 'Appoint'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={appointId}
                  onChange={(e) => setAppointId(e.target.value)}
                  placeholder="Paste member public key"
                  style={{
                    flex: 1, padding: '0.4rem', background: '#1e293b',
                    border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0',
                    fontSize: '0.85rem', fontFamily: 'monospace',
                  }}
                />
                <button
                  onClick={handleAppoint}
                  disabled={!appointId.trim() || appointing}
                  style={{
                    padding: '0.4rem 0.75rem', background: 'var(--color-accent)', color: '#fff',
                    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem',
                  }}
                >
                  {appointing ? '...' : 'Appoint'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
