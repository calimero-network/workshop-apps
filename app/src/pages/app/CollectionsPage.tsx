import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { C } from '../../theme';
import type { Collection } from '../../generated/VectorknowledgebaseClient';

/**
 * CollectionsPage — create, list, and delete named collections.
 * Shell pass: static UI; real CRUD is wired in the ABI pass.
 */
export default function CollectionsPage() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shell pass: empty collections list
  const collections: Collection[] = [];
  const loading = false;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Collection name is required.'); return; }

    setCreating(true);
    // Shell pass: no real create yet
    setCreating(false);
    setName('');
    setDescription('');
  };

  const handleDelete = async (collectionId: string) => {
    // Shell pass: no real delete yet
    void collectionId;
  };

  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>Collections</PageTitle>
          <PageSub>Organize knowledge entries into named groups</PageSub>
        </div>
      </PageHeader>

      {/* Create form */}
      <CreateCard>
        <CreateTitle>New Collection</CreateTitle>
        <CreateForm onSubmit={handleCreate}>
          <FormRow>
            <FormGroup style={{ flex: 1 }}>
              <Label htmlFor="col-name">Name <Required>*</Required></Label>
              <Input
                id="col-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. NLP Fundamentals"
                data-testid="field-name"
              />
            </FormGroup>
            <FormGroup style={{ flex: 2 }}>
              <Label htmlFor="col-desc">Description</Label>
              <Input
                id="col-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Core concepts in natural language processing"
                data-testid="field-description"
              />
            </FormGroup>
            <CreateBtn type="submit" disabled={creating || !name.trim()} data-testid="action-create_collection">
              {creating ? <Spinner /> : <PlusIcon />}
              {creating ? 'Creating…' : 'Create'}
            </CreateBtn>
          </FormRow>
          {error && <ErrLine>{error}</ErrLine>}
        </CreateForm>
      </CreateCard>

      {/* Collections list */}
      <ListSection>
        <ListHeader>
          <SectionTitle>Your Collections</SectionTitle>
          <CollectionCount>{collections.length} collection{collections.length === 1 ? '' : 's'}</CollectionCount>
        </ListHeader>

        {loading && (
          <LoadingRow><LoadDot /><span>Loading collections…</span></LoadingRow>
        )}

        {!loading && collections.length === 0 && (
          <EmptyState>
            <EmptyIcon>📂</EmptyIcon>
            <EmptyTitle>No collections yet</EmptyTitle>
            <EmptySub>Create a collection above to start organizing your knowledge entries.</EmptySub>
          </EmptyState>
        )}

        {collections.length > 0 && (
          <CollectionGrid>
            {collections.map((col) => (
              <CollectionCard key={col.id} data-testid={`item-collection-${col.id}`}>
                <CardTop>
                  <FolderIcon />
                  <CardMeta>
                    <CardName>{col.name}</CardName>
                    <CardId>{col.id}</CardId>
                  </CardMeta>
                  <DeleteBtn
                    onClick={() => void handleDelete(col.id)}
                    title="Delete collection"
                    data-testid="action-delete_collection"
                    aria-label={`Delete collection ${col.name}`}
                  >
                    <TrashIcon />
                  </DeleteBtn>
                </CardTop>

                {col.description && (
                  <CardDesc>{col.description}</CardDesc>
                )}

                <CardFooter>
                  <EntryCount>— entries</EntryCount>
                  <CreatedAt>
                    {col.created_at
                      ? new Date(col.created_at * 1000).toLocaleDateString()
                      : '—'}
                  </CreatedAt>
                </CardFooter>
              </CollectionCard>
            ))}
          </CollectionGrid>
        )}
      </ListSection>
    </Page>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────────── */
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)', flexShrink: 0 }}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

/* ── Spinner ─────────────────────────────────────────────────────────────────── */
const spin = keyframes`to { transform: rotate(360deg); }`;
const Spinner = styled.span`
  width: 13px; height: 13px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: ${spin} 0.6s linear infinite;
`;

/* ── Styled components ──────────────────────────────────────────────────────── */
const Page = styled.div`
  padding: 28px 32px 60px;
  max-width: 900px;
  width: 100%;
`;

const PageHeader = styled.header`
  margin-bottom: 22px;
`;
const PageTitle = styled.h1`
  font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; margin-bottom: 4px;
`;
const PageSub = styled.p`font-size: 13.5px; color: ${C.muted};`;

/* Create form */
const CreateCard = styled.div`
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 16px;
  padding: 20px 22px; margin-bottom: 28px;
`;
const CreateTitle = styled.h3`font-size: 14px; font-weight: 700; color: ${C.ink}; margin-bottom: 14px;`;
const CreateForm = styled.form``;
const FormRow = styled.div`
  display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap;
`;
const FormGroup = styled.div`display: flex; flex-direction: column; gap: 4px;`;
const Label = styled.label`font-size: 12px; font-weight: 600; color: ${C.muted};`;
const Required = styled.span`color: ${C.danger};`;

const Input = styled.input`
  font-size: 13px; color: ${C.ink};
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 9px; padding: 9px 11px;
  outline: none; width: 100%;
  transition: border-color 0.15s, box-shadow 0.15s;
  &:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(124,58,237,0.14); }
  &::placeholder { color: ${C.mutedSoft}; }
`;

const CreateBtn = styled.button`
  display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 18px; font-size: 13px; font-weight: 600; border-radius: 9px; cursor: pointer;
  color: #fff; background: var(--color-primary); border: none; flex-shrink: 0;
  transition: opacity 0.18s;
  &:hover:not(:disabled) { opacity: 0.88; }
  &:disabled { opacity: 0.55; cursor: default; }
`;

const ErrLine = styled.p`font-size: 13px; color: ${C.danger}; margin-top: 8px;`;

/* List */
const ListSection = styled.section``;
const ListHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;
`;
const SectionTitle = styled.h2`
  font-size: 14px; font-weight: 700; color: ${C.muted}; text-transform: uppercase; letter-spacing: 0.06em;
`;
const CollectionCount = styled.span`font-size: 12px; color: ${C.mutedSoft};`;

const spinAnim = keyframes`to { transform: rotate(360deg); }`;
const LoadingRow = styled.div`
  display: flex; align-items: center; gap: 10px;
  padding: 20px 4px; font-size: 13px; color: ${C.muted};
`;
const LoadDot = styled.div`
  width: 18px; height: 18px;
  border: 2px solid ${C.line}; border-top-color: var(--color-primary);
  border-radius: 50%; animation: ${spinAnim} 0.7s linear infinite;
`;

const EmptyState = styled.div`
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 48px 24px;
  background: ${C.paper2}; border: 1px dashed ${C.line}; border-radius: 14px; text-align: center;
`;
const EmptyIcon = styled.div`font-size: 32px; margin-bottom: 12px;`;
const EmptyTitle = styled.p`font-size: 15px; font-weight: 600; color: ${C.ink}; margin-bottom: 6px;`;
const EmptySub = styled.p`font-size: 13px; color: ${C.muted}; max-width: 380px;`;

/* Collection grid */
const CollectionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
`;

const CollectionCard = styled.article`
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 14px;
  padding: 16px; display: flex; flex-direction: column; gap: 10px;
  transition: border-color 0.15s, box-shadow 0.15s;
  &:hover { border-color: rgba(124,58,237,0.4); box-shadow: 0 6px 20px rgba(124,58,237,0.1); }
`;

const CardTop = styled.div`display: flex; align-items: center; gap: 10px;`;
const CardMeta = styled.div`flex: 1; min-width: 0;`;
const CardName = styled.div`font-size: 14px; font-weight: 700; color: ${C.ink}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`;
const CardId = styled.div`font-size: 11px; color: ${C.mutedSoft}; font-family: ui-monospace, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`;

const DeleteBtn = styled.button`
  width: 28px; height: 28px; border-radius: 7px; border: 1px solid ${C.line};
  background: transparent; color: ${C.mutedSoft}; cursor: pointer; display: grid; place-items: center;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  &:hover { background: rgba(255,107,107,0.08); color: ${C.danger}; border-color: rgba(255,107,107,0.35); }
`;

const CardDesc = styled.p`
  font-size: 12.5px; color: ${C.muted}; line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
`;

const CardFooter = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  border-top: 1px solid ${C.line}; padding-top: 10px;
`;
const EntryCount = styled.span`
  font-size: 11.5px; color: var(--color-accent);
  background: rgba(34,211,238,0.08); border: 1px solid rgba(34,211,238,0.2);
  padding: 2px 8px; border-radius: 6px;
`;
const CreatedAt = styled.span`font-size: 11px; color: ${C.mutedSoft};`;
