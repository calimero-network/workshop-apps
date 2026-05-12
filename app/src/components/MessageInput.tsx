import React, { useState, useCallback } from 'react';

interface MessageInputProps {
  onSend: (body: string) => Promise<void>;
}

export default function MessageInput({ onSend }: MessageInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return;

    setSending(true);
    try {
      await onSend(body);
      setText('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  }, [text, sending, onSend]);

  return (
    <div style={{
      padding: '0.75rem 1rem',
      borderTop: '1px solid #2a2a2a',
      display: 'flex',
      gap: '0.5rem',
    }}>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder="Type a message..."
        disabled={sending}
        style={{
          flex: 1,
          padding: '0.6rem 0.75rem',
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 8,
          color: '#eee',
          fontSize: '0.9rem',
          outline: 'none',
        }}
      />
      <button
        onClick={handleSend}
        disabled={sending || !text.trim()}
        style={{
          padding: '0.6rem 1.2rem',
          background: text.trim() ? '#2563eb' : '#333',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: text.trim() ? 'pointer' : 'default',
          fontSize: '0.9rem',
        }}
      >
        Send
      </button>
    </div>
  );
}
