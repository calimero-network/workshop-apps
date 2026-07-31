import React, { useEffect, useState } from 'react';
import { C } from '../theme';
import { Overlay, Dialog, DialogClose, IconBadge, Field, Actions, Primary, Secondary, ErrLine, Spinner } from './primitives';

interface JoinModalProps {
  onJoin: (invitationCode: string) => Promise<void>;
  onClose: () => void;
}


export default function JoinModal({ onJoin, onClose }: JoinModalProps) {
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !joining) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [joining, onClose]);

  const handleJoin = async () => {
    if (!code.trim() || joining) return;
    setJoining(true);
    setError(null);
    try {
      await onJoin(code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join, check the invite code.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <Overlay onClick={() => !joining && onClose()}>
      <Dialog onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="join-title">
        <DialogClose onClick={() => !joining && onClose()} aria-label="Close">×</DialogClose>

        <IconBadge aria-hidden>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.accentText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
        </IconBadge>

        <h3 id="join-title">Join with invitation</h3>
        <p className="sub">Paste the invite code you received to join the workspace.</p>

        <Field $mono>
          <label htmlFor="join-code">Invite code</label>
          <textarea
            id="join-code"
            data-testid="join-code-input"
            autoFocus
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(null); }}
            placeholder="Paste your invite code…"
            rows={4}
            disabled={joining}
          />
        </Field>

        {error && <ErrLine>{error}</ErrLine>}

        <Actions>
          <Secondary onClick={onClose} disabled={joining}>Cancel</Secondary>
          <Primary data-testid="join-submit-btn" onClick={handleJoin} disabled={!code.trim() || joining}>
            {joining ? <Spinner /> : 'Join workspace'}
          </Primary>
        </Actions>
      </Dialog>
    </Overlay>
  );
}
