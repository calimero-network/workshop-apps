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
        <div style={{ fontSize: '3rem', marginBottom: '0.25rem' }}>💬</div>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 700, color: 'var(--color-primary, #3B82F6)' }}>
          one-on-one chat
        </h1>
        <p style={{ color: '#64748b', maxWidth: 380, textAlign: 'center', lineHeight: 1.6 }}>
          Private, decentralized messaging between two friends — powered by
          Calimero. Your conversations live on your nodes, not a server.
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
