import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { Shape, TextElement, Cursor, Comment } from '../hooks/useWhiteboardCanvas';

// ── Types ──────────────────────────────────────────────────────────────────

export type ActiveTool = 'select' | 'rect' | 'circle' | 'line' | 'text';

interface CanvasViewProps {
  shapes: Shape[];
  texts: TextElement[];
  cursors: Cursor[];
  selfUserId: string | null;
  activeTool: ActiveTool;
  activeColor: string;
  onAddShape: (
    shape_type: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ) => Promise<string>;
  onUpdateShapePosition: (shape_id: string, x: number, y: number) => Promise<void>;
  onDeleteShape: (shape_id: string) => Promise<void>;
  onAddText: (
    content: string,
    x: number,
    y: number,
    font_size: number,
    color: string,
  ) => Promise<string>;
  onUpdateText: (text_id: string, content: string) => Promise<void>;
  onDeleteText: (text_id: string) => Promise<void>;
  onAddComment: (target_id: string, body: string) => Promise<string>;
  onDeleteComment: (comment_id: string) => Promise<void>;
  onGetCommentsForTarget: (target_id: string) => Promise<Comment[]>;
  onUpdateCursor: (x: number, y: number) => Promise<void>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const CURSOR_COLORS = ['#EC4899', '#F97316', '#22C55E', '#06B6D4', '#A78BFA', '#F43F5E'];

function cursorColor(userId: string): string {
  let hash = 0;
  for (const c of userId) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

function shortenId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 5)}…${id.slice(-4)}`;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CanvasView({
  shapes,
  texts,
  cursors,
  selfUserId,
  activeTool,
  activeColor,
  onAddShape,
  onUpdateShapePosition,
  onDeleteShape,
  onAddText,
  onUpdateText,
  onDeleteText,
  onAddComment,
  onDeleteComment,
  onGetCommentsForTarget,
  onUpdateCursor,
}: CanvasViewProps) {
  // Pan / zoom
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Draw preview (rect/circle/line)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);

  // Panning state
  const panRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  // Shape drag state — track live position locally for smooth preview
  const dragRef = useRef<{
    shapeId: string;
    startCx: number;
    startCy: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ id: string; dx: number; dy: number } | null>(null);

  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'shape' | 'text' | null>(null);

  // Comments
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  // Inline text placement
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  // ── Coordinate helpers ─────────────────────────────────────────────────

  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom],
  );

  // ── Load comments on selection change ──────────────────────────────────

  useEffect(() => {
    if (!selectedId) { setComments([]); return; }
    setCommentLoading(true);
    onGetCommentsForTarget(selectedId)
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setCommentLoading(false));
  }, [selectedId, onGetCommentsForTarget]);

  // ── Wheel zoom ────────────────────────────────────────────────────────

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setZoom((z) => {
        const nz = Math.max(0.1, Math.min(8, z * factor));
        setPan((p) => ({
          x: mx - (mx - p.x) * (nz / z),
          y: my - (my - p.y) * (nz / z),
        }));
        return nz;
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // ── Mouse handlers ─────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Middle mouse or ctrl/meta: start pan
      if (e.button === 1 || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        panRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
        return;
      }

      const pos = toCanvas(e.clientX, e.clientY);

      if (activeTool === 'text') {
        setTextInput({ x: pos.x, y: pos.y, value: '' });
        return;
      }

      if (activeTool !== 'select') {
        // Start drawing — only if clicking on background or a non-interactive element
        const target = e.target as Element;
        const isBackground =
          target === svgRef.current ||
          target.getAttribute('data-bg') === 'true' ||
          target.tagName === 'svg';
        // Allow drawing on top of existing shapes when tool is active
        setDrawStart(pos);
        setDrawCurrent(pos);
        return;
      }

      // Select tool: click on background → deselect
      const target = e.target as Element;
      const isBackground =
        target === svgRef.current ||
        target.getAttribute('data-bg') === 'true' ||
        target.tagName === 'svg';
      if (isBackground) {
        setSelectedId(null);
        setSelectedType(null);
      }
    },
    [activeTool, pan, toCanvas],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const pos = toCanvas(e.clientX, e.clientY);
      void onUpdateCursor(pos.x, pos.y);

      // Panning
      if (panRef.current) {
        const dx = e.clientX - panRef.current.mx;
        const dy = e.clientY - panRef.current.my;
        setPan({ x: panRef.current.px + dx, y: panRef.current.py + dy });
        return;
      }

      // Shape drag preview
      if (dragRef.current) {
        const dx = pos.x - dragRef.current.startCx;
        const dy = pos.y - dragRef.current.startCy;
        setDragOffset({ id: dragRef.current.shapeId, dx, dy });
        return;
      }

      // Draw preview
      if (drawStart) setDrawCurrent(pos);
    },
    [toCanvas, onUpdateCursor, drawStart],
  );

  const handleMouseUp = useCallback(
    async (e: React.MouseEvent<SVGSVGElement>) => {
      panRef.current = null;

      // Finish shape drag
      if (dragRef.current) {
        const pos = toCanvas(e.clientX, e.clientY);
        const dx = pos.x - dragRef.current.startCx;
        const dy = pos.y - dragRef.current.startCy;
        const newX = dragRef.current.origX + dx;
        const newY = dragRef.current.origY + dy;
        const shapeId = dragRef.current.shapeId;
        dragRef.current = null;
        setDragOffset(null);
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          await onUpdateShapePosition(shapeId, newX, newY);
        }
        return;
      }

      // Finish draw
      if (drawStart && drawCurrent && activeTool !== 'select' && activeTool !== 'text') {
        const x0 = drawStart.x;
        const y0 = drawStart.y;
        const x1 = drawCurrent.x;
        const y1 = drawCurrent.y;
        const bx = Math.min(x0, x1);
        const by = Math.min(y0, y1);
        const bw = Math.abs(x1 - x0);
        const bh = Math.abs(y1 - y0);

        if (activeTool === 'line' ? (bw > 4 || bh > 4) : (bw > 4 && bh > 4)) {
          if (activeTool === 'rect') {
            await onAddShape('rect', bx, by, bw, bh, activeColor);
          } else if (activeTool === 'circle') {
            await onAddShape('circle', bx, by, bw, bh, activeColor);
          } else if (activeTool === 'line') {
            // Store as (startX, startY, deltaX, deltaY)
            await onAddShape('line', x0, y0, x1 - x0, y1 - y0, activeColor);
          }
        }
        setDrawStart(null);
        setDrawCurrent(null);
      }
    },
    [activeTool, drawStart, drawCurrent, toCanvas, onAddShape, onUpdateShapePosition, activeColor],
  );

  const handleMouseLeave = useCallback(() => {
    panRef.current = null;
    if (dragRef.current) {
      dragRef.current = null;
      setDragOffset(null);
    }
    if (drawStart) {
      setDrawStart(null);
      setDrawCurrent(null);
    }
  }, [drawStart]);

  // ── Shape interaction ─────────────────────────────────────────────────

  const handleShapeMouseDown = useCallback(
    (e: React.MouseEvent, shape: Shape) => {
      if (activeTool !== 'select') return; // let event bubble for drawing
      e.stopPropagation();
      setSelectedId(shape.id);
      setSelectedType('shape');
      const pos = toCanvas(e.clientX, e.clientY);
      dragRef.current = {
        shapeId: shape.id,
        startCx: pos.x,
        startCy: pos.y,
        origX: shape.x,
        origY: shape.y,
      };
    },
    [activeTool, toCanvas],
  );

  const handleTextMouseDown = useCallback(
    (e: React.MouseEvent, text: TextElement) => {
      if (activeTool !== 'select') return;
      e.stopPropagation();
      setSelectedId(text.id);
      setSelectedType('text');
    },
    [activeTool],
  );

  // ── Comment actions ───────────────────────────────────────────────────

  const reloadComments = useCallback(async (id: string) => {
    const updated = await onGetCommentsForTarget(id);
    setComments(updated);
  }, [onGetCommentsForTarget]);

  const handleAddComment = useCallback(async () => {
    if (!selectedId || !commentInput.trim()) return;
    await onAddComment(selectedId, commentInput.trim());
    setCommentInput('');
    await reloadComments(selectedId);
  }, [selectedId, commentInput, onAddComment, reloadComments]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    await onDeleteComment(commentId);
    if (selectedId) await reloadComments(selectedId);
  }, [selectedId, onDeleteComment, reloadComments]);

  // ── Text placement ────────────────────────────────────────────────────

  const commitText = useCallback(async () => {
    if (!textInput) return;
    const val = textInput.value.trim();
    if (val) await onAddText(val, textInput.x, textInput.y, 16, activeColor);
    setTextInput(null);
  }, [textInput, onAddText, activeColor]);

  // ── Render helpers ────────────────────────────────────────────────────

  const renderShapeEl = (shape: Shape) => {
    const isSelected = shape.id === selectedId;
    // Apply drag offset if this is the dragged shape
    const dx = dragOffset?.id === shape.id ? dragOffset.dx : 0;
    const dy = dragOffset?.id === shape.id ? dragOffset.dy : 0;
    const x = shape.x + dx;
    const y = shape.y + dy;

    const sel = {
      stroke: isSelected ? 'var(--color-accent)' : 'none',
      strokeWidth: isSelected ? 2 / zoom : 0,
    };

    const shared = {
      fill: shape.color,
      style: { cursor: activeTool === 'select' ? 'move' as const : 'crosshair' as const },
      onMouseDown: (e: React.MouseEvent) => handleShapeMouseDown(e, shape),
      ...sel,
    };

    if (shape.shape_type === 'rect') {
      return <rect key={shape.id} x={x} y={y} width={shape.width} height={shape.height} {...shared} />;
    }
    if (shape.shape_type === 'circle') {
      const rx = shape.width / 2;
      const ry = shape.height / 2;
      return (
        <ellipse
          key={shape.id}
          cx={x + rx} cy={y + ry}
          rx={Math.abs(rx)} ry={Math.abs(ry)}
          {...shared}
        />
      );
    }
    if (shape.shape_type === 'line') {
      return (
        <line
          key={shape.id}
          x1={x} y1={y}
          x2={x + shape.width} y2={y + shape.height}
          stroke={isSelected ? 'var(--color-accent)' : shape.color}
          strokeWidth={Math.max(2, 2 / zoom)}
          strokeLinecap="round"
          style={{ cursor: activeTool === 'select' ? 'pointer' : 'crosshair' }}
          onMouseDown={(e) => handleShapeMouseDown(e, shape)}
        />
      );
    }
    return null;
  };

  const renderDrawPreview = () => {
    if (!drawStart || !drawCurrent) return null;
    const x0 = drawStart.x, y0 = drawStart.y;
    const x1 = drawCurrent.x, y1 = drawCurrent.y;
    const bx = Math.min(x0, x1), by = Math.min(y0, y1);
    const bw = Math.abs(x1 - x0), bh = Math.abs(y1 - y0);
    const prev = { fill: activeColor, opacity: 0.5, pointerEvents: 'none' as const };

    if (activeTool === 'rect') return <rect x={bx} y={by} width={bw} height={bh} {...prev} />;
    if (activeTool === 'circle') {
      return (
        <ellipse cx={bx + bw / 2} cy={by + bh / 2} rx={bw / 2} ry={bh / 2} {...prev} />
      );
    }
    if (activeTool === 'line') {
      return (
        <line x1={x0} y1={y0} x2={x1} y2={y1}
          stroke={activeColor} strokeWidth={2 / zoom} strokeLinecap="round"
          opacity={0.7} pointerEvents="none" />
      );
    }
    return null;
  };

  // ── Compute text input screen position ────────────────────────────────

  const textInputScreenPos = (() => {
    if (!textInput || !svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: textInput.x * zoom + pan.x + rect.left,
      y: textInput.y * zoom + pan.y + rect.top,
    };
  })();

  const otherCursors = cursors.filter((c) => c.user_id !== selfUserId);

  const selectedShape = selectedId && selectedType === 'shape'
    ? shapes.find((s) => s.id === selectedId) : null;
  const selectedText = selectedId && selectedType === 'text'
    ? texts.find((t) => t.id === selectedId) : null;

  // ── JSX ───────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden', background: '#0e0e16' }}>
      {/* Infinite SVG canvas */}
      <svg
        ref={svgRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: activeTool === 'select' ? 'default' : 'crosshair',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <pattern
            id="wb-grid"
            width={40 * zoom}
            height={40 * zoom}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${pan.x % (40 * zoom)},${pan.y % (40 * zoom)})`}
          >
            <path
              d={`M ${40 * zoom} 0 L 0 0 0 ${40 * zoom}`}
              fill="none"
              stroke="#1e293b"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>

        {/* Background — captures clicks for deselect / draw-start */}
        <rect width="100%" height="100%" fill="url(#wb-grid)" data-bg="true" />

        {/* World-space group with pan+zoom transform */}
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {shapes.map(renderShapeEl)}

          {texts.map((t) => {
            const isSel = t.id === selectedId;
            return (
              <text
                key={t.id}
                x={t.x}
                y={t.y}
                fill={t.color}
                fontSize={t.font_size}
                stroke={isSel ? 'var(--color-accent)' : 'none'}
                strokeWidth={isSel ? 0.5 / zoom : 0}
                paintOrder="stroke"
                style={{
                  cursor: activeTool === 'select' ? 'pointer' : 'crosshair',
                  userSelect: 'none',
                }}
                onMouseDown={(e) => handleTextMouseDown(e, t)}
              >
                {t.content}
              </text>
            );
          })}

          {renderDrawPreview()}

          {/* Remote cursors */}
          {otherCursors.map((c) => {
            const col = cursorColor(c.user_id);
            const fs = 9 / zoom;
            const lw = 80 / zoom;
            const lh = 14 / zoom;
            const r = 5 / zoom;
            return (
              <g key={c.user_id} pointerEvents="none">
                <circle cx={c.x} cy={c.y} r={r} fill={col} opacity={0.9} />
                <rect x={c.x + r + 2 / zoom} y={c.y - lh} width={lw} height={lh}
                  fill={col} rx={3 / zoom} opacity={0.8} />
                <text x={c.x + r + 4 / zoom} y={c.y - lh / 4} fontSize={fs} fill="#fff">
                  {shortenId(c.user_id)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Text placement input — positioned in screen space */}
      {textInput && textInputScreenPos && (
        <input
          autoFocus
          value={textInput.value}
          onChange={(e) => setTextInput((ti) => ti ? { ...ti, value: e.target.value } : null)}
          onBlur={() => void commitText()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitText();
            if (e.key === 'Escape') setTextInput(null);
          }}
          style={{
            position: 'fixed',
            left: textInputScreenPos.x,
            top: textInputScreenPos.y,
            fontSize: 16 * zoom,
            color: activeColor,
            background: 'rgba(15,23,42,0.7)',
            border: '1px solid var(--color-primary)',
            outline: 'none',
            padding: '2px 4px',
            borderRadius: 3,
            minWidth: 80,
            fontFamily: 'sans-serif',
          }}
        />
      )}

      {/* Comment / properties panel for selected element */}
      {selectedId && (
        <div style={{
          position: 'absolute',
          top: 12,
          right: 12,
          width: 264,
          background: '#1e293b',
          borderRadius: 10,
          padding: '0.75rem',
          boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          maxHeight: '60vh',
          overflow: 'hidden',
          zIndex: 20,
        }}>
          {/* Panel header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {selectedShape ? selectedShape.shape_type : 'text'}
            </span>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              <button
                onClick={async () => {
                  if (selectedShape) await onDeleteShape(selectedShape.id);
                  else if (selectedText) await onDeleteText(selectedText.id);
                  setSelectedId(null);
                  setSelectedType(null);
                }}
                style={{
                  background: '#3a1414',
                  color: '#f0a8a8',
                  border: '1px solid #6a2828',
                  borderRadius: 4,
                  padding: '0.15rem 0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                }}
              >
                Delete
              </button>
              <button
                onClick={() => { setSelectedId(null); setSelectedType(null); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  lineHeight: 1,
                  padding: '0 0.2rem',
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Editable content for text elements */}
          {selectedText && (
            <input
              defaultValue={selectedText.content}
              onBlur={async (e) => {
                const v = e.target.value.trim();
                if (v && v !== selectedText.content) await onUpdateText(selectedText.id, v);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 4,
                color: '#e2e8f0',
                padding: '0.3rem 0.5rem',
                fontSize: '0.82rem',
                outline: 'none',
              }}
            />
          )}

          {/* Comments section */}
          <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.06em' }}>
            COMMENTS
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {commentLoading && (
              <div style={{ color: '#475569', fontSize: '0.75rem' }}>Loading…</div>
            )}
            {!commentLoading && comments.length === 0 && (
              <div style={{ color: '#334155', fontSize: '0.75rem', fontStyle: 'italic' }}>
                No comments yet.
              </div>
            )}
            {comments.map((c) => (
              <div
                key={c.id}
                style={{
                  background: '#0f172a',
                  borderRadius: 5,
                  padding: '0.4rem 0.5rem',
                  fontSize: '0.78rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.1rem' }}>
                  <span style={{ color: 'var(--color-primary)', fontSize: '0.68rem' }}>
                    {shortenId(c.author)}
                  </span>
                  <button
                    onClick={() => void handleDeleteComment(c.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#475569',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ color: '#cbd5e1' }}>{c.body}</div>
              </div>
            ))}
          </div>

          {/* Add comment */}
          <div style={{ display: 'flex', gap: '0.25rem', paddingTop: '0.25rem', borderTop: '1px solid #334155' }}>
            <input
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAddComment(); }}
              placeholder="Add a comment…"
              style={{
                flex: 1,
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 4,
                color: '#e2e8f0',
                padding: '0.3rem 0.5rem',
                fontSize: '0.78rem',
                outline: 'none',
              }}
            />
            <button
              onClick={() => void handleAddComment()}
              disabled={!commentInput.trim()}
              style={{
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '0.3rem 0.6rem',
                cursor: commentInput.trim() ? 'pointer' : 'default',
                fontSize: '0.78rem',
                opacity: commentInput.trim() ? 1 : 0.45,
              }}
            >
              Post
            </button>
          </div>
        </div>
      )}

      {/* Empty canvas hint */}
      {shapes.length === 0 && texts.length === 0 && !drawStart && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: '#334155',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✏️</div>
          <div style={{ fontSize: '0.88rem' }}>
            Pick a tool above and start drawing
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#1e293b' }}>
            Scroll to zoom · Ctrl+drag to pan
          </div>
        </div>
      )}
    </div>
  );
}
