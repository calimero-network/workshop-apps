import React, { useEffect, useRef, useCallback } from 'react';
import type { Document, Link } from '../api/knowledge-graph/KnowledgeGraphClient';

interface Node {
  id: string;
  title: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface GraphVisualizationViewProps {
  documents: Document[];
  links: Link[];
  selectedDocId: string | null;
  onSelectDoc: (docId: string) => void;
}

const NODE_RADIUS = 24;
const REPULSION = 6000;
const ATTRACTION = 0.04;
const DAMPING = 0.85;
const CENTER_PULL = 0.01;

export default function GraphVisualizationView({
  documents,
  links,
  selectedDocId,
  onSelectDoc,
}: GraphVisualizationViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const animFrameRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build / update node list when documents change, preserve positions
  useEffect(() => {
    const existing = new Map(nodesRef.current.map((n) => [n.id, n]));
    const canvas = canvasRef.current;
    const w = canvas?.width ?? 800;
    const h = canvas?.height ?? 600;
    nodesRef.current = documents.map((doc) => {
      if (existing.has(doc.id)) {
        const n = existing.get(doc.id)!;
        n.title = doc.title;
        return n;
      }
      return {
        id: doc.id,
        title: doc.title,
        x: w / 2 + (Math.random() - 0.5) * 300,
        y: h / 2 + (Math.random() - 0.5) * 300,
        vx: 0,
        vy: 0,
        radius: NODE_RADIUS,
      };
    });
  }, [documents]);

  // Force simulation + render loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width: w, height: h } = canvas;
    const nodes = nodesRef.current;
    const cx = w / 2;
    const cy = h / 2;

    // Apply forces
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      // Center pull
      a.vx += (cx - a.x) * CENTER_PULL;
      a.vy += (cy - a.y) * CENTER_PULL;
      // Repulsion between nodes
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist2 = dx * dx + dy * dy + 1;
        const force = REPULSION / dist2;
        const fx = (dx / Math.sqrt(dist2)) * force;
        const fy = (dy / Math.sqrt(dist2)) * force;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }
    // Attraction along links
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    for (const link of links) {
      const src = nodeById.get(link.source_doc_id);
      const tgt = nodeById.get(link.target_doc_id);
      if (!src || !tgt) continue;
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 1;
      const target = 140;
      const force = (dist - target) * ATTRACTION;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      src.vx += fx; src.vy += fy;
      tgt.vx -= fx; tgt.vy -= fy;
    }

    // Integrate & clamp to canvas
    for (const n of nodes) {
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x = Math.max(n.radius, Math.min(w - n.radius, n.x + n.vx));
      n.y = Math.max(n.radius, Math.min(h - n.radius, n.y + n.vy));
    }

    // Draw
    ctx.clearRect(0, 0, w, h);

    // Links
    for (const link of links) {
      const src = nodeById.get(link.source_doc_id);
      const tgt = nodeById.get(link.target_doc_id);
      if (!src || !tgt) continue;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = 'rgba(139,92,246,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Nodes
    for (const n of nodes) {
      const selected = n.id === selectedDocId;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius + (selected ? 4 : 0), 0, Math.PI * 2);
      ctx.fillStyle = selected ? '#7c3aed' : '#1e293b';
      ctx.fill();
      ctx.strokeStyle = selected ? '#a78bfa' : '#8B5CF6';
      ctx.lineWidth = selected ? 2.5 : 1.5;
      ctx.stroke();

      // Label
      const label = n.title.length > 12 ? n.title.slice(0, 12) + '…' : n.title;
      ctx.fillStyle = selected ? '#e9d5ff' : '#94a3b8';
      ctx.font = `${selected ? 600 : 400} 11px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, n.x, n.y);
    }

    animFrameRef.current = requestAnimationFrame(draw);
  }, [links, selectedDocId]);

  // Start/stop loop
  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  // Resize canvas to container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const observer = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    });
    observer.observe(container);
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    return () => observer.disconnect();
  }, []);

  // Click to select node
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    for (const n of nodesRef.current) {
      const dx = mx - n.x;
      const dy = my - n.y;
      if (dx * dx + dy * dy <= (n.radius + 4) ** 2) {
        onSelectDoc(n.id);
        return;
      }
    }
  }, [onSelectDoc]);

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0a0f1e' }}>
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{ width: '100%', height: '100%', cursor: 'crosshair', display: 'block' }}
      />
      {documents.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          color: '#475569', fontSize: '0.9rem', pointerEvents: 'none',
        }}>
          No documents in the graph yet — create one to get started
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: 12, right: 16,
        fontSize: '0.7rem', color: '#334155',
        pointerEvents: 'none',
      }}>
        {documents.length} node{documents.length !== 1 ? 's' : ''} · {links.length} link{links.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
