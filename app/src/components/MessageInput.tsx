import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import { formatBytes, isImageMime, MAX_ATTACHMENT_SIZE } from '../api/blob';

interface MessageInputProps {
  onSend: (body: string) => Promise<void>;
  /** Optional: send a file/image with an optional caption. */
  onSendAttachment?: (file: File, caption: string) => Promise<void>;
  /** Optional: load the saved private draft for this room (restored on open). */
  loadDraft?: () => Promise<string>;
  /** Optional: persist the private draft as the user types (debounced). */
  saveDraft?: (content: string) => Promise<void>;
}


export default function MessageInput({ onSend, onSendAttachment, loadDraft, saveDraft }: MessageInputProps) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore the room's private draft on open / room switch.
  useEffect(() => {
    if (!loadDraft) return;
    let cancelled = false;
    loadDraft().then((d) => { if (!cancelled && d) setText(d); });
    return () => { cancelled = true; };
  }, [loadDraft]);

  // Persist the draft as the user types (debounced). Cleared on send below.
  useEffect(() => {
    if (!saveDraft) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => { void saveDraft(text); }, 600);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [text, saveDraft]);

  const pickFile = (f: File | null) => {
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!f) { setFile(null); setPreviewUrl(null); return; }
    if (f.size > MAX_ATTACHMENT_SIZE) {
      setError(`File is too large (max ${Math.floor(MAX_ATTACHMENT_SIZE / (1024 * 1024))} MB).`);
      setFile(null); setPreviewUrl(null);
      return;
    }
    setFile(f);
    setPreviewUrl(isImageMime(f.type) ? URL.createObjectURL(f) : null);
  };

  const clearFile = () => pickFile(null);

  const handleSend = useCallback(async () => {
    if (sending) return;
    const body = text.trim();
    if (!file && !body) return;

    setSending(true);
    setError(null);
    try {
      if (file && onSendAttachment) {
        await onSendAttachment(file, body);
      } else if (body) {
        await onSend(body);
      }
      setText('');
      clearFile();
      void saveDraft?.(''); // sent → discard the saved draft
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send.');
    } finally {
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, file, sending, onSend, onSendAttachment, saveDraft]);

  const canSend = !sending && (!!file || !!text.trim());

  return (
    <Wrap>
      {file && (
        <Staged>
          {previewUrl ? <img src={previewUrl} alt={file.name} /> : <span className="doc">📄</span>}
          <div className="meta">
            <span className="name">{file.name}</span>
            <span className="size">{formatBytes(file.size)}</span>
          </div>
          <button className="remove" onClick={clearFile} aria-label="Remove attachment">×</button>
        </Staged>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
      <Bar>
        {onSendAttachment && (
          <>
            <AttachBtn onClick={() => fileRef.current?.click()} title="Attach a file" aria-label="Attach a file">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </AttachBtn>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,text/plain"
              style={{ display: 'none' }}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </>
        )}
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
          placeholder={file ? 'Add a caption…' : 'Type a message…'}
          disabled={sending}
          aria-label="Message"
        />
        <SendBtn onClick={handleSend} disabled={!canSend}>{sending ? 'Sending…' : 'Send'}</SendBtn>
      </Bar>
    </Wrap>
  );
}

const Wrap = styled.div`
  border-top: 1px solid ${C.line};
  background: ${C.paper};
  padding: 12px 16px;
`;
const Bar = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  input[type='text'] {
    flex: 1;
    min-width: 0;
    padding: 12px 14px;
    background: ${C.paper};
    border: 1px solid ${C.line};
    border-radius: 12px;
    color: ${C.ink};
    font-size: 14px;
    outline: none;
    transition: border-color 0.16s, box-shadow 0.16s;
    &::placeholder { color: ${C.mutedSoft}; }
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 4px rgba(164,255,17,0.18); }
    &:disabled { opacity: 0.6; }
  }
`;
const AttachBtn = styled.button`
  flex-shrink: 0;
  width: 42px; height: 42px;
  display: grid; place-items: center;
  color: ${C.muted};
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  &:hover { background: ${C.paper2}; color: ${C.greenInk}; border-color: rgba(164,255,17,0.5); }
`;
const SendBtn = styled.button`
  flex-shrink: 0;
  padding: 0 22px;
  height: 42px;
  font-size: 14px;
  font-weight: 600;
  color: ${C.onAccent};
  background: ${C.green};
  border: 1px solid #93e60c;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.16s, box-shadow 0.18s, transform 0.14s;
  &:hover:not(:disabled) { background: ${C.greenHover}; box-shadow: 0 8px 22px rgba(164,255,17,0.4); transform: translateY(-1px); }
  &:disabled { background: ${C.disabled}; border-color: ${C.disabled}; color: ${C.mutedSoft}; cursor: default; }
`;
const Staged = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  padding: 8px 10px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 12px;
  img { width: 40px; height: 40px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
  .doc { width: 40px; height: 40px; display: grid; place-items: center; font-size: 20px; background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 8px; }
  .meta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .name { font-size: 13px; font-weight: 600; color: ${C.ink}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .size { font-size: 11.5px; color: ${C.mutedSoft}; }
  .remove {
    flex-shrink: 0; width: 26px; height: 26px; display: grid; place-items: center;
    font-size: 18px; color: ${C.mutedSoft}; background: transparent; border: none; border-radius: 7px; cursor: pointer;
    &:hover { background: ${C.paper}; color: ${C.danger}; }
  }
`;
const ErrorLine = styled.div`
  margin-bottom: 8px;
  font-size: 12.5px;
  color: ${C.danger};
`;
