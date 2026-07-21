import React, { useState } from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import type { UseWorkspaceReturn } from '../hooks/useWorkspace';
import type { RoomView } from '../hooks/useLobby';
import { describeError } from '../utils/errors';

interface Props {
  ws: UseWorkspaceReturn;
}

// Room-status -> lobby copy. `Active` only means "linked to a context", not
// "game started" (that's ws.started, surfaced by RoomGate) - label it as
// open-to-join so it isn't read as already-in-progress.
const STATUS_LABEL: Record<RoomView['status'], string> = {
  Pending: 'Setting up…',
  Active: 'Open',
  Finished: 'Finished',
};

/**
 * SCAFFOLD-OWNED lobby: create-match form + match list, mirrors multi's
 * UnitRail structure. A row with `context_id: null` is an orphaned Pending
 * entry (a crashed create between registering the room and linking its
 * context - see useRooms.createRoom) and has no match to join yet, so it
 * renders disabled rather than clickable.
 */
export default function RoomList({ ws }: Props): React.ReactElement {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const id = await ws.createRoom(trimmed);
      if (id) { setName(''); setCreating(false); }
    } catch {
      // ws.error now holds the failure (rendered below) - keep the form open
      // with the typed name so the user can just retry.
    } finally {
      setSubmitting(false);
    }
  };

  const enter = async (contextId: string) => {
    ws.selectRoom(contextId);
    try {
      await ws.joinRoom(contextId);
    } catch {
      // ws.error now holds the failure (rendered below); ws.joinPhase flips to
      // 'failed', which RoomGate/joinable both treat as retryable, not busy.
    }
  };

  // Only the genuinely in-flight phases block a click - 'failed' must stay
  // clickable or a rejected join (e.g. a restricted room you're not in)
  // permanently disables every row with no way to retry.
  const busy = ws.joinPhase === 'connecting' || ws.joinPhase === 'joining' || ws.joinPhase === 'syncing';

  return (
    <Wrap data-testid="room-list">
      <Head>
        <span className="title">Open &amp; Recent Matches</span>
        <AddBtn data-testid="create-room-btn" aria-label="New match" onClick={() => setCreating((v) => !v)}>+</AddBtn>
      </Head>
      {creating && (
        <CreateForm onSubmit={submit}>
          <input
            data-testid="field-room-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Match name"
            maxLength={64}
            aria-label="Match name"
          />
          <button data-testid="room-create-submit" type="submit" disabled={!name.trim() || submitting}>
            {submitting ? '…' : 'Open match'}
          </button>
        </CreateForm>
      )}
      {ws.error && <ErrLine role="alert">{describeError(ws.error)}</ErrLine>}
      <List>
        {ws.rooms.length === 0 && !ws.roomsLoading && <Empty>No matches yet - open the first one above.</Empty>}
        {ws.rooms.map((room) => {
          const joinable = room.context_id !== null && !busy;
          return (
            <RoomBtn
              key={room.id}
              data-testid="room-list-item"
              disabled={!joinable}
              onClick={() => joinable && void enter(room.context_id as string)}
              title={room.name}
            >
              <span className="name">{room.name}</span>
              <Badge $status={room.status}>{STATUS_LABEL[room.status]}</Badge>
            </RoomBtn>
          );
        })}
      </List>
    </Wrap>
  );
}

const Wrap = styled.div`display: flex; flex-direction: column; gap: 12px;`;
const Head = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  .title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: ${C.muted}; }
`;
const AddBtn = styled.button`
  width: 28px; height: 28px; border-radius: 8px; font-size: 18px; line-height: 1; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  &:hover { border-color: ${C.green}; background: ${C.paper2}; }
`;
const CreateForm = styled.form`
  display: flex; gap: 8px;
  input { flex: 1; min-width: 0; padding: 10px 12px; font-size: 14px; color: ${C.ink}; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 10px; outline: none; &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); } }
  button { padding: 10px 16px; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c; &:disabled { opacity: 0.55; cursor: default; } }
`;
const List = styled.div`display: flex; flex-direction: column; gap: 10px;`;
const Empty = styled.p`font-size: 14px; color: ${C.mutedSoft}; padding: 8px 2px;`;
const ErrLine = styled.p`margin: 0; font-size: 13px; color: ${C.danger};`;
const RoomBtn = styled.button`
  display: flex; align-items: center; justify-content: space-between; gap: 12px; text-align: left; width: 100%;
  padding: 14px 16px; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 12px; cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  .name { font-size: 15px; font-weight: 600; color: ${C.ink}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &:hover:not(:disabled) { border-color: ${C.green}; background: ${C.paper}; }
  &:disabled { cursor: default; opacity: 0.6; }
`;
const Badge = styled.span<{ $status: RoomView['status'] }>`
  flex-shrink: 0; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700;
  padding: 3px 9px; border-radius: 999px;
  color: ${(p) => (p.$status === 'Finished' ? C.mutedSoft : C.greenInk)};
  background: ${(p) => (p.$status === 'Finished' ? C.paper : 'rgba(164,255,17,0.16)')};
  border: 1px solid ${(p) => (p.$status === 'Finished' ? C.line : 'rgba(164,255,17,0.4)')};
`;
