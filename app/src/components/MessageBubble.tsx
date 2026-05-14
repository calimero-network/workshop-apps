import React from 'react';
import { TableEvent } from '../api/table/TableClient';

interface MessageBubbleProps {
  event: TableEvent;
  isSelf: boolean;
}

function formatTime(timestampMs: number): string {
  const d = new Date(timestampMs);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function shortenKey(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

/** Map event_type to a display label, icon, and bubble colour. */
function eventStyle(type: string): { icon: string; bg: string; border: string; color: string } {
  switch (type) {
    case 'roll':
      return { icon: '🎲', bg: '#1a1a2e', border: '#7c3aed', color: '#c4b5fd' };
    case 'npc_roll':
      return { icon: '👹', bg: '#1a0d0d', border: '#dc2626', color: '#fca5a5' };
    case 'hp_change':
      return { icon: '❤️', bg: '#0d1a0d', border: '#16a34a', color: '#86efac' };
    case 'system':
      return { icon: '📜', bg: '#1a1500', border: '#d4af37', color: '#fde68a' };
    default: // 'message'
      return { icon: '', bg: '', border: '', color: '' };
  }
}

export default function MessageBubble({ event, isSelf }: MessageBubbleProps) {
  const style = eventStyle(event.event_type);
  const isGameEvent = event.event_type !== 'message';

  if (isGameEvent) {
    // Game events are rendered full-width in the log (not chat-bubbles)
    return (
      <div
        data-testid={`event-${event.event_type}-${event.id}`}
        style={{
          padding: '0.5rem 0.75rem',
          borderRadius: 6,
          border: `1px solid ${style.border}`,
          background: style.bg,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.15rem',
          alignSelf: 'stretch',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: style.color }}>
            {style.icon} {event.event_type.replace('_', ' ').toUpperCase()}
          </span>
          <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
            {formatTime(event.timestamp)}
          </span>
        </div>
        <div style={{ fontSize: '0.875rem', color: '#e2e8f0', lineHeight: 1.5 }}>
          {event.content}
        </div>
        {event.d20_roll != null && (
          <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.1rem' }}>
            <span>d20: <strong style={{ color: style.color }}>{event.d20_roll}</strong></span>
            {event.modifier != null && (
              <span>mod: <strong style={{ color: style.color }}>{event.modifier >= 0 ? '+' : ''}{event.modifier}</strong></span>
            )}
            {event.total != null && (
              <span>total: <strong style={{ color: '#fff', fontSize: '0.85rem' }}>{event.total}</strong></span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Chat messages — standard bubble layout
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isSelf ? 'flex-end' : 'flex-start',
      maxWidth: '72%',
      alignSelf: isSelf ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        fontSize: '0.68rem',
        color: '#64748b',
        marginBottom: 2,
        display: 'flex',
        gap: '0.4rem',
        flexDirection: isSelf ? 'row-reverse' : 'row',
      }}>
        <span>{shortenKey(event.author)}</span>
        <span>{formatTime(event.timestamp)}</span>
      </div>
      <div style={{
        background: isSelf ? 'var(--color-primary, #1a1a2e)' : '#1e1e2e',
        border: isSelf
          ? '1px solid var(--color-accent, #d4af37)'
          : '1px solid #334155',
        padding: '0.45rem 0.7rem',
        borderRadius: isSelf ? '10px 2px 10px 10px' : '2px 10px 10px 10px',
        fontSize: '0.88rem',
        lineHeight: 1.45,
        wordBreak: 'break-word',
        color: '#e2e8f0',
      }}>
        {event.content}
      </div>
    </div>
  );
}
