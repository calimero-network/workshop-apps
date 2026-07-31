import React from 'react';
import styled from 'styled-components';
import { ConnectButton } from '@calimero-network/mero-react';
import { APP_DISPLAY_NAME, APP_DESCRIPTION } from '../../config';
import { C } from '../../theme';
import { Secondary } from '../../components/primitives';

export default function LoginPage() {
  // Redirect-when-authed is handled by <RedirectIfAuthed> in App.tsx, which
  // waits for the async auth probe before navigating.
  return (
    <Shell className="app-bg">
      <h1>{APP_DISPLAY_NAME}</h1>
      <p>{APP_DESCRIPTION}</p>
      <ConnectButton />
      <Secondary
        onClick={() =>
          window.open('https://docs.calimero.network', '_blank', 'noopener,noreferrer')
        }
      >
        Documentation
      </Secondary>
    </Shell>
  );
}

const Shell = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: var(--c-space-6);
  max-width: var(--c-app-max);
  margin: 0 auto;
  width: 100%;
  padding: var(--c-space-5);
  text-align: center;
  h1 {
    font-size: calc(var(--c-text-2xl) * 1.4);
    font-weight: 700;
    color: ${C.ink};
  }
  p {
    font-size: var(--c-text-base);
    color: ${C.muted};
    max-width: 400px;
  }
`;
