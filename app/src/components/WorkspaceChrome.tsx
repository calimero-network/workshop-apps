import React from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import { APP_DISPLAY_NAME } from '../config';
import type { UseWorkspaceReturn } from '../hooks/useWorkspace';
import NamespaceSwitcher from './NamespaceSwitcher';
import ConnectionDot from './ConnectionDot';

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
        <span className="brand">{APP_DISPLAY_NAME}</span>
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

const Bar = styled.header`
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  margin-bottom: 24px; flex-wrap: wrap;
  .left { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .brand { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; white-space: nowrap; }
  .right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
`;
const Action = styled.button`
  padding: 8px 14px; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: ${C.paper2}; border-color: ${C.green}; }
`;
