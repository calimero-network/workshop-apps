import React, { useRef, useEffect } from 'react';
import { useChatRoom } from '../hooks/useChatRoom';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';

interface ChatViewProps {
  contextId: string;
  executorPublicKey: string | null;
  /** Map of identity → display name for labelling message authors. */
  memberNames: Record<string, string>;
  conversationAlias?: string;
}

function shortenKey(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

/** Full-height chat view: scrollable message list + compose box. */
export default function RoomView({
  contextId,
  executorPublicKey,
  memberNames,
  conversationAlias,
}: ChatViewProps) {
  const chat = useChatRoom(contextId, executorPublicKey);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1.25rem',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        background: '#0f172a',
      }}>
        <div style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: 'var(--color-accent, #10B981)',
          flexShrink: 0,
        }} />
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>
            {conversationAlias || 'Conversation'}
          </h3>
          <span style={{ color: '#64748b', fontSize: '0.72rem' }}>
            {chat.messages.length} message{chat.messages.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}>
        {chat.loading && chat.messages.length === 0 && (
          <div style={{ color: '#475569', textAlign: 'center', padding: '3rem 1rem', fontSize: '0.9rem' }}>
            Loading messages…
          </div>
        )}
        {!chat.loading && chat.messages.length === 0 && (
          <div style={{
            color: '#475569',
            textAlign: 'center',
            padding: '3rem 1rem',
            fontSize: '0.9rem',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💬</div>
            No messages yet — say hello!
          </div>
        )}
        {chat.error && (
          <div style={{ color: '#ef4444', fontSize: '0.8rem', textAlign: 'center' }}>
            {chat.error.message}
          </div>
        )}
        {chat.messages.map((msg) => {
          const isSelf = msg.author === (chat.chatExecutorKey ?? executorPublicKey);
          const authorLabel = memberNames[msg.author] || shortenKey(msg.author);
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              isSelf={isSelf}
              authorLabel={isSelf ? 'You' : authorLabel}
              onEdit={(newBody) => chat.editMessage(msg.id, newBody)}
              onDelete={() => chat.deleteMessage(msg.id)}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose */}
      <MessageInput onSend={chat.sendMessage} />
    </div>
  );
}
