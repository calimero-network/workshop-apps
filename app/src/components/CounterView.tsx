import React, { useState } from 'react';
import type { Counter } from '../api/counter/CounterClient';

interface CounterViewProps {
  counter: Counter | null;
  loading: boolean;
  error: Error | null;
  onIncrement: () => Promise<void>;
  onReset: () => Promise<void>;
  /** The current user's executor key for this context, compared to counter.creator
   *  to decide whether to show the reset button. */
  currentExecutorKey: string | null;
}

function shortenId(id: string): string {
  if (!id || id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function formatTimestamp(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function CounterView({
  counter,
  loading,
  error,
  onIncrement,
  onReset,
  currentExecutorKey,
}: CounterViewProps) {
  const [incrementing, setIncrementing] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleIncrement = async () => {
    if (incrementing) return;
    setIncrementing(true);
    try { await onIncrement(); } finally { setIncrementing(false); }
  };

  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    try { await onReset(); } finally { setResetting(false); }
  };

  const isCreator = counter && currentExecutorKey && counter.creator === currentExecutorKey;

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '2rem',
      padding: '2rem',
    }}>
      {/* App title */}
      <h1 style={{
        fontSize: '1.5rem',
        fontWeight: 700,
        color: 'var(--color-primary, #3B82F6)',
        letterSpacing: '-0.02em',
        margin: 0,
      }}>
        Shared Counter
      </h1>

      {/* Counter value */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        <div
          data-testid="counter-value"
          style={{
            fontSize: '7rem',
            fontWeight: 800,
            lineHeight: 1,
            color: '#f1f5f9',
            fontVariantNumeric: 'tabular-nums',
            minWidth: '3ch',
            textAlign: 'center',
          }}
        >
          {loading && counter === null ? '…' : (counter?.total ?? 0)}
        </div>

        {error && (
          <p style={{ color: '#f87171', fontSize: '0.8rem', margin: 0 }}>
            {error.message}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button
          data-testid="increment-button"
          onClick={handleIncrement}
          disabled={incrementing || !counter}
          style={{
            padding: '0.75rem 2.5rem',
            background: 'var(--color-primary, #3B82F6)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: '1.1rem',
            fontWeight: 700,
            cursor: incrementing || !counter ? 'default' : 'pointer',
            opacity: incrementing || !counter ? 0.6 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {incrementing ? '+…' : '+ Increment'}
        </button>

        {isCreator && (
          <button
            data-testid="reset-button"
            onClick={handleReset}
            disabled={resetting}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'transparent',
              color: '#f87171',
              border: '1px solid #f87171',
              borderRadius: 10,
              fontSize: '1rem',
              fontWeight: 600,
              cursor: resetting ? 'default' : 'pointer',
              opacity: resetting ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {resetting ? 'Resetting…' : 'Reset'}
          </button>
        )}
      </div>

      {/* Last activity */}
      {counter && (counter.last_incremented_by || counter.last_increment_at) && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.25rem',
          padding: '0.75rem 1.5rem',
          background: '#0f172a',
          borderRadius: 10,
          border: '1px solid #1e293b',
          minWidth: 280,
          textAlign: 'center',
        }}>
          <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Last increment
          </span>
          {counter.last_incremented_by && (
            <span
              data-testid="last-by"
              style={{ fontSize: '0.85rem', color: '#93c5fd', fontFamily: 'monospace' }}
              title={counter.last_incremented_by}
            >
              by {shortenId(counter.last_incremented_by)}
            </span>
          )}
          {counter.last_increment_at > 0 && (
            <span
              data-testid="last-at"
              style={{ fontSize: '0.78rem', color: '#64748b' }}
            >
              {formatTimestamp(counter.last_increment_at)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
