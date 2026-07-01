import React, { useState } from 'react';
import styled from 'styled-components';
import { C } from '../../theme';

/**
 * VisualizationPage — 2D scatter plot of entry embeddings.
 * Shell pass: static placeholder visualization with mock cluster data.
 * ABI pass: feed real embeddings from listEntries(), compute PCA client-side.
 */

// Mock data for the shell pass — clusters of "knowledge" in a 2D projection space
const MOCK_CLUSTERS = [
  {
    label: 'NLP',
    color: '#7C3AED',
    points: [
      [160, 140], [195, 120], [175, 165], [210, 145], [185, 185],
      [150, 180], [220, 120], [165, 155],
    ] as [number, number][],
  },
  {
    label: 'Computer Vision',
    color: '#22D3EE',
    points: [
      [380, 200], [410, 175], [395, 225], [425, 210], [365, 215],
      [440, 190], [405, 240],
    ] as [number, number][],
  },
  {
    label: 'Reinforcement Learning',
    color: '#F59E0B',
    points: [
      [280, 320], [310, 295], [260, 310], [295, 345], [320, 325],
      [275, 360],
    ] as [number, number][],
  },
  {
    label: 'Optimization',
    color: '#10B981',
    points: [
      [460, 340], [490, 315], [475, 365], [510, 340], [445, 360],
    ] as [number, number][],
  },
  {
    label: 'Uncategorized',
    color: '#6B7280',
    points: [
      [100, 310], [560, 160], [350, 80], [530, 430], [90, 400],
    ] as [number, number][],
  },
];

type HoveredPoint = {
  label: string;
  color: string;
  x: number;
  y: number;
  px: number;
  py: number;
};

const SVG_W = 640;
const SVG_H = 480;

export default function VisualizationPage() {
  const [hovered, setHovered] = useState<HoveredPoint | null>(null);
  const [activeCollections, setActiveCollections] = useState<Set<string>>(
    new Set(MOCK_CLUSTERS.map((c) => c.label)),
  );

  const toggleCollection = (label: string) => {
    setActiveCollections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) { next.delete(label); } else { next.add(label); }
      return next;
    });
  };

  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>Visualization</PageTitle>
          <PageSub>2D projection of all entry embeddings — explore the shape of your knowledge</PageSub>
        </div>
        <Badge>Preview · Mock Data</Badge>
      </PageHeader>

      <LayoutRow>
        {/* Scatter plot */}
        <PlotWrap>
          <PlotLabel>t-SNE 2D Projection</PlotLabel>
          <SVGContainer>
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              width="100%"
              height="100%"
              role="img"
              aria-label="2D scatter plot of knowledge entry embeddings"
            >
              {/* Grid lines */}
              {[0.2, 0.4, 0.6, 0.8].map((f) => (
                <React.Fragment key={f}>
                  <line
                    x1={SVG_W * f} y1={0} x2={SVG_W * f} y2={SVG_H}
                    stroke="rgba(255,255,255,0.05)" strokeWidth="1"
                  />
                  <line
                    x1={0} y1={SVG_H * f} x2={SVG_W} y2={SVG_H * f}
                    stroke="rgba(255,255,255,0.05)" strokeWidth="1"
                  />
                </React.Fragment>
              ))}

              {/* Points by cluster */}
              {MOCK_CLUSTERS.map((cluster) => {
                if (!activeCollections.has(cluster.label)) return null;
                return (
                  <g key={cluster.label}>
                    {cluster.points.map(([px, py], idx) => (
                      <circle
                        key={idx}
                        cx={px}
                        cy={py}
                        r={hovered?.label === cluster.label && hovered.px === px && hovered.py === py ? 9 : 6}
                        fill={cluster.color}
                        opacity={0.82}
                        style={{ cursor: 'pointer', transition: 'r 0.15s' }}
                        onMouseEnter={() =>
                          setHovered({ label: cluster.label, color: cluster.color, x: px, y: py, px, py })
                        }
                        onMouseLeave={() => setHovered(null)}
                      />
                    ))}
                  </g>
                );
              })}

              {/* Hover tooltip */}
              {hovered && (
                <g>
                  <rect
                    x={Math.min(hovered.px + 12, SVG_W - 130)}
                    y={Math.max(hovered.py - 36, 4)}
                    width={118}
                    height={30}
                    rx={6}
                    fill={C.paper2}
                    stroke={hovered.color}
                    strokeWidth={1}
                    opacity={0.95}
                  />
                  <text
                    x={Math.min(hovered.px + 18, SVG_W - 122)}
                    y={Math.max(hovered.py - 17, 22)}
                    fontSize={10}
                    fill={hovered.color}
                    fontWeight="600"
                    fontFamily="-apple-system, sans-serif"
                  >
                    {hovered.label}
                  </text>
                  <text
                    x={Math.min(hovered.px + 18, SVG_W - 122)}
                    y={Math.max(hovered.py - 5, 32)}
                    fontSize={9}
                    fill="var(--c-muted)"
                    fontFamily="ui-monospace, monospace"
                  >
                    ({hovered.x.toFixed(0)}, {hovered.y.toFixed(0)})
                  </text>
                </g>
              )}
            </svg>
          </SVGContainer>

          <PlotNote>
            Shell pass: placeholder data. Connect entries with real embeddings to see actual clusters.
          </PlotNote>
        </PlotWrap>

        {/* Legend / controls */}
        <LegendPanel>
          <LegendTitle>Collections</LegendTitle>
          <LegendList>
            {MOCK_CLUSTERS.map((cluster) => (
              <LegendItem
                key={cluster.label}
                $active={activeCollections.has(cluster.label)}
                onClick={() => toggleCollection(cluster.label)}
              >
                <LegendDot $color={cluster.color} />
                <LegendLabel>{cluster.label}</LegendLabel>
                <LegendCount>{cluster.points.length}</LegendCount>
              </LegendItem>
            ))}
          </LegendList>

          <Divider />

          <InfoSection>
            <InfoTitle>About this view</InfoTitle>
            <InfoText>
              Each point represents a knowledge entry. Nearby points have similar embeddings
              — they share semantic meaning. Color indicates the collection.
            </InfoText>
            <InfoText>
              Projection computed client-side using PCA (2 components). In the ABI pass,
              your actual entry embeddings are used.
            </InfoText>
          </InfoSection>

          <AlgoTag>Algorithm: PCA → 2D</AlgoTag>
        </LegendPanel>
      </LayoutRow>
    </Page>
  );
}

/* ── Styled components ──────────────────────────────────────────────────────── */
const Page = styled.div`
  padding: 28px 32px 60px;
  width: 100%;
`;

const PageHeader = styled.header`
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
  margin-bottom: 22px;
`;
const PageTitle = styled.h1`
  font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; margin-bottom: 4px;
`;
const PageSub = styled.p`font-size: 13.5px; color: ${C.muted};`;
const Badge = styled.span`
  font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 999px; flex-shrink: 0;
  color: var(--color-accent); background: rgba(34,211,238,0.1);
  border: 1px solid rgba(34,211,238,0.3);
`;

const LayoutRow = styled.div`
  display: flex; gap: 20px; align-items: flex-start;
  @media (max-width: 900px) { flex-direction: column; }
`;

const PlotWrap = styled.div`
  flex: 1; min-width: 0;
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 16px; overflow: hidden;
`;

const PlotLabel = styled.div`
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  color: ${C.mutedSoft}; padding: 12px 16px 0;
`;

const SVGContainer = styled.div`
  width: 100%;
  aspect-ratio: 4/3;
  background: ${C.paper};
  overflow: hidden;
`;

const PlotNote = styled.p`
  font-size: 11.5px; color: ${C.mutedSoft}; padding: 10px 16px;
  border-top: 1px solid ${C.line};
`;

const LegendPanel = styled.aside`
  width: 220px; flex-shrink: 0;
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 16px; padding: 18px 16px;
  @media (max-width: 900px) { width: 100%; }
`;

const LegendTitle = styled.div`
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  color: ${C.mutedSoft}; margin-bottom: 12px;
`;

const LegendList = styled.div`display: flex; flex-direction: column; gap: 4px;`;

const LegendItem = styled.button<{ $active: boolean }>`
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 7px 8px; border-radius: 8px; border: none; cursor: pointer;
  background: ${(p) => (p.$active ? C.paper : 'transparent')};
  opacity: ${(p) => (p.$active ? 1 : 0.45)};
  transition: background 0.15s, opacity 0.15s;
  &:hover { background: ${C.paper}; opacity: 1; }
`;

const LegendDot = styled.div<{ $color: string }>`
  width: 10px; height: 10px; border-radius: 50%;
  background: ${(p) => p.$color}; flex-shrink: 0;
`;

const LegendLabel = styled.span`font-size: 12.5px; color: ${C.ink}; flex: 1; text-align: left;`;
const LegendCount = styled.span`font-size: 11px; color: ${C.mutedSoft}; font-family: ui-monospace, monospace;`;

const Divider = styled.div`height: 1px; background: ${C.line}; margin: 14px 0;`;

const InfoSection = styled.div``;
const InfoTitle = styled.div`
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  color: ${C.mutedSoft}; margin-bottom: 8px;
`;
const InfoText = styled.p`font-size: 12px; color: ${C.muted}; line-height: 1.6; margin-bottom: 8px;`;

const AlgoTag = styled.div`
  margin-top: 10px; font-size: 11px; font-weight: 600; font-family: ui-monospace, monospace;
  color: var(--color-primary); background: rgba(124,58,237,0.1);
  border: 1px solid rgba(124,58,237,0.2); border-radius: 6px; padding: 4px 9px;
  display: inline-block;
`;
