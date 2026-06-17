import React, { useState } from 'react';
import type { Location, Expense, Photo } from '../api/trip/TripClient';

interface FeedItem {
  kind: 'location' | 'expense' | 'photo';
  ts: number;
  data: Location | Expense | Photo;
}

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface FeedViewProps {
  locations: Location[];
  expenses: Expense[];
  photos: Photo[];
  tripStatus: string | null;
  memberNames: Record<string, string>;
  selfIdentity: string | null;
  loading: boolean;
  onPostLocation: (description: string) => Promise<void>;
  onLogExpense: (description: string, amountCents: number, participants: string[]) => Promise<void>;
  onUploadPhoto: (url: string) => Promise<void>;
  allMemberIdentities: string[];
}

export default function FeedView({
  locations,
  expenses,
  photos,
  tripStatus,
  memberNames,
  selfIdentity,
  loading,
  onPostLocation,
  onLogExpense,
  onUploadPhoto,
  allMemberIdentities,
}: FeedViewProps) {
  const isFinished = tripStatus === 'finished';

  const [locDesc, setLocDesc] = useState('');
  const [locBusy, setLocBusy] = useState(false);

  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expParticipants, setExpParticipants] = useState<Set<string>>(() => new Set(allMemberIdentities));
  const [expBusy, setExpBusy] = useState(false);

  const [photoUrl, setPhotoUrl] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);

  const [activeInput, setActiveInput] = useState<'location' | 'expense' | 'photo' | null>(null);

  // Build unified timeline (newest first)
  const feed: FeedItem[] = [
    ...locations.map((l): FeedItem => ({ kind: 'location', ts: l.posted_at, data: l })),
    ...expenses.map((e): FeedItem => ({ kind: 'expense', ts: e.logged_at, data: e })),
    ...photos.map((p): FeedItem => ({ kind: 'photo', ts: p.uploaded_at, data: p })),
  ].sort((a, b) => b.ts - a.ts);

  const memberLabel = (id: string) => memberNames[id] || shortenId(id);

  const handlePostLocation = async () => {
    if (!locDesc.trim() || locBusy) return;
    setLocBusy(true);
    try {
      await onPostLocation(locDesc.trim());
      setLocDesc('');
      setActiveInput(null);
    } finally { setLocBusy(false); }
  };

  const handleLogExpense = async () => {
    const cents = Math.round(parseFloat(expAmount) * 100);
    if (!expDesc.trim() || isNaN(cents) || cents <= 0 || expBusy) return;
    setExpBusy(true);
    try {
      await onLogExpense(expDesc.trim(), cents, [...expParticipants]);
      setExpDesc('');
      setExpAmount('');
      setActiveInput(null);
    } finally { setExpBusy(false); }
  };

  const handleUploadPhoto = async () => {
    if (!photoUrl.trim() || photoBusy) return;
    setPhotoBusy(true);
    try {
      await onUploadPhoto(photoUrl.trim());
      setPhotoUrl('');
      setActiveInput(null);
    } finally { setPhotoBusy(false); }
  };

  const toggleParticipant = (id: string) => {
    setExpParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Action bar */}
      {!isFinished && (
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid #1e293b',
          background: '#0f172a',
          flexWrap: 'wrap',
        }}>
          <ActionBtn
            label="📍 Location"
            active={activeInput === 'location'}
            onClick={() => setActiveInput(activeInput === 'location' ? null : 'location')}
          />
          <ActionBtn
            label="💸 Expense"
            active={activeInput === 'expense'}
            onClick={() => setActiveInput(activeInput === 'expense' ? null : 'expense')}
          />
          <ActionBtn
            label="📷 Photo"
            active={activeInput === 'photo'}
            onClick={() => setActiveInput(activeInput === 'photo' ? null : 'photo')}
          />
        </div>
      )}

      {/* Input panels */}
      {!isFinished && activeInput === 'location' && (
        <div style={inputPanelStyle}>
          <input
            value={locDesc}
            onChange={(e) => setLocDesc(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePostLocation()}
            placeholder="Where are you? e.g. 'at the bar on 5th'"
            autoFocus
            style={textInputStyle}
          />
          <button onClick={handlePostLocation} disabled={locBusy || !locDesc.trim()} style={submitBtnStyle}>
            {locBusy ? 'Posting…' : 'Post'}
          </button>
        </div>
      )}

      {!isFinished && activeInput === 'expense' && (
        <div style={inputPanelStyle}>
          <input
            value={expDesc}
            onChange={(e) => setExpDesc(e.target.value)}
            placeholder="What was it? e.g. 'dinner'"
            style={{ ...textInputStyle, marginBottom: '0.5rem' }}
          />
          <input
            value={expAmount}
            onChange={(e) => setExpAmount(e.target.value)}
            placeholder="Amount (e.g. 42.50)"
            type="number"
            min="0"
            step="0.01"
            style={{ ...textInputStyle, marginBottom: '0.5rem' }}
          />
          {allMemberIdentities.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '0.25rem' }}>
                Split between ({expParticipants.size} selected)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {allMemberIdentities.map((id) => (
                  <label key={id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                    fontSize: '0.78rem', cursor: 'pointer',
                    padding: '0.2rem 0.5rem', borderRadius: 4,
                    background: expParticipants.has(id) ? 'rgba(255,107,107,0.2)' : '#1e293b',
                    color: expParticipants.has(id) ? 'var(--color-primary)' : '#94a3b8',
                    border: `1px solid ${expParticipants.has(id) ? 'var(--color-primary)' : '#334155'}`,
                  }}>
                    <input
                      type="checkbox"
                      checked={expParticipants.has(id)}
                      onChange={() => toggleParticipant(id)}
                      style={{ display: 'none' }}
                    />
                    {memberLabel(id)}{id === selfIdentity ? ' (you)' : ''}
                  </label>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={handleLogExpense}
            disabled={expBusy || !expDesc.trim() || !expAmount.trim()}
            style={submitBtnStyle}
          >
            {expBusy ? 'Logging…' : 'Log Expense'}
          </button>
        </div>
      )}

      {!isFinished && activeInput === 'photo' && (
        <div style={inputPanelStyle}>
          <input
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUploadPhoto()}
            placeholder="Photo URL (e.g. https://cdn.example.com/photo.jpg)"
            autoFocus
            style={textInputStyle}
          />
          <button onClick={handleUploadPhoto} disabled={photoBusy || !photoUrl.trim()} style={submitBtnStyle}>
            {photoBusy ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      )}

      {isFinished && (
        <div style={{
          padding: '0.6rem 1rem',
          background: 'rgba(78,205,196,0.1)',
          borderBottom: '1px solid rgba(78,205,196,0.3)',
          color: 'var(--color-accent)',
          fontSize: '0.82rem',
          textAlign: 'center',
        }}>
          🏁 This trip is finished — the feed is frozen for the record.
        </div>
      )}

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {loading && feed.length === 0 && (
          <div style={{ textAlign: 'center', color: '#64748b', padding: '3rem' }}>Loading…</div>
        )}
        {!loading && feed.length === 0 && (
          <div style={{ textAlign: 'center', color: '#64748b', padding: '3rem', lineHeight: 1.7 }}>
            No activity yet.<br />Post a location, log an expense, or share a photo!
          </div>
        )}
        {feed.map((item) => {
          if (item.kind === 'location') {
            const loc = item.data as Location;
            return (
              <FeedCard key={loc.id} icon="📍" color="#4ECDC4">
                <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.9rem' }}>{loc.description}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                  {memberLabel(loc.author)} · {formatTime(loc.posted_at)}
                </div>
              </FeedCard>
            );
          }
          if (item.kind === 'expense') {
            const exp = item.data as Expense;
            return (
              <FeedCard key={exp.id} icon="💸" color="#FF6B6B">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.9rem' }}>{exp.description}</span>
                  <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '1rem' }}>
                    {formatCents(exp.amount_cents)}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                  Paid by {memberLabel(exp.payer)} · split with {exp.participants.map(memberLabel).join(', ')}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: 1 }}>
                  {formatTime(exp.logged_at)}
                </div>
              </FeedCard>
            );
          }
          if (item.kind === 'photo') {
            const photo = item.data as Photo;
            return (
              <FeedCard key={photo.id} icon="📷" color="#F7DC6F">
                <img
                  src={photo.url}
                  alt="Trip photo"
                  style={{
                    width: '100%',
                    maxHeight: 240,
                    objectFit: 'cover',
                    borderRadius: 6,
                    marginBottom: 4,
                  }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div style={{ fontSize: '0.72rem', color: '#64748b', wordBreak: 'break-all' }}>
                  <a href={photo.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>
                    {photo.url}
                  </a>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                  {memberLabel(photo.author)} · {formatTime(photo.uploaded_at)}
                </div>
              </FeedCard>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function ActionBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.4rem 0.8rem',
        borderRadius: 6,
        border: `1px solid ${active ? 'var(--color-primary)' : '#334155'}`,
        background: active ? 'rgba(255,107,107,0.15)' : 'transparent',
        color: active ? 'var(--color-primary)' : '#94a3b8',
        cursor: 'pointer',
        fontSize: '0.82rem',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function FeedCard({ icon, color, children }: { icon: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      gap: '0.75rem',
      padding: '0.75rem',
      background: '#0f172a',
      borderRadius: 8,
      border: '1px solid #1e293b',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: `${color}22`,
        border: `1px solid ${color}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1rem', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

const inputPanelStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderBottom: '1px solid #1e293b',
  background: '#0a0f1a',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
};

const textInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 6,
  color: '#e2e8f0',
  fontSize: '0.88rem',
  boxSizing: 'border-box',
};

const submitBtnStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '0.4rem 1rem',
  background: 'var(--color-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: '0.82rem',
};
