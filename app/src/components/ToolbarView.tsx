import React from 'react';
import type { ActiveTool } from './CanvasView';

interface ToolbarViewProps {
  activeTool: ActiveTool;
  activeColor: string;
  canClear: boolean;
  onToolChange: (tool: ActiveTool) => void;
  onColorChange: (color: string) => void;
  onClearCanvas: () => void;
  onInvite: () => void;
}

const TOOLS: { id: ActiveTool; label: string; title: string }[] = [
  { id: 'select', label: '↖', title: 'Select / Move' },
  { id: 'rect',   label: '▭', title: 'Rectangle' },
  { id: 'circle', label: '○', title: 'Ellipse' },
  { id: 'line',   label: '╱', title: 'Line' },
  { id: 'text',   label: 'T', title: 'Text' },
];

const PRESET_COLORS = [
  '#7C3AED', // primary purple
  '#EC4899', // accent pink
  '#3B82F6', // blue
  '#22C55E', // green
  '#F97316', // orange
  '#F43F5E', // red
  '#06B6D4', // cyan
  '#EAB308', // yellow
  '#1F2937', // dark
  '#F1F5F9', // light
];

export default function ToolbarView({
  activeTool,
  activeColor,
  canClear,
  onToolChange,
  onColorChange,
  onClearCanvas,
  onInvite,
}: ToolbarViewProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.5rem 0.75rem',
      background: '#0f172a',
      borderBottom: '1px solid #1e293b',
      flexWrap: 'wrap',
    }}>
      {/* Drawing tools */}
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            title={t.title}
            onClick={() => onToolChange(t.id)}
            style={{
              width: 36,
              height: 36,
              border: activeTool === t.id
                ? '2px solid var(--color-primary)'
                : '1px solid #334155',
              borderRadius: 6,
              background: activeTool === t.id ? 'rgba(124,58,237,0.2)' : '#1e293b',
              color: activeTool === t.id ? 'var(--color-primary)' : '#94a3b8',
              cursor: 'pointer',
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.1s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 28, background: '#1e293b', flexShrink: 0 }} />

      {/* Color presets */}
      <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {PRESET_COLORS.map((c) => (
          <div
            key={c}
            onClick={() => onColorChange(c)}
            title={c}
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: c,
              cursor: 'pointer',
              border: activeColor === c
                ? '2px solid #fff'
                : '2px solid transparent',
              outline: activeColor === c ? '1px solid var(--color-primary)' : 'none',
              flexShrink: 0,
            }}
          />
        ))}
        {/* Custom color via native picker */}
        <label title="Custom color" style={{ position: 'relative', cursor: 'pointer' }}>
          <div style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: 'conic-gradient(red, yellow, green, cyan, blue, magenta, red)',
            border: '2px solid #334155',
            flexShrink: 0,
          }} />
          <input
            type="color"
            value={activeColor}
            onChange={(e) => onColorChange(e.target.value)}
            style={{
              position: 'absolute',
              opacity: 0,
              width: '100%',
              height: '100%',
              top: 0,
              left: 0,
              cursor: 'pointer',
            }}
          />
        </label>
      </div>

      {/* Current color swatch */}
      <div style={{
        width: 28,
        height: 28,
        borderRadius: 4,
        background: activeColor,
        border: '1px solid #334155',
        flexShrink: 0,
      }} />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Invite */}
      <button
        onClick={onInvite}
        style={{
          padding: '0.35rem 0.75rem',
          background: '#1e293b',
          color: '#94a3b8',
          border: '1px solid #334155',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: '0.82rem',
        }}
      >
        Invite
      </button>

      {/* Clear canvas */}
      {canClear && (
        <button
          onClick={() => {
            if (window.confirm('Clear the entire canvas? This removes all shapes, text, and comments for everyone.')) {
              onClearCanvas();
            }
          }}
          style={{
            padding: '0.35rem 0.75rem',
            background: '#3a1414',
            color: '#f0a8a8',
            border: '1px solid #6a2828',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.82rem',
          }}
        >
          Clear canvas
        </button>
      )}
    </div>
  );
}
