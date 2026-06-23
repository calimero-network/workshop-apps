import React from 'react';
import { Button } from '@calimero-network/mero-ui';
import { ConnectButton } from '@calimero-network/mero-react';

export default function LoginPage() {
  // Redirect-when-authed is handled by <RedirectIfAuthed> in App.tsx, which
  // waits for the async auth probe before navigating.
  return (
    <div className="app-bg">
      <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700 }}>Incident Command</h1>
        <p style={{ color: '#888', maxWidth: 400, textAlign: 'center' }}>
          Peer-to-peer incident management — report, triage, resolve, and postmortem together.
          Your data stays on your own nodes.
        </p>
        <ConnectButton />
        <Button
          variant="secondary"
          onClick={() =>
            window.open('https://docs.calimero.network', '_blank', 'noopener,noreferrer')
          }
        >
          Documentation
        </Button>
      </div>
    </div>
  );
}
