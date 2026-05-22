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
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--color-primary)' }}>
          Team Todos
        </h1>
        <p style={{ color: '#888', maxWidth: 400, textAlign: 'center' }}>
          Shared task lists for your team, powered by Calimero. Create workspaces,
          invite teammates, and track who&#39;s doing what with end-to-end privacy.
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
