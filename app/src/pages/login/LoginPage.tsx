import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@calimero-network/mero-ui';
import { useMero, ConnectButton } from '@calimero-network/mero-react';
import { APP_ROUTE } from '../../config';

export default function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useMero();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(APP_ROUTE);
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="app-bg">
      <div
        className="page-shell"
        style={{ justifyContent: 'center', alignItems: 'center', gap: '2rem' }}
      >
        {/* Decorative crest */}
        <div style={{
          fontSize: '4rem',
          lineHeight: 1,
          filter: 'drop-shadow(0 0 12px var(--color-accent))',
        }}>
          ⚔️
        </div>

        <h1 style={{
          fontSize: '2.8rem',
          fontWeight: 800,
          letterSpacing: '0.04em',
          background: 'linear-gradient(135deg, var(--color-accent), #fff8dc)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textAlign: 'center',
        }}>
          D&amp;D Online Table
        </h1>

        <p style={{
          color: '#a0a0b0',
          maxWidth: 420,
          textAlign: 'center',
          lineHeight: 1.7,
          fontSize: '1rem',
        }}>
          Real-time collaborative D&amp;D — shared chat, DM-managed dice rolls, turn
          tracking, and a live game log. Powered by the Calimero decentralized network.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', width: '100%', maxWidth: 280 }}>
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

        <p style={{ color: '#555', fontSize: '0.78rem', textAlign: 'center' }}>
          Connect your Calimero node to create or join a game table.
        </p>
      </div>
    </div>
  );
}
