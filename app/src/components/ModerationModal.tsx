import React, { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { C } from '../theme';
import { describeError } from '../utils/errors';

interface ModerationModalProps {
  roomName: string;
  myRoomKey: string | null;
  moderators: string[];
  onRename: (newName: string) => Promise<void>;
  onPromote: (key: string) => Promise<void>;
  onDemote: (key: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}


function shortKey(k: string): string {
  return k.length <= 16 ? k : `${k.slice(0, 8)}…${k.slice(-6)}`;
}

export default function ModerationModal({
  roomName, myRoomKey, moderators, onRename, onPromote, onDemote, onDelete, onClose,
}: ModerationModalProps) {
  const [promoteKey, setPromoteKey] = useState('');
  const [name, setName] = useState(roomName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const run = async (fn: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try { await fn(); after?.(); }
    catch (err) { setError(describeError(err)); }
    finally { setBusy(false); }
  };

  const copyMyKey = async () => {
    if (!myRoomKey) return;
    try { await navigator.clipboard.writeText(myRoomKey); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* blocked */ }
  };

  return (
    <Overlay onClick={() => !busy && onClose()}>
      <Dialog onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="mod-title" data-testid="moderation-panel">
        <Close onClick={() => !busy && onClose()} aria-label="Close">×</Close>

        <IconBadge aria-hidden>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.greenInk} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </IconBadge>

        <h3 id="mod-title">Moderate #{roomName}</h3>
        <p className="explainer">
          Moderators can rename the room, promote or remove other moderators, and delete the
          room. To promote someone, paste <strong>their room key</strong> (each member sees their
          own key here) — keys are per-room, so they differ from a member’s workspace identity.
        </p>

        <Section>
          <span className="lbl">Room name</span>
          <div className="promoterow">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Room name"
              disabled={busy}
              style={{ fontFamily: 'inherit' }}
            />
            <PrimaryBtn
              disabled={busy || !name.trim() || name.trim() === roomName}
              onClick={() => run(() => onRename(name.trim()))}
            >
              Rename
            </PrimaryBtn>
          </div>
        </Section>

        <Section>
          <span className="lbl">Your room key</span>
          <div className="keyrow">
            <code data-testid="my-room-key">{myRoomKey ?? '…'}</code>
            <button onClick={copyMyKey} disabled={!myRoomKey}>{copied ? 'Copied ✓' : 'Copy'}</button>
          </div>
          <span className="hint">Share this so a moderator can promote you.</span>
        </Section>

        <Section>
          <span className="lbl">Current moderators <span className="count">· {moderators.length}</span></span>
          <ModList>
            {moderators.length === 0 && <li className="empty">No moderators listed.</li>}
            {moderators.map((k) => {
              const isMe = !!myRoomKey && k === myRoomKey;
              return (
                <li key={k}>
                  <code title={k}>{shortKey(k)}</code>
                  {isMe && <span className="you">you</span>}
                  <button
                    className="demote"
                    disabled={busy || moderators.length <= 1}
                    title={moderators.length <= 1 ? 'Cannot remove the last moderator' : 'Remove moderator'}
                    onClick={() => run(() => onDemote(k))}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ModList>
        </Section>

        <Section>
          <span className="lbl">Promote a member</span>
          <div className="promoterow">
            <input
              type="text"
              value={promoteKey}
              onChange={(e) => setPromoteKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && promoteKey.trim()) run(() => onPromote(promoteKey.trim()), () => setPromoteKey('')); }}
              placeholder="Paste a member's room key…"
              data-testid="promote-key-input"
              disabled={busy}
            />
            <PrimaryBtn
              data-testid="promote-button"
              disabled={busy || !promoteKey.trim()}
              onClick={() => run(() => onPromote(promoteKey.trim()), () => setPromoteKey(''))}
            >
              Promote
            </PrimaryBtn>
          </div>
        </Section>

        {error && <ErrorLine data-testid="moderation-error">{error}</ErrorLine>}

        <DangerZone>
          {!confirmDelete ? (
            <DangerBtn data-testid="delete-room-button" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete room
            </DangerBtn>
          ) : (
            <div className="confirm">
              <span>Delete <strong>#{roomName}</strong> for everyone?</span>
              <div className="row">
                <SecondaryBtn disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</SecondaryBtn>
                <DangerBtn disabled={busy} onClick={() => run(onDelete)}>Yes, delete</DangerBtn>
              </div>
            </div>
          )}
        </DangerZone>
      </Dialog>
    </Overlay>
  );
}

const fadeIn = keyframes`from{opacity:0;}to{opacity:1;}`;
const pop = keyframes`from{opacity:0;transform:translateY(10px) scale(0.97);}to{opacity:1;transform:none;}`;

const Overlay = styled.div`
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center; padding: 20px;
  background: rgba(14,20,15,0.45); backdrop-filter: blur(4px);
  animation: ${fadeIn} 0.18s ease both;
`;
const Dialog = styled.div`
  position: relative; width: 100%; max-width: 480px; max-height: 88vh; overflow-y: auto;
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 18px;
  padding: 26px 24px 22px; box-shadow: 0 40px 90px -40px rgba(14,20,15,0.5);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  animation: ${pop} 0.22s cubic-bezier(0.22,1,0.36,1) both;
  h3 { font-size: 19px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; margin: 0 0 8px; }
  .explainer {
    margin: 0; font-size: 12.5px; line-height: 1.55; color: ${C.muted};
    background: ${C.paper2}; border: 1px solid ${C.line}; border-left: 3px solid ${C.green};
    border-radius: 10px; padding: 10px 12px;
  }
  .explainer strong { color: ${C.ink}; }
`;
const Close = styled.button`
  position: absolute; top: 14px; right: 14px; width: 30px; height: 30px;
  display: grid; place-items: center; font-size: 20px; line-height: 1;
  color: ${C.mutedSoft}; background: transparent; border: none; border-radius: 8px; cursor: pointer;
  &:hover { background: ${C.paper2}; color: ${C.ink}; }
`;
const IconBadge = styled.div`
  width: 46px; height: 46px; margin-bottom: 14px; display: grid; place-items: center; border-radius: 13px;
  background: rgba(164,255,17,0.16); border: 1px solid rgba(164,255,17,0.4);
`;
const Section = styled.div`
  margin-top: 18px;
  display: flex; flex-direction: column; gap: 7px;
  .lbl { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.mutedSoft}; }
  .lbl .count { color: ${C.muted}; }
  .hint { font-size: 11.5px; color: ${C.mutedSoft}; }
  .keyrow {
    display: flex; align-items: center; gap: 8px;
    background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 10px; padding: 6px 6px 6px 12px;
  }
  .keyrow code { flex: 1; min-width: 0; font-family: ui-monospace,'SF Mono',Menlo,monospace; font-size: 12px; color: ${C.ink}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .keyrow button {
    flex-shrink: 0; font-size: 12px; font-weight: 600; color: ${C.ink}; background: ${C.paper};
    border: 1px solid ${C.line}; border-radius: 8px; padding: 6px 12px; cursor: pointer;
    &:hover:not(:disabled) { background: ${C.paper2}; border-color: ${C.lineDark}; }
    &:disabled { opacity: 0.6; cursor: default; }
  }
  .promoterow { display: flex; gap: 8px; }
  .promoterow input {
    flex: 1; min-width: 0; font-family: ui-monospace,'SF Mono',Menlo,monospace; font-size: 12.5px; color: ${C.ink};
    background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 10px; padding: 9px 12px; outline: none;
    &::placeholder { color: ${C.mutedSoft}; font-family: -apple-system, sans-serif; }
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 4px rgba(164,255,17,0.18); }
    &:disabled { opacity: 0.6; }
  }
`;
const ModList = styled.ul`
  list-style: none; margin: 0; padding: 0;
  border: 1px solid ${C.line}; border-radius: 11px; overflow: hidden;
  li {
    display: flex; align-items: center; gap: 8px; padding: 9px 11px;
    &:not(:last-child) { border-bottom: 1px solid ${C.line}; }
  }
  li.empty { color: ${C.mutedSoft}; font-size: 12.5px; justify-content: center; }
  li code { flex: 1; min-width: 0; font-family: ui-monospace,'SF Mono',Menlo,monospace; font-size: 12px; color: ${C.ink}; }
  li .you { font-size: 10.5px; font-weight: 600; color: ${C.greenInk}; background: rgba(164,255,17,0.14); padding: 2px 7px; border-radius: 999px; }
  li .demote {
    flex-shrink: 0; font-size: 12px; font-weight: 600; color: ${C.danger};
    background: rgba(210,59,47,0.06); border: 1px solid rgba(210,59,47,0.25); border-radius: 8px; padding: 5px 10px; cursor: pointer;
    &:hover:not(:disabled) { background: rgba(210,59,47,0.12); }
    &:disabled { opacity: 0.45; cursor: default; }
  }
`;
const PrimaryBtn = styled.button`
  flex-shrink: 0; font-size: 13px; font-weight: 600; padding: 0 16px; border-radius: 10px; cursor: pointer;
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
  &:hover:not(:disabled) { background: ${C.greenHover}; box-shadow: 0 8px 22px rgba(164,255,17,0.4); }
  &:disabled { opacity: 0.6; cursor: default; }
`;
const SecondaryBtn = styled.button`
  font-size: 13px; font-weight: 600; padding: 9px 14px; border-radius: 10px; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  &:hover:not(:disabled) { background: ${C.paper2}; }
  &:disabled { opacity: 0.6; cursor: default; }
`;
const ErrorLine = styled.div`margin-top: 14px; font-size: 12.5px; color: ${C.danger};`;
const DangerZone = styled.div`
  margin-top: 22px; padding-top: 16px; border-top: 1px solid ${C.line};
  .confirm { display: flex; flex-direction: column; gap: 10px; }
  .confirm span { font-size: 13px; color: ${C.ink}; }
  .confirm .row { display: flex; gap: 8px; justify-content: flex-end; }
`;
const DangerBtn = styled.button`
  font-size: 13px; font-weight: 600; padding: 9px 16px; border-radius: 10px; cursor: pointer;
  color: ${C.danger}; background: rgba(210,59,47,0.06); border: 1px solid rgba(210,59,47,0.3);
  &:hover:not(:disabled) { background: rgba(210,59,47,0.12); }
  &:disabled { opacity: 0.6; cursor: default; }
`;
