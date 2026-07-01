import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { C } from '../../theme';
import type { KnowledgeEntry, Collection } from '../../generated/VectorknowledgebaseClient';

/**
 * BrowsePage — paginated list of all knowledge entries.
 * Shell pass: static UI; data hooks wired in the ABI pass.
 */
export default function BrowsePage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [text, setText] = useState('');
  const [embedding, setEmbedding] = useState('');
  const [tags, setTags] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [filterCollection, setFilterCollection] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Shell pass: empty collections and entries
  const collections: Collection[] = [];
  const entries: KnowledgeEntry[] = [];
  const loading = false;

  // Inline tag editing state
  const [editingTags, setEditingTags] = useState<Record<string, string>>({});

  const parseVector = (raw: string): number[] | null => {
    try {
      const nums = raw.trim().replace(/^\[|\]$/g, '').split(',').map((s) => parseFloat(s.trim()));
      if (nums.length === 0 || nums.some(isNaN)) return null;
      return nums;
    } catch {
      return null;
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!text.trim()) { setAddError('Text is required.'); return; }
    const vec = parseVector(embedding);
    if (!vec) { setAddError('Enter a valid comma-separated embedding vector.'); return; }

    setAdding(true);
    // Shell pass: no real add yet
    setAdding(false);
    setText('');
    setEmbedding('');
    setTags('');
    setCollectionId('');
    setShowAddForm(false);
  };

  const filteredEntries = entries.filter((e) => {
    if (filterCollection && e.collection_id !== filterCollection) return false;
    if (filterTag && !e.tags.includes(filterTag)) return false;
    return true;
  });

  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>Browse Entries</PageTitle>
          <PageSub>All knowledge chunks in your base</PageSub>
        </div>
        <AddBtn onClick={() => setShowAddForm((v) => !v)}>
          <PlusIcon />
          {showAddForm ? 'Cancel' : 'Add Entry'}
        </AddBtn>
      </PageHeader>

      {/* Add entry form */}
      {showAddForm && (
        <AddForm onSubmit={handleAdd}>
          <FormTitle>New Knowledge Entry</FormTitle>
          <FormGrid>
            <FormGroup style={{ gridColumn: '1 / -1' }}>
              <Label htmlFor="entry-text">Text <Required>*</Required></Label>
              <TextArea
                id="entry-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="The knowledge chunk to store, e.g. 'Transformers use self-attention mechanisms to relate positions in the sequence…'"
                rows={3}
                data-testid="field-text"
              />
            </FormGroup>

            <FormGroup style={{ gridColumn: '1 / -1' }}>
              <Label htmlFor="entry-embedding">
                Embedding Vector <Required>*</Required>
              </Label>
              <SubLabel>Comma-separated floats, e.g. 0.12, -0.45, 0.78, ...</SubLabel>
              <MonoInput
                id="entry-embedding"
                type="text"
                value={embedding}
                onChange={(e) => setEmbedding(e.target.value)}
                placeholder="0.12, -0.45, 0.78, 0.33, -0.21, ..."
                data-testid="field-embedding"
              />
            </FormGroup>

            <FormGroup>
              <Label htmlFor="entry-tags">Tags</Label>
              <SubLabel>Comma-separated, e.g. ml, architecture</SubLabel>
              <Input
                id="entry-tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="ml, nlp, architecture"
                data-testid="field-tags"
              />
            </FormGroup>

            <FormGroup>
              <Label htmlFor="entry-collection">Collection</Label>
              <Select
                id="entry-collection"
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                data-testid="field-collection_id"
              >
                <option value="">None</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </FormGroup>
          </FormGrid>

          {addError && <ErrLine>{addError}</ErrLine>}

          <FormActions>
            <SubmitBtn type="submit" disabled={adding} data-testid="action-add_entry">
              {adding ? <Spinner /> : null}
              {adding ? 'Adding…' : 'Add Entry'}
            </SubmitBtn>
            <CancelBtn type="button" onClick={() => setShowAddForm(false)}>Cancel</CancelBtn>
          </FormActions>
        </AddForm>
      )}

      {/* Filters */}
      <FiltersBar>
        <FilterGroup>
          <FilterLabel>Collection</FilterLabel>
          <Select
            value={filterCollection}
            onChange={(e) => setFilterCollection(e.target.value)}
          >
            <option value="">All collections</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </FilterGroup>
        <FilterGroup>
          <FilterLabel>Tag</FilterLabel>
          <Input
            type="text"
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            placeholder="Filter by tag"
          />
        </FilterGroup>
        <EntryCount>{filteredEntries.length} entr{filteredEntries.length === 1 ? 'y' : 'ies'}</EntryCount>
      </FiltersBar>

      {/* Entry list */}
      {loading && (
        <LoadingRow>
          <LoadDot />
          <span>Loading entries…</span>
        </LoadingRow>
      )}

      {!loading && filteredEntries.length === 0 && (
        <EmptyState>
          <EmptyIcon>📄</EmptyIcon>
          <EmptyTitle>No entries yet</EmptyTitle>
          <EmptySub>Add your first knowledge chunk using the button above.</EmptySub>
        </EmptyState>
      )}

      {filteredEntries.length > 0 && (
        <EntryList>
          {filteredEntries.map((entry) => (
            <EntryCard key={entry.id} data-testid={`item-entry-${entry.id}`}>
              <EntryMain>
                <EntryText>{entry.text}</EntryText>
                <EntryMeta>
                  <MetaChip><DimIcon /> dim:{entry.dimension}</MetaChip>
                  <MetaChip>{entry.author}</MetaChip>
                  {entry.collection_id && (
                    <MetaChip $accent>📂 {entry.collection_id}</MetaChip>
                  )}
                </EntryMeta>

                {/* Inline tag editing */}
                <TagsRow>
                  {entry.tags.map((t) => <Tag key={t}>{t}</Tag>)}
                  {editingTags[entry.id] !== undefined ? (
                    <TagEditForm
                      onSubmit={(e) => {
                        e.preventDefault();
                        // Shell pass: no real update
                        setEditingTags((prev) => { const n = { ...prev }; delete n[entry.id]; return n; });
                      }}
                    >
                      <TagInput
                        autoFocus
                        value={editingTags[entry.id]}
                        onChange={(e) =>
                          setEditingTags((prev) => ({ ...prev, [entry.id]: e.target.value }))
                        }
                        placeholder="ml, nlp, ..."
                        data-testid="field-tags"
                      />
                      <TagSaveBtn type="submit" data-testid="action-update_entry_tags">Save</TagSaveBtn>
                      <TagCancelBtn
                        type="button"
                        onClick={() =>
                          setEditingTags((prev) => { const n = { ...prev }; delete n[entry.id]; return n; })
                        }
                      >✕</TagCancelBtn>
                    </TagEditForm>
                  ) : (
                    <EditTagsBtn
                      onClick={() =>
                        setEditingTags((prev) => ({ ...prev, [entry.id]: entry.tags.join(', ') }))
                      }
                      title="Edit tags"
                      data-testid="action-update_entry_tags"
                    >
                      <TagIcon /> Edit tags
                    </EditTagsBtn>
                  )}
                </TagsRow>
              </EntryMain>

              <EntryActions>
                <DeleteBtn
                  onClick={() => { /* Shell pass: no-op */ }}
                  title="Remove entry"
                  data-testid={`action-remove_entry`}
                  aria-label="Remove entry"
                >
                  <TrashIcon />
                </DeleteBtn>
              </EntryActions>
            </EntryCard>
          ))}
        </EntryList>
      )}
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
function DimIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
  max-width: 960px;
  width: 100%;
`;

const PageHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
`;
const PageTitle = styled.h1`
  font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: ${C.ink}; margin-bottom: 4px;
`;
const PageSub = styled.p`font-size: 13.5px; color: ${C.muted};`;

const AddBtn = styled.button`
  display: inline-flex; align-items: center; gap: 7px;
  padding: 10px 16px; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: #fff; background: var(--color-primary); border: none; flex-shrink: 0;
  transition: opacity 0.18s, transform 0.15s;
  &:hover { opacity: 0.88; transform: translateY(-1px); }
`;

/* Add form */
const AddForm = styled.form`
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 16px;
  padding: 20px 22px; margin-bottom: 20px;
`;
const FormTitle = styled.h3`font-size: 14px; font-weight: 700; color: ${C.ink}; margin-bottom: 14px;`;
const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 14px;
  margin-bottom: 12px;
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;
const FormGroup = styled.div`display: flex; flex-direction: column; gap: 4px;`;
const Label = styled.label`font-size: 12px; font-weight: 600; color: ${C.muted};`;
const Required = styled.span`color: ${C.danger};`;
const SubLabel = styled.span`font-size: 11px; color: ${C.mutedSoft};`;

const inputCSS = `
  font-size: 13px;
  color: ${C.ink};
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-radius: 9px;
  padding: 9px 11px;
  outline: none;
  width: 100%;
  transition: border-color 0.15s, box-shadow 0.15s;
  &:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(124,58,237,0.14);
  }
  &::placeholder { color: ${C.mutedSoft}; }
`;

const Input = styled.input`${inputCSS}`;
const MonoInput = styled.input`${inputCSS} font-family: ui-monospace, 'SF Mono', Menlo, monospace;`;
const TextArea = styled.textarea`${inputCSS} resize: vertical; line-height: 1.55;`;
const Select = styled.select`${inputCSS} cursor: pointer;`;

const ErrLine = styled.p`font-size: 13px; color: ${C.danger}; margin-bottom: 8px;`;

const FormActions = styled.div`display: flex; gap: 10px;`;
const SubmitBtn = styled.button`
  display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 18px; font-size: 13px; font-weight: 600; border-radius: 9px; cursor: pointer;
  color: #fff; background: var(--color-primary); border: none;
  transition: opacity 0.18s;
  &:hover:not(:disabled) { opacity: 0.88; }
  &:disabled { opacity: 0.55; cursor: default; }
`;
const CancelBtn = styled.button`
  padding: 9px 16px; font-size: 13px; font-weight: 600; border-radius: 9px; cursor: pointer;
  color: ${C.muted}; background: ${C.paper}; border: 1px solid ${C.line};
  transition: background 0.15s;
  &:hover { background: ${C.paper2}; }
`;

/* Filters */
const FiltersBar = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`;
const FilterGroup = styled.div`
  display: flex; flex-direction: column; gap: 4px;
`;
const FilterLabel = styled.label`font-size: 11.5px; font-weight: 600; color: ${C.mutedSoft};`;
const EntryCount = styled.span`
  font-size: 12px; color: ${C.muted}; margin-left: auto; align-self: flex-end; padding-bottom: 9px;
`;

/* Loading */
const spinAnim = keyframes`to { transform: rotate(360deg); }`;
const LoadingRow = styled.div`
  display: flex; align-items: center; gap: 10px;
  padding: 20px 4px;
  font-size: 13px; color: ${C.muted};
`;
const LoadDot = styled.div`
  width: 18px; height: 18px;
  border: 2px solid ${C.line};
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: ${spinAnim} 0.7s linear infinite;
`;

/* Empty */
const EmptyState = styled.div`
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 48px 24px;
  background: ${C.paper2}; border: 1px dashed ${C.line}; border-radius: 14px;
  text-align: center;
`;
const EmptyIcon = styled.div`font-size: 32px; margin-bottom: 12px;`;
const EmptyTitle = styled.p`font-size: 15px; font-weight: 600; color: ${C.ink}; margin-bottom: 6px;`;
const EmptySub = styled.p`font-size: 13px; color: ${C.muted};`;

/* Entry list */
const EntryList = styled.div`display: flex; flex-direction: column; gap: 10px;`;

const EntryCard = styled.article`
  display: flex; align-items: flex-start; gap: 12px;
  padding: 16px; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 12px;
  transition: border-color 0.15s;
  &:hover { border-color: rgba(124,58,237,0.35); }
`;

const EntryMain = styled.div`flex: 1; min-width: 0;`;
const EntryText = styled.p`
  font-size: 14px; color: ${C.ink}; line-height: 1.55; margin-bottom: 8px;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
`;
const EntryMeta = styled.div`display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px;`;
const MetaChip = styled.span<{ $accent?: boolean }>`
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 500;
  color: ${(p) => (p.$accent ? 'var(--color-accent)' : C.mutedSoft)};
  background: ${(p) => (p.$accent ? 'rgba(34,211,238,0.1)' : C.paper)};
  border: 1px solid ${(p) => (p.$accent ? 'rgba(34,211,238,0.25)' : C.line)};
  padding: 2px 7px; border-radius: 6px;
`;

const TagsRow = styled.div`display: flex; align-items: center; gap: 6px; flex-wrap: wrap;`;
const Tag = styled.span`
  font-size: 11px; padding: 2px 8px; border-radius: 6px;
  background: rgba(124,58,237,0.12); color: var(--color-primary); font-weight: 500;
`;
const EditTagsBtn = styled.button`
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 500; color: ${C.mutedSoft};
  background: transparent; border: 1px dashed ${C.line}; border-radius: 6px; padding: 2px 7px; cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  &:hover { border-color: var(--color-primary); color: var(--color-primary); }
`;
const TagEditForm = styled.form`display: inline-flex; align-items: center; gap: 5px;`;
const TagInput = styled.input`
  font-size: 12px; font-family: inherit;
  padding: 3px 8px; border-radius: 6px;
  background: ${C.paper}; border: 1px solid var(--color-primary); color: ${C.ink}; outline: none;
  width: 160px;
`;
const TagSaveBtn = styled.button`
  font-size: 11px; font-weight: 600; color: #fff; background: var(--color-primary); border: none;
  border-radius: 6px; padding: 3px 9px; cursor: pointer;
`;
const TagCancelBtn = styled.button`
  font-size: 12px; color: ${C.muted}; background: transparent; border: none; cursor: pointer;
  &:hover { color: ${C.ink}; }
`;

const EntryActions = styled.div`flex-shrink: 0; display: flex; gap: 6px;`;
const DeleteBtn = styled.button`
  width: 32px; height: 32px; border-radius: 8px; border: 1px solid ${C.line};
  background: transparent; color: ${C.mutedSoft}; cursor: pointer; display: grid; place-items: center;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  &:hover { background: rgba(255,107,107,0.08); color: ${C.danger}; border-color: rgba(255,107,107,0.35); }
`;
