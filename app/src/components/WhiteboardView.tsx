import React, { useCallback, useRef, useState } from 'react';
import { useWhiteboardCanvas } from '../hooks/useWhiteboardCanvas';
import type { Shape } from '../api/whiteboard/WhiteboardClient';

interface WhiteboardViewProps {
  contextId: string;
  projectName: string;
  executorPublicKey: string | null;
}

type ShapeType = 'rectangle' | 'circle' | 'text';

const TOOLBAR_TOOLS: { type: ShapeType; label: string }[] = [
  { type: 'rectangle', label: '▭  Rectangle' },
  { type: 'circle',    label: '◯  Circle'    },
  { type: 'text',      label: 'T  Text'      },
];

const DEFAULT_COLORS = ['#5B21B6', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#fff', '#1e1e3f'];

interface DragState {
  shapeId: string;
  startMouseX: number;
  startMouseY: number;
  origX: number;
  origY: number;
}

export default function WhiteboardView({ contextId, projectName, executorPublicKey }: WhiteboardViewProps) {
  const canvas = useWhiteboardCanvas(contextId, executorPublicKey);

  // Active tool (null = select mode)
  const [activeTool, setActiveTool] = useState<ShapeType | null>(null);
  // Selected shape for editing
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Drag tracking
  const dragRef = useRef<DragState | null>(null);
  // Optimistic positions during drag (key: shapeId → {x, y})
  const [dragPos, setDragPos] = useState<Record<string, { x: number; y: number }>>({});
  // Edit panel draft values
  const [draftColor, setDraftColor] = useState('#5B21B6');
  const [draftWidth, setDraftWidth] = useState(120);
  const [draftHeight, setDraftHeight] = useState(80);
  // Adding shape state
  const [addingColor, setAddingColor] = useState('#5B21B6');

  const svgRef = useRef<SVGSVGElement>(null);

  const selectedShape = canvas.shapes.find((s) => s.id === selectedId) ?? null;

  // ── Select a shape ─────────────────────────────────────────────────────────
  const handleShapeClick = useCallback((e: React.MouseEvent, shape: Shape) => {
    e.stopPropagation();
    if (dragRef.current) return; // ignore click-end of a drag
    setSelectedId(shape.id);
    setDraftColor(shape.color);
    setDraftWidth(Math.round(shape.width));
    setDraftHeight(Math.round(shape.height));
    setActiveTool(null);
  }, []);

  // Deselect on canvas background click
  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dragRef.current) { dragRef.current = null; return; }
    if (activeTool) {
      // Add a new shape where the user clicked
      const rect = svgRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left - 60;
      const y = e.clientY - rect.top - 40;
      const w = activeTool === 'text' ? 140 : 120;
      const h = activeTool === 'text' ? 40 : 80;
      void canvas.addShape(activeTool, Math.max(0, x), Math.max(0, y), w, h, addingColor);
      setActiveTool(null);
    } else {
      setSelectedId(null);
    }
  }, [activeTool, addingColor, canvas]);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const handleShapeMouseDown = useCallback((e: React.MouseEvent, shape: Shape) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      shapeId: shape.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      origX: shape.x,
      origY: shape.y,
    };
    setSelectedId(shape.id);
    setDraftColor(shape.color);
    setDraftWidth(Math.round(shape.width));
    setDraftHeight(Math.round(shape.height));
    setActiveTool(null);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startMouseX;
    const dy = e.clientY - drag.startMouseY;
    setDragPos((prev) => ({
      ...prev,
      [drag.shapeId]: { x: Math.max(0, drag.origX + dx), y: Math.max(0, drag.origY + dy) },
    }));
  }, []);

  const handleMouseUp = useCallback(async (e: React.MouseEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const pos = dragPos[drag.shapeId];
    if (!pos) return;

    const shape = canvas.shapes.find((s) => s.id === drag.shapeId);
    if (!shape) return;

    setDragPos((prev) => { const n = { ...prev }; delete n[drag.shapeId]; return n; });

    const dx = e.clientX - drag.startMouseX;
    const dy = e.clientY - drag.startMouseY;
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return; // treat as click, not drag

    await canvas.updateShape(drag.shapeId, pos.x, pos.y, shape.width, shape.height, shape.color);
  }, [dragPos, canvas]);

  // ── Edit selected shape ────────────────────────────────────────────────────
  const commitEdit = useCallback(async () => {
    if (!selectedShape) return;
    await canvas.updateShape(
      selectedShape.id,
      selectedShape.x,
      selectedShape.y,
      draftWidth,
      draftHeight,
      draftColor,
    );
  }, [canvas, selectedShape, draftColor, draftWidth, draftHeight]);

  const handleDelete = useCallback(async () => {
    if (!selectedId) return;
    await canvas.deleteShape(selectedId);
    setSelectedId(null);
  }, [canvas, selectedId]);

  // ── Render a single shape ─────────────────────────────────────────────────
  const renderShape = useCallback((shape: Shape) => {
    const pos = dragPos[shape.id];
    const x = pos?.x ?? shape.x;
    const y = pos?.y ?? shape.y;
    const w = shape.width;
    const h = shape.height;
    const isSelected = shape.id === selectedId;
    const selStyle: React.SVGAttributes<SVGElement> = isSelected
      ? { stroke: 'var(--color-accent, #EC4899)', strokeWidth: 2 }
      : { stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 };

    const sharedProps = {
      onMouseDown: (e: React.MouseEvent) => handleShapeMouseDown(e, shape),
      onClick: (e: React.MouseEvent) => handleShapeClick(e, shape),
      style: { cursor: 'grab' } as React.CSSProperties,
    };

    if (shape.shape_type === 'circle') {
      const rx = w / 2;
      const ry = h / 2;
      return (
        <g key={shape.id}>
          <ellipse
            cx={x + rx} cy={y + ry} rx={rx} ry={ry}
            fill={shape.color} fillOpacity={0.85}
            {...selStyle} {...sharedProps}
          />
          {isSelected && (
            <ellipse cx={x + rx} cy={y + ry} rx={rx + 3} ry={ry + 3}
              fill="none" stroke="var(--color-accent, #EC4899)" strokeWidth={2} strokeDasharray="4 3"
              style={{ pointerEvents: 'none' }} />
          )}
        </g>
      );
    }

    if (shape.shape_type === 'text') {
      return (
        <g key={shape.id}>
          <rect x={x} y={y} width={w} height={h} fill="transparent"
            {...selStyle} {...sharedProps} rx={4} />
          <text x={x + 6} y={y + h / 2 + 5} fill={shape.color}
            fontSize={14} fontFamily="sans-serif"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            Text
          </text>
          {isSelected && (
            <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4}
              fill="none" stroke="var(--color-accent, #EC4899)" strokeWidth={2} strokeDasharray="4 3" rx={5}
              style={{ pointerEvents: 'none' }} />
          )}
        </g>
      );
    }

    // Default: rectangle
    return (
      <g key={shape.id}>
        <rect x={x} y={y} width={w} height={h}
          fill={shape.color} fillOpacity={0.85}
          {...selStyle} {...sharedProps} rx={6} />
        {isSelected && (
          <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4}
            fill="none" stroke="var(--color-accent, #EC4899)" strokeWidth={2} strokeDasharray="4 3" rx={7}
            style={{ pointerEvents: 'none' }} />
        )}
      </g>
    );
  }, [dragPos, selectedId, handleShapeMouseDown, handleShapeClick]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const panelStyle: React.CSSProperties = {
    width: 220, background: '#120d1f', borderLeft: '1px solid #2d2156',
    display: 'flex', flexDirection: 'column', padding: '0.75rem',
    gap: '0.75rem', overflowY: 'auto',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: '0.25rem',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#0f0f1e', border: '1px solid #3d3d6e',
    borderRadius: 5, color: '#e2e8f0', fontSize: '0.85rem',
    padding: '0.3rem 0.5rem', boxSizing: 'border-box',
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0.6rem 1rem', borderBottom: '1px solid #2d2156',
        display: 'flex', alignItems: 'center', gap: '1rem',
        background: '#120d1f',
      }}>
        <h3 style={{ fontSize: '0.95rem', color: '#e2e8f0', margin: 0 }}>{projectName}</h3>
        <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
          {canvas.shapes.length} shape{canvas.shapes.length !== 1 ? 's' : ''}
        </span>
        {canvas.loading && (
          <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: 'auto' }}>Syncing…</span>
        )}
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.5rem 1rem', borderBottom: '1px solid #2d2156',
        background: '#1a1030',
      }}>
        <span style={{ fontSize: '0.75rem', color: '#64748b', marginRight: '0.25rem' }}>Add:</span>
        {TOOLBAR_TOOLS.map((tool) => (
          <button
            key={tool.type}
            onClick={() => { setActiveTool(activeTool === tool.type ? null : tool.type); setSelectedId(null); }}
            title={`Add ${tool.type}`}
            style={{
              padding: '0.3rem 0.7rem', borderRadius: 6, fontSize: '0.8rem',
              background: activeTool === tool.type ? 'var(--color-primary, #5B21B6)' : '#2d2156',
              color: activeTool === tool.type ? '#fff' : '#94a3b8',
              border: activeTool === tool.type
                ? '1px solid var(--color-accent, #EC4899)'
                : '1px solid #3d3d6e',
              cursor: 'pointer',
            }}
          >
            {tool.label}
          </button>
        ))}
        {activeTool && (
          <>
            <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '0.5rem' }}>Color:</span>
            <input
              type="color"
              value={addingColor}
              onChange={(e) => setAddingColor(e.target.value)}
              style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--color-accent, #EC4899)' }}>
              Click on the canvas to place
            </span>
          </>
        )}
      </div>

      {/* Main area: canvas + right panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* SVG Canvas */}
        <svg
          ref={svgRef}
          style={{
            flex: 1, background: '#0f0a1e',
            cursor: activeTool ? 'crosshair' : 'default',
          }}
          onClick={handleSvgClick}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Grid dots */}
          <defs>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <circle cx="15" cy="15" r="0.8" fill="rgba(255,255,255,0.07)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {canvas.shapes.map(renderShape)}

          {canvas.shapes.length === 0 && !canvas.loading && (
            <text
              x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
              fill="rgba(255,255,255,0.15)" fontSize={16} fontFamily="sans-serif"
            >
              Select a shape from the toolbar and click to place it
            </text>
          )}
        </svg>

        {/* Right panel — appears when shape is selected */}
        {selectedShape && (
          <div style={panelStyle}>
            <div>
              <div style={{ ...labelStyle }}>Shape</div>
              <div style={{ color: '#c4b5fd', fontSize: '0.85rem', fontWeight: 600 }}>
                {selectedShape.shape_type.charAt(0).toUpperCase() + selectedShape.shape_type.slice(1)}
              </div>
            </div>

            <div>
              <div style={labelStyle}>Color</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {DEFAULT_COLORS.map((c) => (
                  <div
                    key={c}
                    onClick={() => setDraftColor(c)}
                    style={{
                      width: 18, height: 18, borderRadius: 4, background: c,
                      border: draftColor === c ? '2px solid var(--color-accent, #EC4899)' : '1px solid #3d3d6e',
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={draftColor}
                  onChange={(e) => setDraftColor(e.target.value)}
                  style={{ width: 22, height: 22, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                  title="Custom color"
                />
              </div>
            </div>

            <div>
              <div style={labelStyle}>Width</div>
              <input
                type="number"
                value={draftWidth}
                min={10}
                max={2000}
                onChange={(e) => setDraftWidth(Number(e.target.value))}
                style={inputStyle}
              />
            </div>

            <div>
              <div style={labelStyle}>Height</div>
              <input
                type="number"
                value={draftHeight}
                min={10}
                max={2000}
                onChange={(e) => setDraftHeight(Number(e.target.value))}
                style={inputStyle}
              />
            </div>

            <div>
              <div style={labelStyle}>Position</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                x: {Math.round(selectedShape.x)}, y: {Math.round(selectedShape.y)}
              </div>
            </div>

            <div>
              <div style={labelStyle}>Author</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', wordBreak: 'break-all' }}>
                {selectedShape.author.length > 20
                  ? `${selectedShape.author.slice(0, 10)}…${selectedShape.author.slice(-8)}`
                  : selectedShape.author}
              </div>
            </div>

            <button
              onClick={commitEdit}
              style={{
                padding: '0.4rem', background: 'var(--color-primary, #5B21B6)',
                color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: '0.82rem',
              }}
            >
              Apply Changes
            </button>

            <button
              onClick={handleDelete}
              style={{
                padding: '0.4rem', background: '#3a1414', color: '#fca5a5',
                border: '1px solid #6a2828', borderRadius: 6, cursor: 'pointer',
                fontSize: '0.82rem',
              }}
            >
              Delete Shape
            </button>
          </div>
        )}
      </div>

      {canvas.error && (
        <div style={{
          padding: '0.4rem 1rem', background: '#3a1414', color: '#fca5a5',
          fontSize: '0.78rem', borderTop: '1px solid #6a2828',
        }}>
          Error: {canvas.error.message}
        </div>
      )}
    </div>
  );
}
