import React, { useState, useCallback } from 'react';

interface MessageInputProps {
  onSend: (text: string) => Promise<void>;
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
      console.error('Failed to post message:', err);
    } finally {
      setSending(false);
    }
  }, [text, sending, onSend]);

  const hasText = text.trim().length > 0;

  return (
    <div style={{
      padding: '0.6rem 0.75rem',
      borderTop: '1px solid #2a1e3a',
      display: 'flex',
      gap: '0.5rem',
      background: 'var(--color-primary, #1a1a2e)',
      flexShrink: 0,
    }}>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
          }
        }}
        placeholder="Speak your action… (Enter to send)"
        disabled={sending}
        style={{
          flex: 1,
          padding: '0.55rem 0.75rem',
          background: '#0b0b18',
          border: '1px solid #334155',
          borderRadius: 6,
          color: '#e2e8f0',
          fontSize: '0.9rem',
          outline: 'none',
        }}
      />
      <button
        onClick={handleSend}
        disabled={sending || !hasText}
        style={{
          padding: '0.55rem 1rem',
          background: hasText && !sending ? 'var(--color-accent, #d4af37)' : '#1e293b',
          color: hasText && !sending ? '#0d0d1a' : '#64748b',
          border: 'none',
          borderRadius: 6,
          cursor: hasText && !sending ? 'pointer' : 'default',
          fontSize: '0.88rem',
          fontWeight: 700,
          transition: 'background 0.15s',
        }}
      >
        Send
      </button>
    </div>
  );
}
