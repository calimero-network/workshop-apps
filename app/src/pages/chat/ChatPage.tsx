/**
 * IncidentCommandPage — main app shell for incident-command.
 *
 * Views:
 *  - IncidentDashboard  (default): open/acknowledged incidents sorted by severity
 *  - IncidentDetailPage            : full incident view with timeline
 *  - PostmortemEditor               : collaborative postmortem for a resolved incident
 *  - OnCallSchedule                 : on-call rotation view (team-lead editable)
 */

import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { useIncidentWorkspace } from '../../hooks/useIncidentWorkspace';
import { useIncidentManager } from '../../hooks/useIncidentManager';
import { C } from '../../theme';
import Sidebar from '../../components/Sidebar';
import CreateWorkspaceModal from '../../components/CreateWorkspaceModal';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import WorkspacesEmptyState from '../../components/WorkspacesEmptyState';

// ── Severity helpers ──────────────────────────────────────────────────────────
const SEV_COLOR: Record<string, string> = {
  P1: '#DC2626', P2: '#EA580C', P3: '#CA8A04', P4: '#16A34A',
};
const SEV_BG: Record<string, string> = {
  P1: 'rgba(220,38,38,0.12)', P2: 'rgba(234,88,12,0.12)',
  P3: 'rgba(202,138,4,0.12)', P4: 'rgba(22,163,74,0.12)',
};
const STATUS_COLOR: Record<string, string> = {
  open: '#DC2626', acknowledged: '#CA8A04', resolved: '#16A34A',
};

function SeverityBadge({ sev }: { sev: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
      background: SEV_BG[sev] || SEV_BG.P4,
      color: SEV_COLOR[sev] || SEV_COLOR.P4,
      border: `1px solid ${SEV_COLOR[sev] || SEV_COLOR.P4}30`,
    }}>
      {sev}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: STATUS_COLOR[status] || '#888' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[status] || '#888', display: 'inline-block' }} />
      {status}
    </span>
  );
}

function shortenId(id: string) { return id.length > 12 ? id.slice(0, 6) + '…' + id.slice(-4) : id; }

// ── Report Incident Modal ─────────────────────────────────────────────────────
interface ReportModalProps {
  onSubmit: (title: string, desc: string, severity: string) => Promise<void>;
  onClose: () => void;
}
function ReportIncidentModal({ onSubmit, onClose }: ReportModalProps) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [sev, setSev] = useState('P2');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setLoading(true); setError(null);
    try {
      await onSubmit(title.trim(), desc.trim(), sev);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to report incident');
    } finally { setLoading(false); }
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()}>
        <ModalTitle>Report Incident</ModalTitle>
        <Field>
          <label>Severity</label>
          <SevRow>
            {['P1', 'P2', 'P3', 'P4'].map((s) => (
              <SevBtn key={s} $active={sev === s} $color={SEV_COLOR[s]} onClick={() => setSev(s)}>{s}</SevBtn>
            ))}
          </SevRow>
        </Field>
        <Field>
          <label>Title</label>
          <StyledInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief incident title…"
            maxLength={120}
            autoFocus
          />
        </Field>
        <Field>
          <label>Description</label>
          <StyledTextarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What is happening? Impact? Timeline?"
            rows={4}
          />
        </Field>
        {error && <ErrorMsg>{error}</ErrorMsg>}
        <ModalActions>
          <CancelBtn onClick={onClose}>Cancel</CancelBtn>
          <DangerBtn onClick={submit} disabled={loading}>
            {loading ? 'Reporting…' : 'Report Incident'}
          </DangerBtn>
        </ModalActions>
      </ModalBox>
    </ModalOverlay>
  );
}

// ── Escalate Modal ────────────────────────────────────────────────────────────
interface EscalateModalProps {
  onSubmit: (nextId: string) => Promise<void>;
  onClose: () => void;
}
function EscalateModal({ onSubmit, onClose }: EscalateModalProps) {
  const [nextId, setNextId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!nextId.trim()) { setError('Responder ID is required'); return; }
    setLoading(true); setError(null);
    try { await onSubmit(nextId.trim()); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  };
  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()}>
        <ModalTitle>Escalate Incident</ModalTitle>
        <Field>
          <label>Next Responder ID (member public key)</label>
          <StyledInput value={nextId} onChange={(e) => setNextId(e.target.value)} placeholder="member-xxxx" autoFocus />
        </Field>
        {error && <ErrorMsg>{error}</ErrorMsg>}
        <ModalActions>
          <CancelBtn onClick={onClose}>Cancel</CancelBtn>
          <WarnBtn onClick={submit} disabled={loading}>{loading ? 'Escalating…' : 'Escalate'}</WarnBtn>
        </ModalActions>
      </ModalBox>
    </ModalOverlay>
  );
}

// ── Resolve Modal ─────────────────────────────────────────────────────────────
interface ResolveModalProps {
  onSubmit: (rootCause: string) => Promise<void>;
  onClose: () => void;
}
function ResolveModal({ onSubmit, onClose }: ResolveModalProps) {
  const [rootCause, setRootCause] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!rootCause.trim()) { setError('Root cause is required'); return; }
    setLoading(true); setError(null);
    try { await onSubmit(rootCause.trim()); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  };
  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()}>
        <ModalTitle>Resolve Incident</ModalTitle>
        <Field>
          <label>Root Cause</label>
          <StyledTextarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} placeholder="What caused this incident?" rows={3} autoFocus />
        </Field>
        {error && <ErrorMsg>{error}</ErrorMsg>}
        <ModalActions>
          <CancelBtn onClick={onClose}>Cancel</CancelBtn>
          <GreenBtn onClick={submit} disabled={loading}>{loading ? 'Resolving…' : 'Mark Resolved'}</GreenBtn>
        </ModalActions>
      </ModalBox>
    </ModalOverlay>
  );
}

// ── Add On-Call Slot Modal ────────────────────────────────────────────────────
interface AddSlotModalProps {
  onSubmit: (name: string, id: string, start: number, end: number, order: number) => Promise<string>;
  onClose: () => void;
  nextOrder: number;
}
function AddSlotModal({ onSubmit, onClose, nextOrder }: AddSlotModalProps) {
  const [name, setName] = useState('');
  const [memberId, setMemberId] = useState('');
  const [startStr, setStartStr] = useState('');
  const [endStr, setEndStr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !memberId.trim() || !startStr || !endStr) {
      setError('All fields are required'); return;
    }
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) { setError('Invalid date range'); return; }
    setLoading(true); setError(null);
    try { await onSubmit(name.trim(), memberId.trim(), start, end, nextOrder); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox onClick={(e) => e.stopPropagation()}>
        <ModalTitle>Add On-Call Slot</ModalTitle>
        <Field><label>Member Name</label><StyledInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Alice Chen" autoFocus /></Field>
        <Field><label>Member ID (public key)</label><StyledInput value={memberId} onChange={(e) => setMemberId(e.target.value)} placeholder="member-xxxx" /></Field>
        <Field><label>Start (local time)</label><StyledInput type="datetime-local" value={startStr} onChange={(e) => setStartStr(e.target.value)} /></Field>
        <Field><label>End (local time)</label><StyledInput type="datetime-local" value={endStr} onChange={(e) => setEndStr(e.target.value)} /></Field>
        {error && <ErrorMsg>{error}</ErrorMsg>}
        <ModalActions>
          <CancelBtn onClick={onClose}>Cancel</CancelBtn>
          <GreenBtn onClick={submit} disabled={loading}>{loading ? 'Adding…' : 'Add Slot'}</GreenBtn>
        </ModalActions>
      </ModalBox>
    </ModalOverlay>
  );
}

// ── IncidentDashboard view ────────────────────────────────────────────────────
type DashboardProps = {
  im: ReturnType<typeof useIncidentManager>;
  selfIdentity: string | null;
  onReport: () => void;
  onSelectIncident: (id: string) => void;
};
function IncidentDashboard({ im, onReport, onSelectIncident }: DashboardProps) {
  const activeFilter = im.statusFilter;

  const filterBtns: { label: string; value: string | null }[] = [
    { label: 'Active', value: null },
    { label: 'Open', value: 'open' },
    { label: 'Acknowledged', value: 'acknowledged' },
    { label: 'Resolved', value: 'resolved' },
  ];

  return (
    <ViewRoot>
      <ViewHeader>
        <div>
          <ViewTitle>Incident Dashboard</ViewTitle>
          <ViewSub>{im.incidents.length} incident{im.incidents.length !== 1 ? 's' : ''}</ViewSub>
        </div>
        <ReportBtn onClick={onReport}>⚡ Report Incident</ReportBtn>
      </ViewHeader>

      <FilterRow>
        {filterBtns.map((f) => (
          <FilterBtn key={String(f.value)} $active={activeFilter === f.value} onClick={() => im.setStatusFilter(f.value)}>
            {f.label}
          </FilterBtn>
        ))}
      </FilterRow>

      {im.incidentsLoading && <Loading>Loading incidents…</Loading>}
      {!im.incidentsLoading && im.incidents.length === 0 && (
        <EmptyState>
          <span>✅</span>
          <strong>All clear</strong>
          <span>No incidents match this filter.</span>
        </EmptyState>
      )}

      <IncidentList>
        {im.incidents.map((inc) => (
          <IncidentCard key={inc.id} onClick={() => onSelectIncident(inc.id)}>
            <CardTop>
              <SeverityBadge sev={inc.severity} />
              <StatusDot status={inc.status} />
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888' }}>
                {new Date(inc.created_at).toLocaleString()}
              </span>
            </CardTop>
            <CardTitle>{inc.title}</CardTitle>
            <CardDesc>{inc.description}</CardDesc>
            {inc.commander && (
              <CardMeta>🧑‍✈️ Commander: {shortenId(inc.commander)}</CardMeta>
            )}
          </IncidentCard>
        ))}
      </IncidentList>
    </ViewRoot>
  );
}

// ── IncidentDetailPage view ───────────────────────────────────────────────────
type DetailProps = {
  im: ReturnType<typeof useIncidentManager>;
  selfIdentity: string | null;
  members: import('@calimero-network/mero-react').GroupMember[];
  onBack: () => void;
  onOpenPostmortem: () => void;
};
function IncidentDetailPage({ im, selfIdentity, members, onBack, onOpenPostmortem }: DetailProps) {
  const inc = im.selectedIncident;
  const [note, setNote] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);
  const [showResolve, setShowResolve] = useState(false);

  if (!inc) return <Loading>Loading incident…</Loading>;

  const canAck = inc.status === 'open';
  const canEscalate = inc.status === 'open';
  const canResolve = inc.status === 'acknowledged';
  const isResolved = inc.status === 'resolved';

  const submitNote = async () => {
    if (!note.trim()) return;
    setNoteLoading(true);
    try {
      await im.postTimelineEntry(inc.id, note.trim(), 'note');
      setNote('');
    } catch { /* keep note */ }
    finally { setNoteLoading(false); }
  };

  const memberMap = Object.fromEntries(members.map((m) => [m.identity, m.name || m.identity]));

  return (
    <ViewRoot>
      <ViewHeader>
        <BackBtn onClick={onBack}>← Back</BackBtn>
        <div style={{ flex: 1 }}>
          <ViewTitle style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SeverityBadge sev={inc.severity} />
            {inc.title}
          </ViewTitle>
          <ViewSub>
            <StatusDot status={inc.status} /> · reported by {shortenId(inc.reported_by)}
            {inc.commander && ` · commander: ${shortenId(inc.commander)}`}
          </ViewSub>
        </div>
      </ViewHeader>

      <DetailBody>
        <DetailLeft>
          <DescBox>{inc.description || <em>No description.</em>}</DescBox>

          {/* Action bar */}
          {!isResolved && (
            <ActionBar>
              {canAck && (
                <ActionBtn $variant="warn"
                  onClick={() => im.acknowledgeIncident(inc.id)}>
                  Acknowledge
                </ActionBtn>
              )}
              {canEscalate && (
                <ActionBtn $variant="ghost" onClick={() => setShowEscalate(true)}>
                  Escalate
                </ActionBtn>
              )}
              {canResolve && (
                <ActionBtn $variant="green" onClick={() => setShowResolve(true)}>
                  Resolve
                </ActionBtn>
              )}
            </ActionBar>
          )}

          {isResolved && (
            <ResolvedBox>
              ✅ Resolved {inc.resolved_at ? `at ${new Date(inc.resolved_at).toLocaleString()}` : ''}
              {inc.root_cause && <><br />Root cause: <strong>{inc.root_cause}</strong></>}
              <div style={{ marginTop: 10 }}>
                <ActionBtn $variant="green" onClick={onOpenPostmortem}>Open Postmortem →</ActionBtn>
              </div>
            </ResolvedBox>
          )}

          {/* Timeline */}
          <SectionLabel>Timeline</SectionLabel>
          {im.timelineLoading && <Loading>Loading timeline…</Loading>}
          {!im.timelineLoading && im.timeline.length === 0 && (
            <EmptyInline>No timeline entries yet.</EmptyInline>
          )}
          <Timeline>
            {im.timeline.map((entry) => (
              <TLEntry key={entry.id}>
                <TLDot $type={entry.entry_type} />
                <TLContent>
                  <TLMeta>
                    <strong>{memberMap[entry.author] || shortenId(entry.author)}</strong>
                    {' · '}
                    <span style={{ color: '#888', fontSize: 11 }}>{entry.entry_type}</span>
                    {' · '}
                    <span style={{ color: '#888', fontSize: 11 }}>{new Date(entry.created_at).toLocaleString()}</span>
                  </TLMeta>
                  <TLBody>{entry.body}</TLBody>
                </TLContent>
              </TLEntry>
            ))}
          </Timeline>

          {!isResolved && (
            <NoteBox>
              <NoteInput
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Post a timeline update…"
                rows={2}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitNote(); }}
              />
              <NoteSubmit onClick={submitNote} disabled={!note.trim() || noteLoading}>
                {noteLoading ? '…' : 'Post'}
              </NoteSubmit>
            </NoteBox>
          )}
        </DetailLeft>

        <DetailRight>
          <MetaCard>
            <MetaRow><MetaKey>ID</MetaKey><MetaVal>{inc.id}</MetaVal></MetaRow>
            <MetaRow><MetaKey>Severity</MetaKey><MetaVal><SeverityBadge sev={inc.severity} /></MetaVal></MetaRow>
            <MetaRow><MetaKey>Status</MetaKey><MetaVal><StatusDot status={inc.status} /></MetaVal></MetaRow>
            <MetaRow><MetaKey>Reporter</MetaKey><MetaVal>{shortenId(inc.reported_by)}</MetaVal></MetaRow>
            {inc.commander && <MetaRow><MetaKey>Commander</MetaKey><MetaVal>{shortenId(inc.commander)}</MetaVal></MetaRow>}
            <MetaRow><MetaKey>Opened</MetaKey><MetaVal>{new Date(inc.created_at).toLocaleString()}</MetaVal></MetaRow>
            {inc.resolved_at && <MetaRow><MetaKey>Resolved</MetaKey><MetaVal>{new Date(inc.resolved_at).toLocaleString()}</MetaVal></MetaRow>}
          </MetaCard>
        </DetailRight>
      </DetailBody>

      {showEscalate && (
        <EscalateModal
          onSubmit={(nextId) => im.escalateIncident(inc.id, nextId)}
          onClose={() => setShowEscalate(false)}
        />
      )}
      {showResolve && (
        <ResolveModal
          onSubmit={(rc) => im.resolveIncident(inc.id, rc)}
          onClose={() => setShowResolve(false)}
        />
      )}
    </ViewRoot>
  );
}

// ── PostmortemEditor view ─────────────────────────────────────────────────────
type PostmortemProps = {
  im: ReturnType<typeof useIncidentManager>;
  selfIdentity: string | null;
  onBack: () => void;
};
function PostmortemEditor({ im, selfIdentity, onBack }: PostmortemProps) {
  const inc = im.selectedIncident;
  const pm = im.postmortem;

  const [summary, setSummary] = useState(pm?.summary || '');
  const [rootCause, setRootCause] = useState(pm?.root_cause || '');
  const [actionItems, setActionItems] = useState(pm?.action_items || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync from server value whenever it changes
  useEffect(() => { setSummary(pm?.summary || ''); }, [pm?.summary]);
  useEffect(() => { setRootCause(pm?.root_cause || ''); }, [pm?.root_cause]);
  useEffect(() => { setActionItems(pm?.action_items || ''); }, [pm?.action_items]);

  const save = async () => {
    if (!inc) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      if (pm) {
        await im.updatePostmortem(pm.id, summary, rootCause, actionItems);
      } else {
        await im.createPostmortem(inc.id, summary, rootCause, actionItems);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  if (!inc) return <Loading>Loading…</Loading>;

  return (
    <ViewRoot>
      <ViewHeader>
        <BackBtn onClick={onBack}>← Detail</BackBtn>
        <div>
          <ViewTitle>Postmortem — {inc.title}</ViewTitle>
          <ViewSub>{pm ? `Last edited by ${shortenId(pm.last_edited_by)}` : 'No postmortem yet — create one below'}</ViewSub>
        </div>
        <SaveBtn onClick={save} disabled={saving}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
        </SaveBtn>
      </ViewHeader>

      {im.postmortemLoading && <Loading>Loading postmortem…</Loading>}

      <PMGrid>
        <PMField>
          <PMLabel>Summary</PMLabel>
          <PMTextarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What happened? What was the impact?"
            rows={4}
          />
        </PMField>
        <PMField>
          <PMLabel>Root Cause</PMLabel>
          <PMTextarea
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            placeholder="Why did this happen? The underlying cause."
            rows={4}
          />
        </PMField>
        <PMField style={{ gridColumn: '1 / -1' }}>
          <PMLabel>Action Items</PMLabel>
          <PMTextarea
            value={actionItems}
            onChange={(e) => setActionItems(e.target.value)}
            placeholder="1. Add alerting for X&#10;2. Update runbook&#10;3. ..."
            rows={6}
          />
        </PMField>
      </PMGrid>

      {error && <ErrorMsg>{error}</ErrorMsg>}
    </ViewRoot>
  );
}

// ── OnCallSchedule view ───────────────────────────────────────────────────────
type OnCallProps = {
  im: ReturnType<typeof useIncidentManager>;
  isAdmin: boolean;
};
function OnCallScheduleView({ im, isAdmin }: OnCallProps) {
  const [showAdd, setShowAdd] = useState(false);
  const now = Date.now();
  const current = im.oncallSchedule.find((s) => s.start_time <= now && s.end_time >= now);

  return (
    <ViewRoot>
      <ViewHeader>
        <div>
          <ViewTitle>On-Call Schedule</ViewTitle>
          <ViewSub>
            {current
              ? <>Currently on-call: <strong>{current.member_name}</strong></>
              : 'No one currently scheduled on-call'}
          </ViewSub>
        </div>
        {isAdmin && (
          <GreenBtn onClick={() => setShowAdd(true)}>+ Add Slot</GreenBtn>
        )}
      </ViewHeader>

      {im.oncallLoading && <Loading>Loading schedule…</Loading>}
      {!im.oncallLoading && im.oncallSchedule.length === 0 && (
        <EmptyState>
          <span>📅</span>
          <strong>No on-call slots</strong>
          {isAdmin ? <span>Add the first slot using the button above.</span> : <span>Ask a team lead to set up the schedule.</span>}
        </EmptyState>
      )}

      <SlotList>
        {im.oncallSchedule.map((slot) => {
          const isCurrent = slot.start_time <= now && slot.end_time >= now;
          const isPast = slot.end_time < now;
          return (
            <SlotCard key={slot.id} $current={isCurrent} $past={isPast}>
              <SlotLeft>
                <SlotName>{slot.member_name}</SlotName>
                <SlotId>{shortenId(slot.member_id)}</SlotId>
                <SlotTime>
                  {new Date(slot.start_time).toLocaleString()} → {new Date(slot.end_time).toLocaleString()}
                </SlotTime>
              </SlotLeft>
              <SlotRight>
                {isCurrent && <OnBadge>ON CALL</OnBadge>}
                {isPast && <OffBadge>PAST</OffBadge>}
                {isAdmin && (
                  <RemoveBtn onClick={() => im.removeOncallSlot(slot.id)}>✕</RemoveBtn>
                )}
              </SlotRight>
            </SlotCard>
          );
        })}
      </SlotList>

      {showAdd && (
        <AddSlotModal
          onSubmit={im.setOncallSlot}
          onClose={() => setShowAdd(false)}
          nextOrder={im.oncallSchedule.length + 1}
        />
      )}
    </ViewRoot>
  );
}

// ── Active view enum ──────────────────────────────────────────────────────────
type ActiveView = 'dashboard' | 'detail' | 'postmortem' | 'oncall';

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const workspace = useIncidentWorkspace();
  const im = useIncidentManager(workspace.contextId, workspace.executorPublicKey);

  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [showReport, setShowReport] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // Poll members (no SSE channel for namespace joins)
  useEffect(() => {
    if (!workspace.namespaceId) return;
    const id = setInterval(() => { void workspace.refetchMembers(); }, 5_000);
    return () => clearInterval(id);
  }, [workspace.namespaceId, workspace.refetchMembers]);

  const handleReport = useCallback(async (title: string, desc: string, sev: string) => {
    await im.reportIncident(title, desc, sev);
    setShowReport(false);
  }, [im]);

  const handleSelectIncident = useCallback((id: string) => {
    im.selectIncident(id);
    setActiveView('detail');
  }, [im]);

  // Current on-call badge for sidebar
  const now = Date.now();
  const currentOncall = im.oncallSchedule.find((s) => s.start_time <= now && s.end_time >= now);

  // Welcome gate: show only when no workspaces at all
  if (workspace.workspaces.length === 0 && !workspace.workspacesLoading) {
    return (
      <>
        <WorkspacesEmptyState
          onCreateWorkspace={() => setShowCreateWorkspace(true)}
          onJoin={() => setShowJoin(true)}
        />
        {showCreateWorkspace && (
          <CreateWorkspaceModal
            onCreate={async (name) => { await workspace.createWorkspace(name); }}
            onClose={() => setShowCreateWorkspace(false)}
          />
        )}
        {showJoin && (
          <JoinModal
            onJoin={async (json) => { await workspace.joinWorkspace(json); setShowJoin(false); }}
            onClose={() => setShowJoin(false)}
          />
        )}
      </>
    );
  }

  return (
    <AppShell>
      <Sidebar
        workspaces={workspace.workspaces}
        selectedNamespaceId={workspace.namespaceId}
        onSelectWorkspace={workspace.selectWorkspace}
        onCreateWorkspace={() => setShowCreateWorkspace(true)}
        workspaceAlias={workspace.selectedWorkspace?.alias}
        members={workspace.members}
        selfIdentity={workspace.selfIdentity}
        onlineMembers={new Set()}
        memberNames={{}}
        onSetName={async () => {}}
        rooms={[]}
        selectedRoomId={null}
        onSelectRoom={() => {}}
        onCreateRoom={() => {}}
        onInvite={() => setShowInvite(true)}
        viewerIsAdmin={workspace.isAdmin}
        onSetMemberRole={workspace.setMemberRole}
        onRemoveMember={workspace.removeMember}
        collapsed={false}
        onToggleCollapse={() => {}}
        // Custom incident nav
        activeView={activeView}
        onSetActiveView={setActiveView}
        onCallName={currentOncall?.member_name ?? null}
        openIncidentCount={im.incidents.filter((i) => i.status !== 'resolved').length}
      />

      <MainArea>
        {activeView === 'dashboard' && (
          <IncidentDashboard
            im={im}
            selfIdentity={workspace.selfIdentity}
            onReport={() => setShowReport(true)}
            onSelectIncident={handleSelectIncident}
          />
        )}
        {activeView === 'detail' && (
          <IncidentDetailPage
            im={im}
            selfIdentity={workspace.selfIdentity}
            members={workspace.members}
            onBack={() => setActiveView('dashboard')}
            onOpenPostmortem={() => setActiveView('postmortem')}
          />
        )}
        {activeView === 'postmortem' && (
          <PostmortemEditor
            im={im}
            selfIdentity={workspace.selfIdentity}
            onBack={() => setActiveView('detail')}
          />
        )}
        {activeView === 'oncall' && (
          <OnCallScheduleView im={im} isAdmin={workspace.isAdmin} />
        )}
      </MainArea>

      {showReport && (
        <ReportIncidentModal onSubmit={handleReport} onClose={() => setShowReport(false)} />
      )}
      {showInvite && (
        <InviteModal onInvite={workspace.inviteUser} onClose={() => setShowInvite(false)} />
      )}
      {showCreateWorkspace && (
        <CreateWorkspaceModal
          onCreate={async (name) => { await workspace.createWorkspace(name); }}
          onClose={() => setShowCreateWorkspace(false)}
        />
      )}
      {showJoin && (
        <JoinModal
          onJoin={async (json) => { await workspace.joinWorkspace(json); setShowJoin(false); }}
          onClose={() => setShowJoin(false)}
        />
      )}
    </AppShell>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const AppShell = styled.div`
  display: flex; height: 100vh; overflow: hidden;
  background: var(--c-paper, #fff);
  color: var(--c-ink, #0e140f);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
`;
const MainArea = styled.div`
  flex: 1; display: flex; flex-direction: column; overflow: hidden;
  background: var(--c-paper2, #f5f8f1);
  min-width: 0;
`;
const ViewRoot = styled.div`
  flex: 1; display: flex; flex-direction: column; overflow-y: auto; min-height: 0;
`;
const ViewHeader = styled.div`
  display: flex; align-items: flex-start; gap: 14px;
  padding: 22px 28px 16px;
  border-bottom: 1px solid var(--c-line, #e7ece2);
  background: var(--c-paper, #fff);
  flex-shrink: 0;
`;
const ViewTitle = styled.h2`
  margin: 0 0 4px; font-size: 20px; font-weight: 800; letter-spacing: -0.4px;
  color: var(--c-ink, #0e140f);
`;
const ViewSub = styled.div`
  font-size: 13px; color: #666;
`;
const BackBtn = styled.button`
  flex-shrink: 0; padding: 8px 14px; border-radius: 9px; font-size: 13px; font-weight: 600;
  color: #555; background: var(--c-paper2, #f5f8f1); border: 1px solid var(--c-line, #e7ece2);
  cursor: pointer; align-self: center;
  &:hover { background: #eee; }
`;
const ReportBtn = styled.button`
  margin-left: auto; flex-shrink: 0; padding: 10px 18px; border-radius: 10px;
  font-size: 13.5px; font-weight: 700; cursor: pointer;
  background: #DC2626; color: #fff; border: 1px solid #b91c1c;
  align-self: flex-start;
  &:hover { background: #b91c1c; }
`;

const FilterRow = styled.div`
  display: flex; gap: 6px; padding: 12px 28px;
  border-bottom: 1px solid var(--c-line, #e7ece2);
  background: var(--c-paper, #fff); flex-shrink: 0;
`;
const FilterBtn = styled.button<{ $active: boolean }>`
  padding: 5px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 600; cursor: pointer;
  border: 1px solid ${(p) => p.$active ? '#DC2626' : 'var(--c-line, #e7ece2)'};
  background: ${(p) => p.$active ? 'rgba(220,38,38,0.1)' : 'transparent'};
  color: ${(p) => p.$active ? '#DC2626' : '#666'};
`;

const IncidentList = styled.div`
  display: flex; flex-direction: column; gap: 8px; padding: 16px 28px;
  overflow-y: auto; flex: 1;
`;
const IncidentCard = styled.div`
  padding: 14px 16px; border-radius: 12px; cursor: pointer;
  background: var(--c-paper, #fff); border: 1px solid var(--c-line, #e7ece2);
  transition: box-shadow 0.15s, border-color 0.15s;
  &:hover { border-color: #DC262660; box-shadow: 0 2px 12px rgba(220,38,38,0.08); }
`;
const CardTop = styled.div`
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
`;
const CardTitle = styled.div`
  font-size: 15px; font-weight: 700; color: var(--c-ink, #0e140f); margin-bottom: 4px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;
const CardDesc = styled.div`
  font-size: 13px; color: #666; overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
`;
const CardMeta = styled.div`
  font-size: 12px; color: #888; margin-top: 6px;
`;

const DetailBody = styled.div`
  display: flex; flex: 1; overflow: hidden; min-height: 0;
`;
const DetailLeft = styled.div`
  flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 14px;
`;
const DetailRight = styled.div`
  width: 240px; flex-shrink: 0; overflow-y: auto; padding: 20px 16px;
  border-left: 1px solid var(--c-line, #e7ece2);
`;
const DescBox = styled.div`
  font-size: 14px; color: #444; line-height: 1.6;
  background: var(--c-paper, #fff); border: 1px solid var(--c-line, #e7ece2);
  border-radius: 10px; padding: 14px 16px;
`;
const ActionBar = styled.div`
  display: flex; gap: 8px; flex-wrap: wrap;
`;
const ActionBtn = styled.button<{ $variant: 'warn' | 'green' | 'ghost' }>`
  padding: 9px 18px; border-radius: 9px; font-size: 13px; font-weight: 700; cursor: pointer;
  border: 1px solid;
  ${(p) => p.$variant === 'warn' && `background: rgba(202,138,4,0.12); color: #92400e; border-color: #CA8A0440;`}
  ${(p) => p.$variant === 'green' && `background: #16A34A; color: #fff; border-color: #15803d;`}
  ${(p) => p.$variant === 'ghost' && `background: transparent; color: #555; border-color: var(--c-line, #e7ece2);`}
  &:hover { opacity: 0.85; }
`;
const ResolvedBox = styled.div`
  padding: 14px 16px; border-radius: 10px; background: rgba(22,163,74,0.08);
  border: 1px solid rgba(22,163,74,0.3); color: #15803d; font-size: 14px; line-height: 1.6;
`;
const SectionLabel = styled.div`
  font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  color: #888; margin-top: 4px;
`;
const Timeline = styled.div`
  display: flex; flex-direction: column; gap: 12px;
`;
const TLEntry = styled.div`
  display: flex; gap: 10px; align-items: flex-start;
`;
const TLDot = styled.div<{ $type: string }>`
  width: 9px; height: 9px; border-radius: 50%; margin-top: 6px; flex-shrink: 0;
  background: ${(p) => p.$type === 'escalation' ? '#EA580C' : p.$type === 'status_update' ? '#CA8A04' : '#16A34A'};
`;
const TLContent = styled.div`flex: 1;`;
const TLMeta = styled.div`font-size: 12px; color: #888; margin-bottom: 3px;`;
const TLBody = styled.div`font-size: 13.5px; color: var(--c-ink, #0e140f); line-height: 1.5;`;
const NoteBox = styled.div`
  display: flex; gap: 8px; align-items: flex-start;
  background: var(--c-paper, #fff); border: 1px solid var(--c-line, #e7ece2);
  border-radius: 10px; padding: 10px 12px;
`;
const NoteInput = styled.textarea`
  flex: 1; resize: none; background: transparent; border: none; outline: none;
  font-size: 13.5px; color: var(--c-ink, #0e140f); line-height: 1.5;
  font-family: inherit;
`;
const NoteSubmit = styled.button`
  padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 700;
  background: #DC2626; color: #fff; border: none; cursor: pointer; align-self: flex-end;
  &:disabled { opacity: 0.4; cursor: default; }
`;
const MetaCard = styled.div`
  background: var(--c-paper, #fff); border: 1px solid var(--c-line, #e7ece2);
  border-radius: 10px; padding: 12px;
`;
const MetaRow = styled.div`
  display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px;
  &:last-child { margin-bottom: 0; }
`;
const MetaKey = styled.div`font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888;`;
const MetaVal = styled.div`font-size: 12.5px; color: var(--c-ink, #0e140f); word-break: break-all;`;

const PMGrid = styled.div`
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
  padding: 20px 28px; flex: 1;
`;
const PMField = styled.div`
  display: flex; flex-direction: column; gap: 6px;
`;
const PMLabel = styled.label`
  font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #888;
`;
const PMTextarea = styled.textarea`
  flex: 1; padding: 12px 14px; border-radius: 10px; resize: vertical;
  border: 1px solid var(--c-line, #e7ece2); background: var(--c-paper, #fff);
  font-size: 14px; font-family: inherit; color: var(--c-ink, #0e140f); line-height: 1.6;
  &:focus { outline: none; border-color: #DC262660; box-shadow: 0 0 0 3px rgba(220,38,38,0.08); }
`;
const SaveBtn = styled.button`
  margin-left: auto; flex-shrink: 0; padding: 9px 18px; border-radius: 9px;
  font-size: 13px; font-weight: 700; cursor: pointer; align-self: flex-start;
  background: #16A34A; color: #fff; border: 1px solid #15803d;
  &:disabled { opacity: 0.5; cursor: default; }
`;

const SlotList = styled.div`
  display: flex; flex-direction: column; gap: 8px; padding: 16px 28px;
`;
const SlotCard = styled.div<{ $current: boolean; $past: boolean }>`
  display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 12px;
  border: 1px solid ${(p) => p.$current ? 'rgba(22,163,74,0.4)' : 'var(--c-line, #e7ece2)'};
  background: ${(p) => p.$current ? 'rgba(22,163,74,0.06)' : 'var(--c-paper, #fff)'};
  opacity: ${(p) => p.$past ? 0.5 : 1};
`;
const SlotLeft = styled.div`flex: 1; display: flex; flex-direction: column; gap: 2px;`;
const SlotName = styled.div`font-size: 14.5px; font-weight: 700; color: var(--c-ink, #0e140f);`;
const SlotId = styled.div`font-size: 11px; color: #888;`;
const SlotTime = styled.div`font-size: 12px; color: #666;`;
const SlotRight = styled.div`display: flex; align-items: center; gap: 8px;`;
const OnBadge = styled.span`
  padding: 3px 9px; border-radius: 999px; font-size: 10.5px; font-weight: 800;
  background: rgba(22,163,74,0.12); color: #15803d; border: 1px solid rgba(22,163,74,0.3);
  letter-spacing: 0.06em;
`;
const OffBadge = styled.span`
  padding: 3px 9px; border-radius: 999px; font-size: 10.5px; font-weight: 700;
  background: #f5f5f5; color: #888; letter-spacing: 0.06em;
`;
const RemoveBtn = styled.button`
  width: 28px; height: 28px; border-radius: 7px; border: 1px solid #eee;
  background: transparent; color: #888; cursor: pointer; font-size: 12px;
  &:hover { background: rgba(220,38,38,0.08); color: #DC2626; border-color: rgba(220,38,38,0.3); }
`;

// Shared modal styles
const ModalOverlay = styled.div`
  position: fixed; inset: 0; background: rgba(0,0,0,0.45); backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
`;
const ModalBox = styled.div`
  background: var(--c-paper, #fff); border-radius: 16px; width: 480px; max-width: 95vw;
  padding: 28px; display: flex; flex-direction: column; gap: 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
`;
const ModalTitle = styled.h3`
  margin: 0; font-size: 18px; font-weight: 800; color: var(--c-ink, #0e140f);
`;
const Field = styled.div`
  display: flex; flex-direction: column; gap: 6px;
  label { font-size: 12px; font-weight: 700; color: #666; letter-spacing: 0.06em; text-transform: uppercase; }
`;
const StyledInput = styled.input`
  padding: 10px 12px; border-radius: 9px; border: 1px solid var(--c-line, #e7ece2);
  font-size: 14px; color: var(--c-ink, #0e140f); background: var(--c-paper, #fff);
  &:focus { outline: none; border-color: #DC262660; box-shadow: 0 0 0 3px rgba(220,38,38,0.08); }
`;
const StyledTextarea = styled.textarea`
  padding: 10px 12px; border-radius: 9px; border: 1px solid var(--c-line, #e7ece2);
  font-size: 14px; color: var(--c-ink, #0e140f); background: var(--c-paper, #fff);
  font-family: inherit; resize: vertical;
  &:focus { outline: none; border-color: #DC262660; box-shadow: 0 0 0 3px rgba(220,38,38,0.08); }
`;
const SevRow = styled.div`display: flex; gap: 8px;`;
const SevBtn = styled.button<{ $active: boolean; $color: string }>`
  flex: 1; padding: 8px 4px; border-radius: 9px; font-size: 13px; font-weight: 800;
  cursor: pointer; transition: 0.14s;
  border: 2px solid ${(p) => p.$active ? p.$color : 'var(--c-line, #e7ece2)'};
  background: ${(p) => p.$active ? `${p.$color}18` : 'transparent'};
  color: ${(p) => p.$active ? p.$color : '#888'};
`;
const ModalActions = styled.div`display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px;`;
const CancelBtn = styled.button`
  padding: 9px 18px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer;
  background: transparent; border: 1px solid var(--c-line, #e7ece2); color: #555;
  &:hover { background: #f5f5f5; }
`;
const DangerBtn = styled.button`
  padding: 9px 18px; border-radius: 9px; font-size: 13px; font-weight: 700; cursor: pointer;
  background: #DC2626; color: #fff; border: 1px solid #b91c1c;
  &:disabled { opacity: 0.5; cursor: default; }
  &:hover:not(:disabled) { background: #b91c1c; }
`;
const WarnBtn = styled.button`
  padding: 9px 18px; border-radius: 9px; font-size: 13px; font-weight: 700; cursor: pointer;
  background: rgba(202,138,4,0.1); color: #92400e; border: 1px solid #CA8A0440;
  &:disabled { opacity: 0.5; cursor: default; }
`;
const GreenBtn = styled.button`
  padding: 9px 18px; border-radius: 9px; font-size: 13px; font-weight: 700; cursor: pointer;
  background: #16A34A; color: #fff; border: 1px solid #15803d;
  &:disabled { opacity: 0.5; cursor: default; }
  &:hover:not(:disabled) { background: #15803d; }
`;
const ErrorMsg = styled.div`
  padding: 10px 12px; border-radius: 9px; background: rgba(220,38,38,0.08);
  border: 1px solid rgba(220,38,38,0.25); color: #DC2626; font-size: 13px;
`;
const Loading = styled.div`
  padding: 28px; text-align: center; color: #888; font-size: 14px;
`;
const EmptyState = styled.div`
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 60px 24px; text-align: center;
  span:first-child { font-size: 36px; }
  strong { font-size: 16px; font-weight: 700; color: var(--c-ink, #0e140f); }
  span { font-size: 13.5px; color: #888; }
`;
const EmptyInline = styled.div`
  font-size: 13px; color: #888; padding: 8px 0;
`;
