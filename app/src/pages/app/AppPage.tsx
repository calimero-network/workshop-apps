import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useMockups, usePins } from '../../hooks/useItems';
import { uploadBlob } from '../../api/blob';
import { useFeedback } from '../../components/Feedback';
import { useArrivalAnnouncer } from '../../hooks/useArrivalAnnouncer';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import { DisplayNamesProvider, MemberLabel } from '../../components/MemberLabel';
import { DisplayNameGate } from '../../components/DisplayNameGate';
import WorkspaceChrome from '../../components/WorkspaceChrome';
import MockupCanvas from '../../components/MockupCanvas';
import {
  Card, Empty, Primary, Secondary, ErrLine, Hint, focusRing,
  tapTarget, Skeleton, EmptyState,
} from '../../components/primitives';
import SettingsPanel from '../../components/SettingsPanel';

/**
 * Design direction: Pinpoint Feedback treats the mockup itself as the
 * product. The pinned mockup canvas (MockupCanvas) is the one signature
 * surface — numbered teardrop markers that turn from accent to green the
 * instant a pin resolves. The version rail, the upload form, and the
 * feedback thread beneath it stay in quiet index-card rows so the canvas is
 * the thing you actually look at.
 *
 * MockupReviewPage: workspace resolution (bootstrap/join), a mockup version
 * rail + uploader, the pinned canvas, and the feedback thread with
 * resolve/edit/delete gated to authorship.
 */

type Filter = 'all' | 'open' | 'resolved';

const PinIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.4" />
  </svg>
);

function formatTime(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function AppPage() {
  const { notify } = useFeedback();
  const ws = useWorkspace();
  const mockups = useMockups({ contextId: ws.contextId, executorPublicKey: ws.executorPublicKey });

  const [activeMockupId, setActiveMockupId] = useState<string | null>(null);
  useEffect(() => {
    if (activeMockupId && mockups.mockups.some((m) => m.id === activeMockupId)) return;
    setActiveMockupId(mockups.mockups[0]?.id ?? null);
  }, [mockups.mockups, activeMockupId]);

  const activeMockup = useMemo(
    () => mockups.mockups.find((m) => m.id === activeMockupId) ?? null,
    [mockups.mockups, activeMockupId],
  );

  const pins = usePins({ contextId: ws.contextId, executorPublicKey: ws.executorPublicKey }, activeMockupId);

  // A peer's pin must reach a screen reader; notify() only covers your own writes.
  useArrivalAnnouncer(pins.pins, ws.executorPublicKey, 'pin');

  const [wsName, setWsName] = useState('My workspace');
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Upload form.
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const nextVersion = mockups.mockups.length
    ? Math.max(...mockups.mockups.map((m) => m.version)) + 1
    : 1;
  const [version, setVersion] = useState(nextVersion);
  useEffect(() => { setVersion(nextVersion); }, [nextVersion]);
  const [uploading, setUploading] = useState(false);

  // Feedback thread state.
  const [filter, setFilter] = useState<Filter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const submitUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !file || !mockups.ready || uploading) return;
    setUploading(true);
    try {
      const { blobId } = await uploadBlob(file);
      await mockups.upload(title.trim(), blobId, version);
      setTitle('');
      setFile(null);
      notify('Mockup uploaded');
    } catch (err) {
      notify(describeError(err), 'error');
    } finally {
      setUploading(false);
    }
  };

  const addPin = async (x: number, y: number, text: string) => {
    try {
      await pins.add(x, y, text);
      notify('Pin dropped');
    } catch (err) {
      notify(describeError(err), 'error');
      throw err;
    }
  };

  const resolvePin = async (id: string) => {
    try {
      await pins.resolve(id);
      notify('Pin resolved');
    } catch (err) {
      notify(describeError(err), 'error');
    }
  };

  const removePin = async (id: string) => {
    try {
      await pins.remove(id);
      notify('Pin removed');
    } catch (err) {
      notify(describeError(err), 'error');
    }
  };

  const startEdit = (id: string, text: string) => {
    setEditingId(id);
    setEditDraft(text);
  };

  const saveEdit = async (id: string) => {
    if (!editDraft.trim()) return;
    try {
      await pins.edit(id, editDraft.trim());
      setEditingId(null);
      setEditDraft('');
      notify('Pin updated');
    } catch (err) {
      notify(describeError(err), 'error');
    }
  };

  const filteredPins = pins.pins.filter((p) => {
    if (filter === 'open') return !p.resolved;
    if (filter === 'resolved') return p.resolved;
    return true;
  });
  const openCount = pins.pins.filter((p) => !p.resolved).length;
  const resolvedCount = pins.pins.length - openCount;

  // No workspace yet (fresh web session): offer create-or-join.
  if (!ws.ready && !ws.loading) {
    return (
      <Empty>
        <Card>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Create a review workspace to start pinning feedback, or join one you were invited to.</p>
          <WorkspaceNameField
            data-testid="field-workspace-name"
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder="Workspace name"
            maxLength={64}
            aria-label="Workspace name"
          />
          <Row>
            <Primary data-testid="create-workspace-btn" onClick={() => { void ws.bootstrap(wsName).catch(() => {}); }}>Create workspace</Primary>
            <Secondary data-testid="open-join-btn" onClick={() => setShowJoin(true)}>Join with invitation</Secondary>
          </Row>
          {ws.error && <ErrLine>{describeError(ws.error)}</ErrLine>}
        </Card>
        {showJoin && (
          <JoinModal
            onJoin={async (code) => { await ws.join(code); setShowJoin(false); }}
            onClose={() => setShowJoin(false)}
          />
        )}
      </Empty>
    );
  }

  return (
    <DisplayNamesProvider
      namespaceId={ws.namespaceId}
      contextId={ws.contextId}
      selfIdentity={ws.executorPublicKey}
    >
      <Page data-testid="workspace-ready">
        <WorkspaceChrome
          ws={ws}
          onOpenInvite={() => setShowInvite(true)}
          onOpenJoin={() => setShowJoin(true)}
          onOpenSettings={() => setShowSettings(true)}
        />

        <Content>
          <Layout>
            <Rail>
              <RailHead>Mockups</RailHead>
              {mockups.loading && mockups.mockups.length === 0 && <Skeleton $h="var(--c-space-16)" />}
              {mockups.mockups.length === 0 && !mockups.loading && (
                <Hint>No mockups uploaded yet.</Hint>
              )}
              <RailList>
                {mockups.mockups.map((m) => (
                  <RailItem
                    key={m.id}
                    data-testid="item-mockup"
                    type="button"
                    $active={m.id === activeMockupId}
                    onClick={() => setActiveMockupId(m.id)}
                  >
                    <strong>{m.title}</strong>
                    <span>v{m.version}</span>
                  </RailItem>
                ))}
              </RailList>

              <UploadForm onSubmit={submitUpload}>
                <RailHead>Upload a version</RailHead>
                <input
                  data-testid="field-title"
                  placeholder="Mockup title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <input
                  data-testid="field-image"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <input
                  data-testid="field-version"
                  type="number"
                  min={1}
                  value={version}
                  onChange={(e) => setVersion(Math.max(1, Number(e.target.value) || 1))}
                  aria-label="Version"
                />
                <Primary type="submit" data-testid="action-upload_mockup" disabled={!title.trim() || !file || !mockups.ready || uploading}>
                  {uploading ? 'Uploading…' : 'Upload mockup'}
                </Primary>
                {mockups.error && <ErrLine>{describeError(mockups.error)}</ErrLine>}
              </UploadForm>
            </Rail>

            <Main>
              {!activeMockup ? (
                <EmptyState>
                  <IconWrap>{PinIcon}</IconWrap>
                  <h3>Nothing to review yet</h3>
                  <p>Upload the first mockup version using the form on the left, and everyone in this workspace can start pinning feedback.</p>
                </EmptyState>
              ) : (
                <>
                  <Toolbar>
                    <div>
                      <h1>{activeMockup.title}</h1>
                      <p className="sub">{openCount} open pin{openCount === 1 ? '' : 's'} &middot; {resolvedCount} resolved</p>
                    </div>
                    <VersionPill>v{activeMockup.version}</VersionPill>
                  </Toolbar>

                  {ws.contextId && (
                    <MockupCanvas
                      mockup={activeMockup}
                      contextId={ws.contextId}
                      pins={pins.pins}
                      onAddPin={addPin}
                    />
                  )}

                  <ListHead>
                    <h2>Feedback</h2>
                    <Tabs>
                      <Tab $active={filter === 'all'} onClick={() => setFilter('all')}>All ({pins.pins.length})</Tab>
                      <Tab $active={filter === 'open'} onClick={() => setFilter('open')}>Open ({openCount})</Tab>
                      <Tab $active={filter === 'resolved'} onClick={() => setFilter('resolved')}>Resolved ({resolvedCount})</Tab>
                    </Tabs>
                  </ListHead>

                  {pins.error && <ErrLine>{describeError(pins.error)}</ErrLine>}

                  <List>
                    {pins.loading && pins.pins.length === 0 && (<><Skeleton /><Skeleton /></>)}
                    {filteredPins.length === 0 && !pins.loading && (
                      <EmptyState>
                        <h3>{filter === 'all' ? 'No pins yet' : filter === 'open' ? 'Nothing open' : 'Nothing resolved yet'}</h3>
                        <p>Click anywhere on the mockup above to leave the first pin.</p>
                      </EmptyState>
                    )}
                    {filteredPins.map((pin) => {
                      const mine = pin.author === ws.executorPublicKey;
                      const editing = editingId === pin.id;
                      const number = pins.pins.indexOf(pin) + 1;
                      return (
                        <PinRow key={pin.id} data-testid="item-pin" $resolved={pin.resolved}>
                          <PinNum $resolved={pin.resolved}>{number}</PinNum>
                          <PinBody>
                            <PinMeta>
                              <MemberLabel memberId={pin.author} />
                              <time>{formatTime(pin.created_at)}</time>
                              {pin.resolved && <ResolvedBadge>Resolved</ResolvedBadge>}
                            </PinMeta>

                            {editing ? (
                              <EditForm>
                                <textarea
                                  data-testid="field-text"
                                  value={editDraft}
                                  onChange={(e) => setEditDraft(e.target.value)}
                                  rows={2}
                                  autoFocus
                                />
                                <PinActions>
                                  <button type="button" className="muted" onClick={() => { setEditingId(null); setEditDraft(''); }}>Cancel</button>
                                  <button type="button" data-testid="action-edit_pin" onClick={() => void saveEdit(pin.id)} disabled={!editDraft.trim()}>Save</button>
                                </PinActions>
                              </EditForm>
                            ) : (
                              <>
                                <p className="text">{pin.text}</p>
                                <PinActions>
                                  {!pin.resolved && (
                                    <button type="button" data-testid="action-resolve_pin" onClick={() => void resolvePin(pin.id)}>Resolve</button>
                                  )}
                                  {mine ? (
                                    <>
                                      <button type="button" onClick={() => startEdit(pin.id, pin.text)}>Edit</button>
                                      <button type="button" data-testid="action-remove_pin" className="danger" onClick={() => void removePin(pin.id)}>Delete</button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="muted">Edit</span>
                                      <span className="muted">Delete</span>
                                    </>
                                  )}
                                </PinActions>
                              </>
                            )}
                          </PinBody>
                        </PinRow>
                      );
                    })}
                  </List>
                </>
              )}

              <DisplayNameGate injected={ws.injectedContext} />
            </Main>
          </Layout>
        </Content>

        {showInvite && (
          <InviteModal onInvite={ws.invite} onClose={() => setShowInvite(false)} />
        )}
        {showJoin && (
          <JoinModal
            onJoin={async (code) => { await ws.join(code); setShowJoin(false); }}
            onClose={() => setShowJoin(false)}
          />
        )}
        {showSettings && (
          <SettingsPanel ws={ws} onClose={() => setShowSettings(false)} />
        )}
      </Page>
    </DisplayNamesProvider>
  );
}

const Page = styled.div`
  max-width: var(--c-app-max);
  margin: 0 auto;
  padding: var(--c-space-7) var(--c-space-5) var(--c-space-16);
  width: 100%;
`;
// Positioning context for the display-name gate overlay: it covers the content
// but leaves the chrome bar (Settings, etc.) reachable.
const Content = styled.div`position: relative;`;

const Layout = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--c-space-6);
`;

const Rail = styled.aside`
  display: flex; flex-direction: column; gap: var(--c-space-3);
  padding: var(--c-space-4);
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: var(--c-radius-md);
  order: 2;
`;
const RailHead = styled.h3`
  font-size: var(--c-text-xs); font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.5px; color: ${C.mutedSoft};
`;
const RailList = styled.div`display: flex; flex-direction: column; gap: var(--c-space-2);`;
const RailItem = styled.button<{ $active: boolean }>`
  ${tapTarget}
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  text-align: left;
  padding: var(--c-space-2) var(--c-space-3);
  background: ${(p) => (p.$active ? C.paper : 'transparent')};
  border: 1px solid ${(p) => (p.$active ? C.lineAccent : 'transparent')};
  border-radius: var(--c-radius-sm);
  cursor: pointer;
  strong { font-size: var(--c-text-sm); color: ${C.ink}; }
  span { font-size: var(--c-text-xs); color: ${C.mutedSoft}; }
  ${focusRing}
`;
const UploadForm = styled.form`
  display: flex; flex-direction: column; gap: var(--c-space-2);
  padding-top: var(--c-space-3);
  border-top: 1px solid ${C.line};
  input {
    padding: var(--c-space-2) var(--c-space-3);
    font-family: inherit; font-size: var(--c-text-sm);
    color: ${C.ink}; background: ${C.paper};
    border: 1px solid ${C.line}; border-radius: var(--c-radius-sm); outline: none;
    ${focusRing}
  }
`;

const Main = styled.div`display: flex; flex-direction: column; gap: var(--c-space-5); min-width: 0;`;

const IconWrap = styled.div`color: ${C.accentText}; margin-bottom: var(--c-space-2);`;

const Toolbar = styled.div`
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--c-space-4);
  h1 { font-size: var(--c-text-xl); color: ${C.ink}; }
  .sub { margin-top: var(--c-space-1); font-size: var(--c-text-sm); color: ${C.muted}; }
`;
const VersionPill = styled.span`
  flex-shrink: 0;
  font-size: var(--c-text-xs); color: ${C.muted};
  background: ${C.paper2}; border: 1px solid ${C.line};
  padding: var(--c-space-1) var(--c-space-3); border-radius: var(--c-radius-pill);
`;

const ListHead = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: var(--c-space-3); flex-wrap: wrap;
  h2 { font-size: var(--c-text-lg); color: ${C.ink}; }
`;
const Tabs = styled.div`display: flex; gap: var(--c-space-2);`;
const Tab = styled.button<{ $active: boolean }>`
  ${tapTarget}
  font-size: var(--c-text-sm);
  padding: var(--c-space-1) var(--c-space-3);
  border-radius: var(--c-radius-pill);
  border: 1px solid ${(p) => (p.$active ? C.accent : C.line)};
  background: ${(p) => (p.$active ? C.accent : 'transparent')};
  color: ${(p) => (p.$active ? C.accentInk : C.muted)};
  font-weight: ${(p) => (p.$active ? 600 : 500)};
  cursor: pointer;
  ${focusRing}
`;

const List = styled.div`
  display: flex; flex-direction: column;
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: var(--c-radius-md);
`;
const PinRow = styled.div<{ $resolved: boolean }>`
  display: flex; gap: var(--c-space-3);
  padding: var(--c-space-4);
  border-bottom: 1px solid ${C.line};
  &:last-child { border-bottom: none; }
  opacity: ${(p) => (p.$resolved ? 0.85 : 1)};
`;
const PinNum = styled.div<{ $resolved: boolean }>`
  ${tapTarget}
  flex-shrink: 0;
  width: var(--c-space-7); height: var(--c-space-7);
  border-radius: var(--c-radius-pill);
  display: flex; align-items: center; justify-content: center;
  font-size: var(--c-text-xs); font-weight: 700;
  background: ${(p) => (p.$resolved ? 'color-mix(in srgb, var(--c-green) 14%, transparent)' : C.paper)};
  color: ${(p) => (p.$resolved ? C.green : C.muted)};
  border: 1px solid ${(p) => (p.$resolved ? 'color-mix(in srgb, var(--c-green) 40%, transparent)' : C.line)};
`;
const PinBody = styled.div`
  flex: 1; min-width: 0;
  .text { font-size: var(--c-text-base); color: ${C.ink}; margin: var(--c-space-1) 0 var(--c-space-2); word-break: break-word; }
`;
const PinMeta = styled.div`
  display: flex; align-items: center; gap: var(--c-space-2); flex-wrap: wrap;
  time { font-size: var(--c-text-xs); color: ${C.mutedSoft}; }
`;
const ResolvedBadge = styled.span`
  margin-left: auto;
  font-size: var(--c-text-xs); font-weight: 600; color: ${C.green};
  border: 1px solid color-mix(in srgb, var(--c-green) 40%, transparent);
  padding: 1px var(--c-space-2); border-radius: var(--c-radius-pill);
`;
const PinActions = styled.div`
  display: flex; gap: var(--c-space-3);
  button {
    ${tapTarget}
    background: none; border: none; padding: 0; cursor: pointer;
    font-family: inherit; font-size: var(--c-text-sm); font-weight: 600;
    color: ${C.accentText};
    &.danger { color: ${C.danger}; }
    &.muted, &:disabled { color: ${C.mutedSoft}; cursor: default; }
    ${focusRing}
  }
  span.muted { font-size: var(--c-text-sm); color: ${C.mutedSoft}; }
`;
const EditForm = styled.div`
  display: flex; flex-direction: column; gap: var(--c-space-2); margin-top: var(--c-space-1);
  textarea {
    width: 100%; resize: vertical; min-height: 56px;
    font-family: inherit; font-size: var(--c-text-base);
    color: ${C.ink}; background: ${C.paper};
    border: 1px solid ${C.line}; border-radius: var(--c-radius-sm);
    padding: var(--c-space-2) var(--c-space-3); outline: none;
    ${focusRing}
  }
`;

const Row = styled.div`display: flex; gap: var(--c-space-3); justify-content: center; flex-wrap: wrap;`;
const WorkspaceNameField = styled.input`
  width: 100%;
  margin-bottom: var(--c-space-4);
  padding: var(--c-space-2) var(--c-space-3);
  font-family: inherit; font-size: var(--c-text-base); text-align: center;
  color: ${C.ink}; background: ${C.paper};
  border: 1px solid ${C.line}; border-radius: var(--c-radius-sm); outline: none;
  ${focusRing}
`;
