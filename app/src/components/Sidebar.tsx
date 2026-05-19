import React from 'react';
import type { GroupMember } from '@calimero-network/mero-react';
import { Vote } from '../api/voting/VotingClient';
import type { WorkspaceRecord } from '../hooks/useVotingWorkspace';

interface SidebarProps {
  // Workspace selector
  workspaces: WorkspaceRecord[];
  selectedNamespaceId: string | null;
  onSelectWorkspace: (nsId: string) => void;
  onCreateWorkspace: () => void;
  workspaceAlias?: string;

  // Member directory
  members: GroupMember[];
  selfIdentity: string | null;

  // Vote list
  votes: Vote[];
  selectedVoteId: string | null;
  onSelectVote: (vote: Vote) => void;
  onCreateVote: () => void;
  onInvite: () => void;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-5)}`;
}

export default function Sidebar({
  workspaces,
  selectedNamespaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  workspaceAlias,
  members,
  selfIdentity,
  votes,
  selectedVoteId,
  onSelectVote,
  onCreateVote,
  onInvite,
}: SidebarProps) {
  const openVotes = votes.filter((v) => v.status === 'open');
  const closedVotes = votes.filter((v) => v.status !== 'open');

  return (
    <div style={{
      width: 260,
      borderRight: '1px solid #1e293b',
      display: 'flex',
      flexDirection: 'column',
      background: '#0f172a',
      flexShrink: 0,
    }}>
      {/* Workspace header */}
      <div style={{ padding: '1rem', borderBottom: '1px solid #1e293b' }}>
        <h2 style={{
          fontSize: '1rem', fontWeight: 700,
          color: 'var(--color-primary, #2563EB)',
          marginBottom: '0.2rem',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {workspaceAlias || 'Group Vote'}
        </h2>
        <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
          {members.length + (selfIdentity ? 1 : 0)} participant{members.length + (selfIdentity ? 1 : 0) !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Workspace list */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.25rem', paddingLeft: '0.25rem' }}>
          WORKSPACES
        </div>
        {workspaces.map((ws) => (
          <div
            key={ws.namespaceId}
            onClick={() => onSelectWorkspace(ws.namespaceId)}
            style={{
              padding: '0.35rem 0.6rem', borderRadius: 6, cursor: 'pointer',
              fontSize: '0.82rem',
              background: ws.namespaceId === selectedNamespaceId
                ? 'rgba(37,99,235,0.15)' : 'transparent',
              color: ws.namespaceId === selectedNamespaceId ? '#93c5fd' : '#94a3b8',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {ws.alias || shortenId(ws.namespaceId)}
          </div>
        ))}
        <div
          onClick={onCreateWorkspace}
          style={{
            padding: '0.35rem 0.6rem', borderRadius: 6, cursor: 'pointer',
            fontSize: '0.78rem', color: '#64748b',
            marginTop: workspaces.length > 0 ? 2 : 0,
          }}
          title="Create a new workspace"
        >
          + New workspace
        </div>
      </div>

      {/* Members */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.4rem', paddingLeft: '0.25rem' }}>
          PARTICIPANTS
        </div>

        {selfIdentity && (
          <div style={{
            padding: '0.35rem 0.6rem', borderRadius: 6, marginBottom: 2,
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--color-accent, #059669)', flexShrink: 0,
            }} />
            <span style={{
              flex: 1, minWidth: 0, fontSize: '0.82rem', color: '#e2e8f0',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={selfIdentity}>
              {shortenId(selfIdentity)} (you)
            </span>
          </div>
        )}

        {members.map((m) => (
          <div
            key={m.identity}
            style={{
              padding: '0.35rem 0.6rem', borderRadius: 6, marginBottom: 2,
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              color: '#94a3b8', fontSize: '0.82rem',
            }}
            title={m.identity}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#475569', flexShrink: 0,
            }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.alias || shortenId(m.identity)}
            </span>
          </div>
        ))}
      </div>

      {/* Vote actions */}
      <div style={{ padding: '0.5rem', display: 'flex', gap: '0.25rem' }}>
        <button
          onClick={onCreateVote}
          style={{
            flex: 1, padding: '0.4rem',
            background: 'var(--color-primary, #2563EB)',
            color: '#fff', border: 'none', borderRadius: 4,
            cursor: 'pointer', fontSize: '0.8rem',
          }}
        >
          + Vote
        </button>
        <button
          onClick={onInvite}
          style={{
            flex: 1, padding: '0.4rem',
            background: '#1e293b', color: '#cbd5e1',
            border: '1px solid #334155', borderRadius: 4,
            cursor: 'pointer', fontSize: '0.8rem',
          }}
        >
          Invite
        </button>
      </div>

      {/* Vote list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem' }}>
        {openVotes.length > 0 && (
          <>
            <div style={{ fontSize: '0.7rem', color: '#64748b', margin: '0.25rem 0.5rem 0.25rem' }}>
              OPEN
            </div>
            {openVotes.map((v) => (
              <VoteListItem
                key={v.id}
                vote={v}
                selected={v.id === selectedVoteId}
                onSelect={onSelectVote}
              />
            ))}
          </>
        )}

        {closedVotes.length > 0 && (
          <>
            <div style={{ fontSize: '0.7rem', color: '#64748b', margin: '0.5rem 0.5rem 0.25rem' }}>
              CLOSED
            </div>
            {closedVotes.map((v) => (
              <VoteListItem
                key={v.id}
                vote={v}
                selected={v.id === selectedVoteId}
                onSelect={onSelectVote}
              />
            ))}
          </>
        )}

        {votes.length === 0 && (
          <div style={{ padding: '1rem', color: '#475569', fontSize: '0.8rem', textAlign: 'center' }}>
            No votes yet. Create the first one!
          </div>
        )}
      </div>
    </div>
  );
}

function VoteListItem({
  vote,
  selected,
  onSelect,
}: {
  vote: Vote;
  selected: boolean;
  onSelect: (v: Vote) => void;
}) {
  const isOpen = vote.status === 'open';
  return (
    <div
      data-testid={`sidebar-vote-${vote.title}`}
      onClick={() => onSelect(vote)}
      style={{
        padding: '0.55rem 0.7rem', borderRadius: 6, cursor: 'pointer',
        background: selected ? 'rgba(37,99,235,0.15)' : 'transparent',
        color: selected ? '#93c5fd' : '#cbd5e1',
        marginBottom: 2,
      }}
    >
      <div style={{ fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {vote.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: isOpen ? 'var(--color-accent, #059669)' : '#475569',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
          {isOpen ? 'open' : 'closed'} · {vote.options.length} option{vote.options.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
