import React, { useEffect, useState } from 'react';
import { Overlay, Dialog, Field, Actions, Primary, Secondary, ErrLine } from './primitives';

interface Props {
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}

export default function NamespaceCreateModal({ onCreate, onClose }: Props) {
  const [name, setName] = useState('My workspace');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(trimmed);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create workspace.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay onClick={() => !busy && onClose()}>
      <Dialog onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ns-create-title">
        <h3 id="ns-create-title">New workspace</h3>
        <p className="sub">Name your workspace. You can invite others once it's created.</p>
        <Field>
          <input
            data-testid="ns-name-input"
            autoFocus
            value={name}
            maxLength={64}
            disabled={busy}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            aria-label="Workspace name"
          />
        </Field>
        {error && <ErrLine>{error}</ErrLine>}
        <Actions>
          <Secondary onClick={onClose} disabled={busy}>Cancel</Secondary>
          <Primary data-testid="ns-create-submit" onClick={() => void submit()} disabled={!name.trim() || busy}>
            {busy ? 'Creating…' : 'Create'}
          </Primary>
        </Actions>
      </Dialog>
    </Overlay>
  );
}
