import React, { useEffect, useState } from 'react';
import { C } from '../theme';
import { encodeInvitation } from '../utils/invitation';
import { Overlay, Dialog, DialogClose, IconBadge, Field, Primary, ErrLine, Spinner } from './primitives';

interface InviteModalProps {
  onInvite: () => Promise<unknown>;
  onClose: () => void;
}


const CheckMark = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
       strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
       style={{ marginRight: 6 }} aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export default function InviteModal({ onInvite, onClose }: InviteModalProps) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await onInvite();
      // Wrap the raw invitation in a single compact, copy-safe base64 code.
      setCode(encodeInvitation(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invitation.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked, no-op */ }
  };

  return (
    <Overlay onClick={onClose}>
      <Dialog onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="inv-title">
        <DialogClose onClick={onClose} aria-label="Close">×</DialogClose>

        <IconBadge aria-hidden>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.accentText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6M22 11h-6" />
          </svg>
        </IconBadge>

        <h3 id="inv-title">Invite to workspace</h3>
        <p className="sub">Generate an invite code and share it with anyone you want to join this workspace.</p>

        {!code ? (
          <Primary data-testid="generate-invite-btn" style={{ width: '100%', marginTop: 'var(--c-space-6)' }} onClick={handleGenerate} disabled={loading}>
            {loading ? <Spinner /> : 'Generate invite code'}
          </Primary>
        ) : (
          <>
            <Field $mono>
              <label htmlFor="invite-code">Invite code</label>
              <textarea id="invite-code" data-testid="invite-code-output" readOnly value={code} rows={4} onFocus={(e) => e.currentTarget.select()} />
            </Field>
            <Primary data-testid="copy-invite-btn" style={{ width: '100%' }} onClick={handleCopy}>
              {copied ? <><CheckMark />Copied</> : 'Copy invite code'}
            </Primary>
            <p className="hint">The recipient pastes this into “Join with invitation”.</p>
          </>
        )}

        {error && <ErrLine>{error}</ErrLine>}
      </Dialog>
    </Overlay>
  );
}
