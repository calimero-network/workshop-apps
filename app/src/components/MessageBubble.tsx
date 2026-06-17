import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import { Message, Attachment } from '../api/room/RoomClient';
import { downloadBlob, formatBytes, isImageMime } from '../api/blob';

interface MessageBubbleProps {
  message: Message;
  isSelf: boolean;
  contextId: string;
  onEdit: (newBody: string) => Promise<void>;
  onDelete: () => Promise<void>;
}


function formatTime(timestampNs: number): string {
  // Calimero timestamps are nanoseconds; Date expects milliseconds
  const d = new Date(timestampNs / 1_000_000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function shortenKey(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

/** Lazily fetches the blob bytes and renders an image preview or a file chip. */
function AttachmentView({ attachment, contextId }: { attachment: Attachment; contextId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const image = isImageMime(attachment.mime_type);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    if (!attachment.blob_id || !contextId) { setError(true); return; }
    downloadBlob(attachment.blob_id, contextId)
      .then((blob) => {
        if (cancelled) return;
        revoked = URL.createObjectURL(blob);
        setUrl(revoked);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; if (revoked) URL.revokeObjectURL(revoked); };
  }, [attachment.blob_id, contextId]);

  if (error) {
    return <FileChip><span className="ic">⚠</span><span className="name">Couldn’t load {attachment.file_name}</span></FileChip>;
  }

  if (image) {
    return (
      <ImageWrap>
        {url
          ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={attachment.file_name} /></a>
          : <div className="loading">Loading image…</div>}
      </ImageWrap>
    );
  }

  return (
    <FileChip as={url ? 'a' : 'div'} href={url ?? undefined} download={attachment.file_name} target="_blank" rel="noreferrer">
      <span className="ic">📄</span>
      <span className="meta">
        <span className="name">{attachment.file_name}</span>
        <span className="size">{formatBytes(attachment.size)}{url ? ' · download' : ' · loading…'}</span>
      </span>
    </FileChip>
  );
}

export default function MessageBubble({ message, isSelf, contextId, onEdit, onDelete }: MessageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.body);

  const handleSaveEdit = async () => {
    if (editText.trim() && editText !== message.body) {
      await onEdit(editText.trim());
    }
    setEditing(false);
  };

  const hasBody = message.body.trim().length > 0;

  return (
    <Wrap $self={isSelf}>
      <Meta $self={isSelf}>
        <span>{isSelf ? 'You' : shortenKey(message.sender)}</span>
        <span>{formatTime(message.timestamp_ms)}</span>
        {message.edited && <span className="edited">edited</span>}
      </Meta>

      <Bubble $self={isSelf}>
        {message.attachment && (
          <AttachmentView attachment={message.attachment} contextId={contextId} />
        )}
        {editing ? (
          <EditRow>
            <input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
              autoFocus
            />
            <button onClick={handleSaveEdit}>Save</button>
          </EditRow>
        ) : (
          hasBody && <span className={message.attachment ? 'caption' : undefined}>{message.body}</span>
        )}
      </Bubble>

      {isSelf && !editing && (
        <Actions>
          {/* Editing rewrites the text body; the attachment stays attached. */}
          {hasBody && <button onClick={() => { setEditText(message.body); setEditing(true); }}>Edit</button>}
          <button className="danger" onClick={onDelete}>Delete</button>
        </Actions>
      )}
    </Wrap>
  );
}

const Wrap = styled.div<{ $self: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: ${(p) => (p.$self ? 'flex-end' : 'flex-start')};
  align-self: ${(p) => (p.$self ? 'flex-end' : 'flex-start')};
  max-width: 72%;
`;
const Meta = styled.div<{ $self: boolean }>`
  display: flex;
  gap: 8px;
  margin-bottom: 3px;
  padding: 0 4px;
  font-size: 11px;
  color: ${C.mutedSoft};
  flex-direction: ${(p) => (p.$self ? 'row-reverse' : 'row')};
  .edited { font-style: italic; }
`;
const Bubble = styled.div<{ $self: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 13px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.45;
  word-break: break-word;
  color: ${C.ink};
  background: ${(p) => (p.$self ? 'rgba(164,255,17,0.22)' : C.paper)};
  border: 1px solid ${(p) => (p.$self ? 'rgba(164,255,17,0.5)' : C.line)};
  ${(p) => (p.$self ? 'border-bottom-right-radius: 5px;' : 'border-bottom-left-radius: 5px;')}
  .caption { font-size: 13.5px; }
`;
const ImageWrap = styled.div`
  a { display: block; }
  /* Small inline preview; click opens the full image in a new tab. */
  img { display: block; max-width: 180px; max-height: 180px; width: auto; height: auto; border-radius: 9px; cursor: zoom-in; }
  .loading { width: 160px; height: 100px; display: grid; place-items: center; font-size: 12px; color: ${C.mutedSoft}; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 9px; }
`;
const FileChip = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 11px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 10px;
  text-decoration: none;
  color: inherit;
  .ic { font-size: 18px; }
  .meta { display: flex; flex-direction: column; min-width: 0; }
  .name { font-size: 13px; font-weight: 600; color: ${C.ink}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
  .size { font-size: 11.5px; color: ${C.mutedSoft}; }
  &[href]:hover { border-color: rgba(164,255,17,0.5); }
`;
const EditRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  input {
    flex: 1;
    min-width: 160px;
    background: ${C.paper};
    border: 1px solid ${C.line};
    color: ${C.ink};
    padding: 6px 8px;
    border-radius: 8px;
    font-size: 13.5px;
    outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
  button {
    font-size: 12.5px;
    font-weight: 600;
    padding: 6px 12px;
    color: ${C.onAccent};
    background: ${C.green};
    border: 1px solid #93e60c;
    border-radius: 8px;
    cursor: pointer;
  }
`;
const Actions = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 3px;
  padding: 0 2px;
  button {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 11.5px;
    font-weight: 600;
    color: ${C.muted};
    padding: 2px 6px;
    border-radius: 6px;
    transition: background 0.14s, color 0.14s;
    &:hover { background: ${C.paper2}; color: ${C.ink}; }
    &.danger:hover { color: ${C.danger}; background: rgba(210,59,47,0.08); }
  }
`;
