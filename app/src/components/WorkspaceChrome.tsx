import React from 'react';
import styled from 'styled-components';
import { CalimeroLogo } from '@calimero-network/mero-react';
import { C } from '../theme';
import { APP_DISPLAY_NAME } from '../config';
import type { UseWorkspaceReturn } from '../hooks/useWorkspace';
import NamespaceSwitcher from './NamespaceSwitcher';
import ConnectionDot from './ConnectionDot';
import { Secondary } from './primitives';

interface Props {
  ws: UseWorkspaceReturn;
  onOpenInvite: () => void;
  onOpenJoin: () => void;
  onOpenSettings: () => void;
}

/**
 * SCAFFOLD-OWNED chrome bar. The build agent reskins copy/spacing but keeps the
 * switcher, connection dot, and the invite/join/settings testids mounted.
 */
export default function WorkspaceChrome({ ws, onOpenInvite, onOpenJoin, onOpenSettings }: Props): React.ReactElement {
  return (
    <Bar>
      <div className="left">
        <span className="brand">
          <span className="mark"><CalimeroLogo size={20} color={C.greenInk} /></span>
          <span className="wm">{APP_DISPLAY_NAME}</span>
        </span>
        <NamespaceSwitcher
          namespaces={ws.namespaces}
          activeNamespaceId={ws.activeNamespaceId}
          onSwitch={ws.switchNamespace}
          onCreate={ws.bootstrap}
          onJoin={onOpenJoin}
        />
      </div>
      <div className="right">
        <ConnectionDot />
        <Action data-testid="open-invite-btn" onClick={onOpenInvite}>Invite</Action>
        <Action data-testid="open-join-btn" onClick={onOpenJoin}>Join</Action>
        <Action data-testid="open-settings-btn" onClick={onOpenSettings} aria-label="Settings">Settings</Action>
      </div>
    </Bar>
  );
}

// The landing's header treatment, carried into the app so the front door and
// the room behind it read as one product. It sticks within the content column
// rather than bleeding to the window, so it does not depend on the page's
// padding and keeps working if the build agent reshapes the shell.
const Bar = styled.header`
  position: sticky; top: 0; z-index: 50;
  background: color-mix(in srgb, var(--c-paper) 82%, transparent);
  backdrop-filter: saturate(160%) blur(14px);
  border-bottom: 1px solid ${C.line};
  padding: var(--c-space-3) 0;
  margin-bottom: var(--c-space-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--c-space-4);
  flex-wrap: wrap;
  .left { display: flex; align-items: center; gap: var(--c-space-3); min-width: 0; }
  .brand {
    display: inline-flex; align-items: center; gap: var(--c-space-2);
    white-space: nowrap;
  }
  .brand .mark { display: flex; flex-shrink: 0; }
  .brand .wm {
    font-family: var(--c-font-display);
    letter-spacing: var(--c-display-tracking);
    font-size: var(--c-text-lg); font-weight: 800;
    color: ${C.ink};
  }
  .right { display: flex; align-items: center; gap: var(--c-space-2); flex-wrap: wrap; }
`;
// Chrome actions are deliberately tighter than a page-level Secondary.
const Action = styled(Secondary)`
  padding: var(--c-space-2) var(--c-space-3);
`;
