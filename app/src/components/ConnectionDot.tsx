import React from 'react';
import styled, { keyframes } from 'styled-components';
import { useMero } from '@calimero-network/mero-react';
import { C } from '../theme';
import { NARROW } from './primitives';

/**
 * Node-connection / sync indicator. Green pulsing dot when the node link is
 * live, muted static dot when offline. Reads useMero().isOnline directly - the
 * provider already tracks the connection, so no health probe is needed.
 */
export default function ConnectionDot(): React.ReactElement {
  const { isOnline, nodeUrl } = useMero();
  const label = isOnline ? 'Connected' : 'Offline';
  return (
    <Wrap
      data-testid="connection-indicator"
      data-online={isOnline ? 'true' : 'false'}
      title={nodeUrl ? `${label} · ${nodeUrl}` : label}
      aria-label={label}
    >
      <Dot $online={isOnline} aria-hidden />
      <span className="txt">{label}</span>
    </Wrap>
  );
}

const pulse = keyframes`
  0% { transform: scale(0.6); opacity: 0.5; }
  70% { transform: scale(1.9); opacity: 0; }
  100% { opacity: 0; }
`;
const Wrap = styled.span`
  display: inline-flex; align-items: center; gap: var(--c-space-2);
  font-size: var(--c-text-sm); color: ${C.muted};
  .txt { @media ${NARROW} { display: none; } }
`;
const Dot = styled.span<{ $online: boolean }>`
  position: relative; flex: 0 0 auto;
  width: 8px; height: 8px; border-radius: 50%;
  background: ${({ $online }) => ($online ? C.green : C.off)};
  &::after {
    content: ''; position: absolute; inset: -3px; border-radius: 50%;
    background: ${C.green}; opacity: ${({ $online }) => ($online ? 0.35 : 0)};
    animation: ${({ $online }) => ($online ? pulse : 'none')} 2.4s ease-out infinite;
  }
  @media (prefers-reduced-motion: reduce) { &::after { animation: none; } }
`;
