import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { useMero } from '@calimero-network/mero-react';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useVaultEntries } from '../../hooks/useVaultEntries';
import { VaultEntry } from '../../api/vault/VaultClient';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import { DisplayNamesProvider, MemberLabel } from '../../components/MemberLabel';
import { DisplayNameGate } from '../../components/DisplayNameGate';

/**
 * VaultView — the household's shared login vault.
 *
 * Every member can add and browse every entry (filterable by service name),
 * but only the member who added an entry may edit or remove it — the backend
 * enforces that; the UI only shows edit/delete controls on your own rows so
 * nobody is tempted to try (and fails cleanly via describeError if it happens
 * anyway, e.g. a stale UI after another peer's write).
 */
export default function AppPage() {
  const { logout } = useMero();
  const ws = useWorkspace();
  const vault = useVaultEntries({
    contextId: ws.contextId,
    executorPublicKey: ws.executorPublicKey,
  });

  const [serviceName, setServiceName] = useState('');
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [wsName, setWsName] = useState('My household');
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName.trim() || !username.trim() || !secret.trim()) return;
    await vault.add(serviceName.trim(), username.trim(), secret.trim(), notes.trim());
    setServiceName('');
    setUsername('');
    setSecret('');
    setNotes('');
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vault.entries;
    return vault.entries.filter((e) => e.service_name.toLowerCase().includes(q));
  }, [vault.entries, search]);

  // No workspace yet (fresh web session): offer create-or-join.
  if (!ws.ready && !ws.loading) {
    return (
      <Empty>
        <Card>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Create a shared vault for your household, or join one you were invited to.</p>
          <NameField
            data-testid="field-workspace-name"
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder="Household name"
            maxLength={64}
            aria-label="Household name"
          />
          <Row>
            <Primary data-testid="create-workspace-btn" onClick={() => ws.bootstrap(wsName)}>Create vault</Primary>
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
        <Bar>
          <h1>{APP_DISPLAY_NAME}</h1>
          <div className="actions">
            <Secondary data-testid="open-invite-btn" onClick={() => setShowInvite(true)}>Invite</Secondary>
            <Secondary data-testid="open-join-btn" onClick={() => setShowJoin(true)}>Join</Secondary>
            <Secondary onClick={logout}>Sign out</Secondary>
          </div>
        </Bar>

        <Content>
          <Form onSubmit={submit}>
            <input
              data-testid="field-service_name"
              placeholder="Service (e.g. Netflix)"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
            />
            <input
              data-testid="field-username"
              placeholder="Username / email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              data-testid="field-secret"
              type="password"
              placeholder="Password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
            <input
              data-testid="field-notes"
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Primary
              data-testid="action-add_entry"
              type="submit"
              disabled={!serviceName.trim() || !username.trim() || !secret.trim() || !vault.ready}
            >
              Add
            </Primary>
          </Form>

          <SearchRow>
            <input
              data-testid="field-search"
              placeholder="Search by service…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search vault entries"
            />
          </SearchRow>

          {vault.error && <ErrLine>{describeError(vault.error)}</ErrLine>}

          <List>
            {filtered.length === 0 && !vault.loading && (
              <Hint>{vault.entries.length === 0 ? 'No entries yet — add the first login above.' : 'No entries match that search.'}</Hint>
            )}
            {filtered.map((entry) => (
              <EntryRow
                key={entry.id}
                data-testid={`item-vaultentry-${entry.id}`}
                entry={entry}
                isOwner={entry.author === ws.executorPublicKey}
                isEditing={editingId === entry.id}
                isRevealed={revealedId === entry.id}
                onStartEdit={() => setEditingId(entry.id)}
                onCancelEdit={() => setEditingId(null)}
                onToggleReveal={() => setRevealedId((cur) => (cur === entry.id ? null : entry.id))}
                onSave={async (svc, user, sec, note) => {
                  await vault.edit(entry.id, svc, user, sec, note);
                  setEditingId(null);
                }}
                onDelete={() => vault.remove(entry.id)}
              />
            ))}
          </List>

          {/* Blocks the content (not the top bar) until a name is set. Never
              shown on the injected/SSO path (desktop + e2e). */}
          <DisplayNameGate injected={ws.injectedContext} />
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
      </Page>
    </DisplayNamesProvider>
  );
}

interface EntryRowProps {
  'data-testid': string;
  entry: VaultEntry;
  isOwner: boolean;
  isEditing: boolean;
  isRevealed: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onToggleReveal: () => void;
  onSave: (serviceName: string, username: string, secret: string, notes: string) => Promise<void>;
  onDelete: () => void;
}

function EntryRow({
  entry,
  isOwner,
  isEditing,
  isRevealed,
  onStartEdit,
  onCancelEdit,
  onToggleReveal,
  onSave,
  onDelete,
  ...rest
}: EntryRowProps) {
  const [serviceName, setServiceName] = useState(entry.service_name);
  const [username, setUsername] = useState(entry.username);
  const [secret, setSecret] = useState(entry.secret);
  const [notes, setNotes] = useState(entry.notes);
  const [saving, setSaving] = useState(false);

  if (isEditing) {
    return (
      <ItemRow data-testid={rest['data-testid']}>
        <EditForm
          onSubmit={async (e) => {
            e.preventDefault();
            if (!serviceName.trim() || !username.trim() || !secret.trim() || saving) return;
            setSaving(true);
            try {
              await onSave(serviceName.trim(), username.trim(), secret.trim(), notes.trim());
            } finally {
              setSaving(false);
            }
          }}
        >
          <input data-testid="field-service_name" value={serviceName} onChange={(e) => setServiceName(e.target.value)} />
          <input data-testid="field-username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input data-testid="field-secret" value={secret} onChange={(e) => setSecret(e.target.value)} />
          <input data-testid="field-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Primary data-testid="action-edit_entry" type="submit" disabled={saving}>Save</Primary>
          <Secondary type="button" onClick={onCancelEdit} disabled={saving}>Cancel</Secondary>
        </EditForm>
      </ItemRow>
    );
  }

  return (
    <ItemRow data-testid={rest['data-testid']}>
      <div className="text">
        <strong>{entry.service_name}</strong>
        <span>{entry.username}</span>
        <span className="secret">
          {isRevealed ? entry.secret : '•'.repeat(Math.max(8, entry.secret.length))}
          <RevealBtn type="button" onClick={onToggleReveal}>{isRevealed ? 'Hide' : 'Reveal'}</RevealBtn>
        </span>
        {entry.notes && <span>{entry.notes}</span>}
        <Byline>
          Added by <MemberLabel memberId={entry.author} />
        </Byline>
      </div>
      {isOwner && (
        <div className="row-actions">
          <button data-testid="open-edit-btn" aria-label="Edit" onClick={onStartEdit}>✎</button>
          <button data-testid="action-delete_entry" aria-label="Delete" onClick={onDelete}>×</button>
        </div>
      )}
    </ItemRow>
  );
}

const Page = styled.div`
  max-width: 720px;
  margin: 0 auto;
  padding: 28px 20px 64px;
  width: 100%;
`;
const Bar = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; }
  .actions { display: flex; gap: 8px; }
`;
// Positioning context for the display-name gate overlay: it covers the content
// but leaves the top bar (Sign out) reachable.
const Content = styled.div`position: relative;`;
const Byline = styled.span`
  font-size: 11.5px;
  color: ${C.mutedSoft};
`;
const Form = styled.form`
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
  input {
    flex: 1; min-width: 140px;
    padding: 10px 12px; font-size: 14px;
    color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: 10px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
`;
const SearchRow = styled.div`
  margin-bottom: 22px;
  input {
    width: 100%;
    padding: 10px 12px; font-size: 14px;
    color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: 10px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
`;
const List = styled.div`display: flex; flex-direction: column; gap: 10px;`;
const ItemRow = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 16px; background: ${C.paper2};
  border: 1px solid ${C.line}; border-radius: 12px;
  .text { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
  .text strong { font-size: 15px; color: ${C.ink}; }
  .text span { font-size: 13px; color: ${C.muted}; }
  .text span.secret { display: flex; align-items: center; gap: 8px; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
  .row-actions { display: flex; gap: 4px; flex-shrink: 0; }
  .row-actions button {
    flex-shrink: 0; width: 30px; height: 30px; font-size: 16px; line-height: 1;
    color: ${C.mutedSoft}; background: transparent; border: none; border-radius: 8px; cursor: pointer;
    &:hover { background: ${C.paper}; color: ${C.ink}; }
  }
  .row-actions button[aria-label="Delete"] {
    font-size: 20px;
    &:hover { color: ${C.danger}; }
  }
`;
const RevealBtn = styled.button`
  font-size: 11px; font-weight: 600; color: ${C.greenDeep}; background: transparent;
  border: none; cursor: pointer; padding: 0; text-decoration: underline;
`;
const EditForm = styled.form`
  display: flex; gap: 8px; flex-wrap: wrap; width: 100%;
  input {
    flex: 1; min-width: 120px;
    padding: 8px 10px; font-size: 13px;
    color: ${C.ink}; background: ${C.paper};
    border: 1px solid ${C.line}; border-radius: 8px; outline: none;
    &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
  }
`;
const Hint = styled.p`font-size: 14px; color: ${C.muted}; padding: 8px 2px;`;
const ErrLine = styled.p`margin: 8px 0; font-size: 13px; color: ${C.danger};`;

const Empty = styled.div`
  flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px;
`;
const Card = styled.div`
  max-width: 420px; text-align: center;
  padding: 32px 28px; background: ${C.paper2};
  border: 1px solid ${C.line}; border-radius: 18px;
  h2 { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; color: ${C.ink}; margin-bottom: 8px; }
  p { font-size: 14px; color: ${C.muted}; margin-bottom: 22px; line-height: 1.55; }
`;
const Row = styled.div`display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;`;
const NameField = styled.input`
  width: 100%;
  margin-bottom: 16px;
  padding: 10px 12px; font-size: 14px; text-align: center;
  color: ${C.ink}; background: ${C.paper};
  border: 1px solid ${C.line}; border-radius: 10px; outline: none;
  &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
`;

const Primary = styled.button`
  display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.onAccent}; background: ${C.green}; border: 1px solid #93e60c;
  transition: background 0.18s, transform 0.15s;
  &:hover:not(:disabled) { background: ${C.greenHover}; transform: translateY(-1px); }
  &:disabled { opacity: 0.55; cursor: default; }
`;
const Secondary = styled.button`
  padding: 10px 16px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: ${C.paper2}; border-color: ${C.green}; }
  &:disabled { opacity: 0.55; cursor: default; }
`;
