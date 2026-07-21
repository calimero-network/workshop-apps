import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useMero } from '@calimero-network/mero-react';
import { C } from '../theme';
import { APP_VERSION, APP_DISPLAY_NAME } from '../config';
import type { UseWorkspaceReturn } from '../hooks/useWorkspace';
import { useMemberDisplayName, MAX_DISPLAY_NAME_BYTES } from '../hooks/useMemberDisplayName';
import { useDisplayNames, MemberLabel } from './MemberLabel';
import { useNamespaceRole } from '../hooks/useNamespaceRole';
import MembersPanel from './MembersPanel';

interface Props {
  ws: UseWorkspaceReturn;
  onClose: () => void;
}

export default function SettingsPanel({ ws, onClose }: Props): React.ReactElement {
  const { logout } = useMero();
  const { refresh } = useDisplayNames();
  const { namespaceId, executorPublicKey: self } = ws;
  const { name, setName } = useMemberDisplayName(namespaceId, self, self);
  const { role, isAdmin, refresh: refreshRole } = useNamespaceRole(namespaceId, self);

  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [leaveArmed, setLeaveArmed] = useState(false);

  useEffect(() => { setDraft(name ?? ''); }, [name]);
  // Two-step confirm: first click arms the button, second click leaves.
  // Auto-disarm after 5s so a stray click doesn't leave it primed forever.
  useEffect(() => {
    if (!leaveArmed) return;
    const t = setTimeout(() => setLeaveArmed(false), 5000);
    return () => clearTimeout(t);
  }, [leaveArmed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving && !leaving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, leaving, onClose]);

  const saveName = async () => {
    const next = draft.trim();
    if (!next || next === name) return;
    setSaving(true);
    setSaveError(null);
    try {
      await setName(next);
      refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    if (!namespaceId || !self) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      await ws.leaveWorkspace();
      onClose();
    } catch (e) {
      setLeaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setLeaving(false);
    }
  };

  const onLeaveClick = () => {
    if (!leaveArmed) { setLeaveArmed(true); return; }
    setLeaveArmed(false);
    void leave();
  };

  return (
    <Overlay data-testid="settings-page" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <Panel onClick={(e) => e.stopPropagation()}>
        <Head>
          <h2 id="settings-title">Settings</h2>
          <Close data-testid="close-settings-btn" onClick={onClose} aria-label="Close settings">×</Close>
        </Head>

        <Section data-testid="settings-profile">
          <h3>Profile</h3>
          <label htmlFor="settings-name">Display name</label>
          <Row>
            <input
              id="settings-name"
              data-testid="field-settings-name"
              value={draft}
              maxLength={MAX_DISPLAY_NAME_BYTES}
              disabled={saving}
              onChange={(e) => { setDraft(e.target.value); setSaveError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void saveName(); }}
            />
            <Primary data-testid="action-save-settings-name" onClick={() => void saveName()} disabled={saving || !draft.trim() || draft.trim() === name}>
              {saving ? 'Saving…' : 'Save'}
            </Primary>
          </Row>
          {saveError && <ErrLine role="alert">{saveError}</ErrLine>}
          <Meta>
            Signed in as {self ? <MemberLabel memberId={self} /> : '-'}
            {role && <RoleTag>{role}</RoleTag>}
          </Meta>
        </Section>

        <Section>
          <h3>Members</h3>
          <MembersPanel namespaceId={namespaceId} selfIdentity={self} selfRole={role} isAdmin={isAdmin} onChanged={refreshRole} />
        </Section>

        <Section>
          <h3>About</h3>
          <Meta>{APP_DISPLAY_NAME} <span data-testid="app-version">v{APP_VERSION}</span></Meta>
        </Section>

        <Danger>
          <Secondary data-testid="sign-out-btn" onClick={logout}>Sign out</Secondary>
          {/* Leave is hidden for the owner (Admin): core self-leave has no key
              rotation, and the owner leaving would strand the workspace. Gated on
              role !== null so it stays hidden until the role resolves (fail closed:
              an unresolved or failed fetch never exposes leave to a possible owner). */}
          {role !== null && !isAdmin && (
            <Leave data-testid="leave-workspace-btn" $armed={leaveArmed} onClick={onLeaveClick} disabled={leaving}>
              {leaving ? 'Leaving…' : leaveArmed ? 'Click again to confirm' : 'Leave workspace'}
            </Leave>
          )}
          {leaveError && <ErrLine role="alert">{leaveError}</ErrLine>}
        </Danger>
      </Panel>
    </Overlay>
  );
}

const Overlay = styled.div`
  position: fixed; inset: 0; z-index: 120; overflow-y: auto;
  display: flex; align-items: flex-start; justify-content: center; padding: 40px 20px;
  background: ${C.paper}f2; backdrop-filter: blur(3px);
`;
const Panel = styled.div`
  width: 100%; max-width: 640px;
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 18px;
  padding: 24px 24px 28px; box-shadow: 0 24px 60px rgba(0,0,0,0.28);
`;
const Head = styled.div`
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px;
  h2 { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; }
`;
const Close = styled.button`
  width: 32px; height: 32px; display: grid; place-items: center; font-size: 22px; line-height: 1;
  color: ${C.mutedSoft}; background: transparent; border: none; border-radius: 8px; cursor: pointer;
  &:hover { background: ${C.paper}; color: ${C.ink}; }
`;
const Section = styled.section`
  padding: 16px 0; border-top: 1px solid ${C.line};
  h3 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: ${C.mutedSoft}; margin-bottom: 12px; }
  label { display: block; font-size: 12px; font-weight: 600; color: ${C.muted}; margin-bottom: 7px; }
  input {
    flex: 1; min-width: 0; padding: 10px 12px; font-size: 14px;
    color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 10px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
    &:disabled { opacity: 0.6; }
  }
`;
const Row = styled.div`display: flex; gap: 10px; align-items: center;`;
const Meta = styled.p`margin-top: 12px; font-size: 13px; color: ${C.muted}; display: inline-flex; align-items: center; gap: 8px;`;
const RoleTag = styled.span`
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700;
  padding: 2px 7px; border-radius: 999px; color: ${C.greenInk};
  background: rgba(164,255,17,0.16); border: 1px solid rgba(164,255,17,0.4);
`;
const Danger = styled.div`
  display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
  padding-top: 16px; border-top: 1px solid ${C.line};
`;
const Primary = styled.button`
  padding: 10px 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
  &:hover:not(:disabled) { background: ${C.greenHover}; }
  &:disabled { opacity: 0.55; cursor: default; }
`;
const Secondary = styled.button`
  padding: 10px 16px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  &:hover { background: ${C.paper}; border-color: ${C.green}; }
`;
const Leave = styled.button<{ $armed: boolean }>`
  padding: 10px 16px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${(p) => (p.$armed ? C.onAccent : C.danger)};
  background: ${(p) => (p.$armed ? C.danger : 'transparent')};
  border: 1px solid ${(p) => (p.$armed ? C.danger : C.line)};
  &:hover:not(:disabled) { border-color: ${C.danger}; }
  &:disabled { opacity: 0.55; cursor: default; }
`;
const ErrLine = styled.p`margin: 10px 0 0; font-size: 12.5px; color: ${C.danger}; width: 100%;`;
