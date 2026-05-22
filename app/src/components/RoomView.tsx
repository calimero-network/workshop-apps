import React, { useRef, useEffect, useState } from 'react';
import { useChatRoom } from '../hooks/useChatRoom';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';

interface RoomViewProps {
  contextId: string;
  executorPublicKey: string | null;
  onRoomDeleted?: () => void;
}

export default function RoomView({ contextId, executorPublicKey, onRoomDeleted }: RoomViewProps) {
  const room = useChatRoom(contextId, executorPublicKey);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [modOpen, setModOpen] = useState(false);
  const [modKey, setModKey] = useState('');
  const [modError, setModError] = useState<string | null>(null);
  const [modBusy, setModBusy] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room.messages]);

  const handleDelete = async () => {
    setModError(null);
    setModBusy(true);
    try {
      await room.deleteRoom();
      onRoomDeleted?.();
    } catch (err) {
      setModError(err instanceof Error ? err.message : String(err));
    } finally {
      setModBusy(false);
    }
  };

  const handlePromote = async () => {
    if (!modKey.trim()) return;
    setModError(null);
    setModBusy(true);
    try {
      await room.addModerator(modKey.trim());
      setModKey('');
    } catch (err) {
      setModError(err instanceof Error ? err.message : String(err));
    } finally {
      setModBusy(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Room header */}
      <div style={{
        padding: '0.75rem 1rem',
        borderBottom: '1px solid #2a2a2a',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <h3 style={{ fontSize: '1rem' }}>
            # {room.roomName || 'Loading...'}
          </h3>
          <span style={{ color: '#888', fontSize: '0.75rem' }}>
            {room.messageCount} message{room.messageCount !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => setModOpen((v) => !v)}
          aria-label="Moderation"
          style={{
            background: 'transparent',
            color: '#aaa',
            border: '1px solid #333',
            borderRadius: 4,
            padding: '0.25rem 0.5rem',
            cursor: 'pointer',
          }}
        >
          Moderation
        </button>
      </div>

      {modOpen && (
        <div data-testid="moderation-panel" style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid #2a2a2a',
          background: '#161616',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#888' }}>
            Your room key:&nbsp;
            <code data-testid="my-room-key" style={{ color: '#ddd' }}>
              {room.roomExecutorKey ?? '...'}
            </code>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={modKey}
              onChange={(e) => setModKey(e.target.value)}
              placeholder="Paste room key to promote"
              data-testid="promote-key-input"
              style={{
                flex: 1,
                background: '#0e0e0e',
                color: '#ddd',
                border: '1px solid #333',
                borderRadius: 4,
                padding: '0.25rem 0.5rem',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
              }}
            />
            <button
              onClick={handlePromote}
              disabled={modBusy || !modKey.trim()}
              data-testid="promote-button"
            >
              Promote
            </button>
          </div>
          <div>
            <button
              onClick={handleDelete}
              disabled={modBusy}
              data-testid="delete-room-button"
              style={{
                background: '#3a1414',
                color: '#f0a8a8',
                border: '1px solid #6a2828',
              }}
            >
              Delete room
            </button>
          </div>
          {modError && (
            <div data-testid="moderation-error" style={{ color: '#f08080', fontSize: '0.75rem' }}>
              {modError}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}>
        {room.loading && room.messages.length === 0 && (
          <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
            Loading messages...
          </div>
        )}
        {!room.loading && room.messages.length === 0 && (
          <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
            No messages yet. Start the conversation!
          </div>
        )}
        {room.messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isSelf={msg.sender === executorPublicKey}
            onEdit={(newBody) => room.editMessage(msg.id, newBody)}
            onDelete={() => room.deleteMessage(msg.id)}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <MessageInput onSend={room.sendMessage} />
    </div>
  );
}
