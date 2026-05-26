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
      <div className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', gap: '2rem' }}>
        <div style={{ fontSize: '2.5rem' }}>📊</div>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, color: '#f9fafb', margin: 0 }}>
          Trading Pod Forum
        </h1>
        <p style={{ color: '#9ca3af', maxWidth: 400, textAlign: 'center', margin: 0 }}>
          Private, decentralized forum for your trading group. Share theses,
          debate ideas, and post-mortem closed positions — with full privacy.
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
