import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import { downloadBlob } from '../api/blob';
import { describeError } from '../utils/errors';
import { Primary, Secondary, Skeleton, NARROW, focusRing } from './primitives';
import type { Mockup, PinView } from '../api/design-review/DesignReviewClient';

interface Point {
  x: number;
  y: number;
}

interface MockupCanvasProps {
  mockup: Mockup;
  contextId: string;
  pins: PinView[];
  onAddPin: (x: number, y: number, text: string) => Promise<void>;
}

/**
 * The one signature surface of the app: the mockup image itself, pinned with
 * numbered teardrop markers. Click anywhere on the image to compose a new pin
 * at that exact spot; everything else in the page stays quiet so this reads.
 */
export default function MockupCanvas({ mockup, contextId, pins, onAddPin }: MockupCanvasProps): React.ReactElement {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState<Error | null>(null);
  const [pending, setPending] = useState<Point | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setImgUrl(null);
    setImgError(null);
    downloadBlob(mockup.image, contextId)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImgUrl(url);
      })
      .catch((err) => {
        if (!cancelled) setImgError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [mockup.image, contextId]);

  // Dropping a new pin always closes any open composer first, so there is
  // never more than one in-flight draft to reconcile against a fresh mockup.
  useEffect(() => {
    setPending(null);
    setDraft('');
  }, [mockup.id]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (pending || saving) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setPending({ x, y });
    setDraft('');
  };

  const cancelPin = () => {
    setPending(null);
    setDraft('');
  };

  const submitPin = async () => {
    if (!pending || !draft.trim() || saving) return;
    setSaving(true);
    try {
      await onAddPin(pending.x, pending.y, draft.trim());
      setPending(null);
      setDraft('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Wrap>
      <Frame ref={frameRef} onClick={handleCanvasClick} $clickable={!pending}>
        {imgUrl ? (
          <img src={imgUrl} alt={mockup.title} draggable={false} />
        ) : imgError ? (
          <ImgError>Couldn’t load this mockup — {describeError(imgError)}</ImgError>
        ) : (
          <Skeleton $h="100%" />
        )}

        {pins.map((pin, i) => (
          <Marker
            key={pin.id}
            data-testid={`pin-marker-${pin.id}`}
            $resolved={pin.resolved}
            style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
            onClick={(e) => e.stopPropagation()}
            title={pin.text}
          >
            <span>{i + 1}</span>
          </Marker>
        ))}

        {pending && (
          <Marker $resolved={false} $ghost style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }} onClick={(e) => e.stopPropagation()}>
            <span>+</span>
          </Marker>
        )}
      </Frame>

      {pending ? (
        <Composer onClick={(e) => e.stopPropagation()}>
          <textarea
            data-testid="field-text"
            autoFocus
            placeholder="What do you want to flag here?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            disabled={saving}
          />
          <ComposerActions>
            <Secondary type="button" onClick={cancelPin} disabled={saving}>Cancel</Secondary>
            <Primary type="button" data-testid="action-add_pin" onClick={() => void submitPin()} disabled={!draft.trim() || saving}>
              {saving ? 'Pinning…' : 'Drop pin'}
            </Primary>
          </ComposerActions>
        </Composer>
      ) : (
        <AddHint>Click anywhere on the mockup to drop a new pin</AddHint>
      )}
    </Wrap>
  );
}

const Wrap = styled.div`display: flex; flex-direction: column; gap: var(--c-space-3);`;

const Frame = styled.div<{ $clickable: boolean }>`
  position: relative;
  overflow: hidden;
  min-height: 260px;
  border: 1px solid ${C.line};
  border-radius: var(--c-radius-md);
  background: ${C.paper};
  cursor: ${(p) => (p.$clickable ? 'crosshair' : 'default')};
  img { display: block; width: 100%; height: auto; user-select: none; pointer-events: none; }
`;

const ImgError = styled.div`
  display: flex; align-items: center; justify-content: center;
  min-height: 260px; padding: var(--c-space-6);
  font-size: var(--c-text-base); color: ${C.danger}; text-align: center;
`;

const Marker = styled.button<{ $resolved: boolean; $ghost?: boolean }>`
  position: absolute;
  width: var(--c-space-7); height: var(--c-space-7);
  transform: translate(-50%, -100%) rotate(45deg);
  border-radius: var(--c-radius-pill) var(--c-radius-pill) var(--c-radius-pill) 0;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid ${C.paper2};
  cursor: pointer;
  padding: 0;
  background: ${(p) => (p.$ghost ? 'transparent' : p.$resolved ? C.green : C.accent)};
  border-style: ${(p) => (p.$ghost ? 'dashed' : 'solid')};
  border-color: ${(p) => (p.$ghost ? C.mutedSoft : C.paper2)};
  box-shadow: 0 2px 6px color-mix(in srgb, var(--c-shadow) 60%, transparent);
  transition: filter var(--c-duration-fast) var(--c-ease);
  &:hover { filter: brightness(1.08); }
  span {
    transform: rotate(-45deg);
    font-size: var(--c-text-xs); font-weight: 700; line-height: 1;
    color: ${(p) => (p.$ghost ? C.mutedSoft : p.$resolved ? C.greenInk : C.accentInk)};
  }
  ${focusRing}
`;

const AddHint = styled.p`
  text-align: center;
  font-size: var(--c-text-sm);
  color: ${C.mutedSoft};
`;

const Composer = styled.div`
  display: flex; flex-direction: column; gap: var(--c-space-2);
  padding: var(--c-space-3);
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: var(--c-radius-md);
  textarea {
    width: 100%; resize: vertical; min-height: 60px;
    font-family: inherit; font-size: var(--c-text-base);
    color: ${C.ink}; background: ${C.paper};
    border: 1px solid ${C.line}; border-radius: var(--c-radius-sm);
    padding: var(--c-space-2) var(--c-space-3); outline: none;
    ${focusRing}
  }
`;

const ComposerActions = styled.div`
  display: flex; gap: var(--c-space-2); justify-content: flex-end;
  @media ${NARROW} { flex-direction: column-reverse; }
`;
