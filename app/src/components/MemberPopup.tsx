import React, { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { C } from '../theme';
import { describeError } from '../utils/errors';

interface MemberPopupProps {
  identity: string;
  alias?: string;
  role?: string;
  online: boolean;
  isSelf: boolean;
  /** Viewer is a workspace admin → show role/remove controls (not for self). */
  canManage?: boolean;
  onSetRole?: (role: 'Admin' | 'Member') => Promise<void>;
  onRemove?: () => Promise<void>;
  onClose: () => void;
}


export default function MemberPopup({ identity, alias, role, online, isSelf, canManage, onSetRole, onRemove, onClose }: MemberPopupProps) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const isTargetAdmin = role === 'Admin';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(identity); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* blocked */ }
  };

  const run = async (fn: () => Promise<void>, after?: () => void) => {
    setBusy(true); setError(null);
    try { await fn(); after?.(); }
    catch (err) { setError(describeError(err)); }
    finally { setBusy(false); }
  };

  const showManage = !!canManage && !isSelf;

  const display = alias?.trim() || `${identity.slice(0, 6)}…${identity.slice(-5)}`;
  const initial = (alias?.trim()?.[0] || identity[0] || '?').toUpperCase();

  return (
    <Overlay onClick={onClose}>
      <Dialog onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="mp-name">
        <Close onClick={onClose} aria-label="Close">×</Close>

        <Head>
          <Avatar $online={online}>{initial}</Avatar>
          <div className="who">
            <span id="mp-name" className="name">{display}{isSelf && <em> · you</em>}</span>
            <span className="status">
              <i className={online ? 'on' : 'off'} />{online ? 'Online' : 'Offline'}
              {role && <span className="role">{role}</span>}
            </span>
          </div>
        </Head>

        <Field>
          <span className="lbl">Workspace identity</span>
          <div className="keyrow">
            <code>{identity}</code>
          </div>
          <CopyBtn onClick={copy}>{copied ? 'Copied ✓' : 'Copy identity'}</CopyBtn>
        </Field>

        {showManage && (onSetRole || onRemove) && (
          <Manage>
            <span className="lbl">Admin actions</span>
            {onSetRole && (
              isTargetAdmin
                ? <ActionBtn disabled={busy} onClick={() => run(() => onSetRole('Member'))}>Demote to member</ActionBtn>
                : <ActionBtn disabled={busy} onClick={() => run(() => onSetRole('Admin'))}>Promote to admin</ActionBtn>
            )}
            {onRemove && (
              !confirmRemove
                ? <ActionBtn className="danger" disabled={busy} onClick={() => setConfirmRemove(true)}>Remove from workspace</ActionBtn>
                : (
                  <div className="confirm">
                    <span>Remove this member?</span>
                    <div className="row">
                      <ActionBtn disabled={busy} onClick={() => setConfirmRemove(false)}>Cancel</ActionBtn>
                      <ActionBtn className="danger" disabled={busy} onClick={() => run(onRemove, onClose)}>Remove</ActionBtn>
                    </div>
                  </div>
                )
            )}
            {error && <span className="err">{error}</span>}
          </Manage>
        )}

        <Note>
          This is the member’s workspace identity. To make someone a room moderator you need
          <strong> their room key</strong> (shown in a room’s Moderation panel) — it’s per-room and
          differs from this identity.
        </Note>
      </Dialog>
    </Overlay>
  );
}

const fadeIn = keyframes`from{opacity:0;}to{opacity:1;}`;
const pop = keyframes`from{opacity:0;transform:translateY(10px) scale(0.97);}to{opacity:1;transform:none;}`;

const Overlay = styled.div`
  position: fixed; inset: 0; z-index: 110;
  display: flex; align-items: center; justify-content: center; padding: 20px;
  background: rgba(14,20,15,0.45); backdrop-filter: blur(4px);
  animation: ${fadeIn} 0.16s ease both;
`;
const Dialog = styled.div`
  position: relative; width: 100%; max-width: 400px;
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 18px;
  padding: 24px; box-shadow: 0 40px 90px -40px rgba(14,20,15,0.5);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  animation: ${pop} 0.2s cubic-bezier(0.22,1,0.36,1) both;
`;
const Close = styled.button`
  position: absolute; top: 12px; right: 12px; width: 30px; height: 30px;
  display: grid; place-items: center; font-size: 20px; line-height: 1;
  color: ${C.mutedSoft}; background: transparent; border: none; border-radius: 8px; cursor: pointer;
  &:hover { background: ${C.paper2}; color: ${C.ink}; }
`;
const Head = styled.div`
  display: flex; align-items: center; gap: 13px; margin-bottom: 20px;
  .who { min-width: 0; }
  .name { display: block; font-size: 16px; font-weight: 800; letter-spacing: -0.3px; color: ${C.ink}; }
  .name em { font-style: normal; font-weight: 600; color: ${C.greenInk}; }
  .status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: ${C.muted}; margin-top: 2px; }
  .status i { width: 8px; height: 8px; border-radius: 50%; }
  .status i.on { background: ${C.green}; }
  .status i.off { background: ${C.off}; }
  .status .role { margin-left: 6px; font-size: 10.5px; font-weight: 600; color: ${C.greenInk}; background: ${C.greenSoft}; padding: 2px 7px; border-radius: 999px; }
`;
const Avatar = styled.span<{ $online: boolean }>`
  width: 46px; height: 46px; flex-shrink: 0;
  display: grid; place-items: center; border-radius: 50%;
  font-size: 18px; font-weight: 700; color: ${(p) => (p.$online ? C.onAccent : C.ink)};
  background: ${(p) => (p.$online ? `linear-gradient(135deg, ${C.green}, #cde88a)` : C.paper2)};
  border: 1px solid ${(p) => (p.$online ? 'transparent' : C.line)};
`;
const Field = styled.div`
  display: flex; flex-direction: column; gap: 8px;
  .lbl { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.mutedSoft}; }
  .keyrow { background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 10px; padding: 10px 12px; }
  .keyrow code { font-family: ui-monospace,'SF Mono',Menlo,monospace; font-size: 12px; color: ${C.ink}; word-break: break-all; line-height: 1.5; }
`;
const CopyBtn = styled.button`
  width: 100%; padding: 10px; font-size: 13px; font-weight: 600; cursor: pointer;
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c; border-radius: 10px;
  transition: background 0.16s, box-shadow 0.18s, transform 0.14s;
  &:hover { background: ${C.greenHover}; box-shadow: 0 8px 22px ${C.greenBorder}; transform: translateY(-1px); }
`;
const Manage = styled.div`
  margin-top: 18px; padding-top: 16px; border-top: 1px solid ${C.line};
  display: flex; flex-direction: column; gap: 8px;
  .lbl { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.mutedSoft}; }
  .confirm { display: flex; flex-direction: column; gap: 8px; }
  .confirm > span { font-size: 13px; color: ${C.ink}; }
  .confirm .row { display: flex; gap: 8px; }
  .err { font-size: 12px; color: ${C.danger}; }
`;
const ActionBtn = styled.button`
  flex: 1;
  padding: 10px 14px; font-size: 13px; font-weight: 600; cursor: pointer;
  color: ${C.ink}; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 10px;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  &:hover:not(:disabled) { background: ${C.paper}; border-color: ${C.lineDark}; }
  &.danger { color: ${C.danger}; background: rgba(210,59,47,0.06); border-color: rgba(210,59,47,0.3); }
  &.danger:hover:not(:disabled) { background: rgba(210,59,47,0.12); }
  &:disabled { opacity: 0.6; cursor: default; }
`;
const Note = styled.p`
  margin: 16px 0 0; font-size: 11.5px; line-height: 1.55; color: ${C.mutedSoft};
  strong { color: ${C.muted}; }
`;
