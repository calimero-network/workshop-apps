import React, { useRef, useEffect, useState } from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import { useChatRoom } from '../hooks/useChatRoom';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import ModerationModal from './ModerationModal';

interface RoomViewProps {
  contextId: string;
  executorPublicKey: string | null;
  onRoomDeleted?: () => void;
}


export default function RoomView({ contextId, executorPublicKey, onRoomDeleted }: RoomViewProps) {
  const room = useChatRoom(contextId, executorPublicKey);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [modOpen, setModOpen] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room.messages]);

  return (
    <Root>
      {/* Room header */}
      <Header>
        <div className="title">
          <h3># {room.roomName || 'Loading…'}</h3>
          <span className="count">{room.messageCount} message{room.messageCount !== 1 ? 's' : ''}</span>
        </div>
        <ModToggle onClick={() => setModOpen(true)} aria-label="Moderation">Moderation</ModToggle>
      </Header>

      {/* Messages */}
      <Messages>
        {room.loading && room.messages.length === 0 && (
          <Placeholder>Loading messages…</Placeholder>
        )}
        {!room.loading && room.messages.length === 0 && (
          <Placeholder>No messages yet. Start the conversation!</Placeholder>
        )}
        {room.messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isSelf={msg.sender === executorPublicKey}
            contextId={contextId}
            onEdit={(newBody) => room.editMessage(msg.id, newBody)}
            onDelete={() => room.deleteMessage(msg.id)}
          />
        ))}
        <div ref={messagesEndRef} />
      </Messages>

      {/* Input */}
      <MessageInput
        key={contextId}
        onSend={room.sendMessage}
        onSendAttachment={room.sendAttachment}
        loadDraft={room.loadDraft}
        saveDraft={room.saveDraft}
      />

      {modOpen && (
        <ModerationModal
          roomName={room.roomName || 'room'}
          myRoomKey={room.roomExecutorKey}
          moderators={room.moderators}
          onRename={room.renameRoom}
          onPromote={room.addModerator}
          onDemote={room.removeModerator}
          onDelete={async () => { await room.deleteRoom(); onRoomDeleted?.(); }}
          onClose={() => setModOpen(false)}
        />
      )}
    </Root>
  );
}

/* ── styles ── */
const Root = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: ${C.paper2};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`;
const Header = styled.div`
  padding: 12px 18px;
  border-bottom: 1px solid ${C.line};
  background: ${C.paper};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  .title h3 { font-size: 16px; font-weight: 800; letter-spacing: -0.4px; color: ${C.ink}; margin: 0; }
  .title .count { font-size: 12px; color: ${C.mutedSoft}; }
`;
const ModToggle = styled.button`
  font-size: 13px;
  font-weight: 600;
  padding: 7px 13px;
  border-radius: 9px;
  cursor: pointer;
  color: ${C.ink};
  background: ${C.paper};
  border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: ${C.paper2}; border-color: rgba(164,255,17,0.5); color: ${C.greenInk}; }
`;
const Messages = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;
const Placeholder = styled.div`
  margin: auto;
  text-align: center;
  color: ${C.mutedSoft};
  font-size: 13.5px;
`;
