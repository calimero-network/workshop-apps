import React from 'react';
import { Button } from '@calimero-network/mero-ui';
import { ConnectButton } from '@calimero-network/mero-react';
import { APP_DISPLAY_NAME, APP_DESCRIPTION } from '../../config';

export default function LoginPage() {
  // Redirect-when-authed is handled by <RedirectIfAuthed> in App.tsx, which
  // waits for the async auth probe before navigating.
  return (
    <div className="app-bg">
      <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-1px' }}>{APP_DISPLAY_NAME}</h1>
        <p style={{ color: 'var(--c-muted)', maxWidth: 400, textAlign: 'center', lineHeight: 1.55 }}>
          {APP_DESCRIPTION}
        </p>
        <p style={{ color: 'var(--c-muted-soft)', fontSize: 13, marginTop: '-1rem' }}>
          Connect your node to start or join a retro.
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
