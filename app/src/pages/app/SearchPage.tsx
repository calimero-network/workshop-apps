import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { C } from '../../theme';
import type { SearchResult } from '../../generated/VectorknowledgebaseClient';

/**
 * SearchPage — semantic similarity search.
 * Shell pass: form renders and validates; real RPC is wired in the ABI pass.
 */
export default function SearchPage() {
  const [queryVec, setQueryVec] = useState('');
  const [topK, setTopK] = useState('5');
  const [collectionId, setCollectionId] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const parseVector = (raw: string): number[] | null => {
    try {
      const nums = raw.trim().replace(/^\[|\]$/g, '').split(',').map((s) => parseFloat(s.trim()));
      if (nums.some(isNaN)) return null;
      return nums;
    } catch {
      return null;
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const vec = parseVector(queryVec);
    if (!vec || vec.length === 0) {
      setError('Enter a valid comma-separated vector, e.g. 0.12, -0.45, 0.78');
      return;
    }
    const k = parseInt(topK, 10);
    if (!k || k < 1) {
      setError('Top-K must be a positive integer.');
      return;
    }

    setLoading(true);
    setSearched(true);
    // Shell pass: no real search yet
    setResults([]);
    setLoading(false);
  };

  const hasQuery = queryVec.trim().length > 0;

  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>Semantic Search</PageTitle>
          <PageSub>Find the most similar knowledge entries by cosine similarity</PageSub>
        </div>
      </PageHeader>

      <SearchPanel>
        <SearchForm onSubmit={handleSearch}>
          <FormGroup>
            <Label htmlFor="query-vec">Query Vector</Label>
            <SubLabel>Comma-separated floats matching your embedding dimension</SubLabel>
            <VecTextarea
              id="query-vec"
              value={queryVec}
              onChange={(e) => setQueryVec(e.target.value)}
              placeholder="0.12, -0.45, 0.78, 0.33, -0.21, 0.90, ..."
              rows={3}
              data-testid="field-query_vector"
            />
          </FormGroup>

          <OptionsRow>
            <FormGroupInline>
              <Label htmlFor="top-k">Top-K</Label>
              <NumberInput
                id="top-k"
                type="number"
                value={topK}
                min="1"
                max="100"
                onChange={(e) => setTopK(e.target.value)}
                data-testid="field-top_k"
              />
            </FormGroupInline>

            <FormGroupInline style={{ flex: 2 }}>
              <Label htmlFor="collection-filter">Collection (optional)</Label>
              <TextInput
                id="collection-filter"
                type="text"
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                placeholder="Filter by collection ID"
                data-testid="field-collection_id"
              />
            </FormGroupInline>

            <SearchBtn
              type="submit"
              disabled={!hasQuery || loading}
              data-testid="action-search_similar"
            >
              {loading ? <Spinner /> : <SearchIcon />}
              {loading ? 'Searching…' : 'Search'}
            </SearchBtn>
          </OptionsRow>

          {error && <ErrLine>{error}</ErrLine>}
        </SearchForm>
      </SearchPanel>

      {/* Results */}
      {searched && !loading && (
        <ResultsSection>
          <SectionLabel>
            {results.length > 0
              ? `${results.length} result${results.length === 1 ? '' : 's'}`
              : 'No results'}
          </SectionLabel>

          {results.length === 0 ? (
            <EmptyResults>
              <EmptyIcon />
              <EmptyText>No similar entries found.</EmptyText>
              <EmptySub>Try adjusting the query vector or increasing Top-K.</EmptySub>
            </EmptyResults>
          ) : (
            <ResultsList>
              {results.map((r, idx) => (
                <ResultCard key={r.entry_id} data-testid={`item-SearchResult-${r.entry_id}`}>
                  <ResultRank>#{idx + 1}</ResultRank>
                  <ResultBody>
                    <ResultText>{r.text}</ResultText>
                    <ResultMeta>
                      <ScoreBadge>{(r.score * 100).toFixed(1)}% match</ScoreBadge>
                      <MetaAuthor>by {r.author}</MetaAuthor>
                      {r.tags.length > 0 && (
                        <TagRow>
                          {r.tags.map((t) => <Tag key={t}>{t}</Tag>)}
                        </TagRow>
                      )}
                    </ResultMeta>
                  </ResultBody>
                </ResultCard>
              ))}
            </ResultsList>
          )}
        </ResultsSection>
      )}

      {!searched && (
        <TipSection>
          <TipCard>
            <TipIcon>💡</TipIcon>
            <TipBody>
              <TipTitle>How similarity search works</TipTitle>
              <TipText>
                Paste your query embedding vector (same dimension as your stored entries) and
                the system will return the top‑K most similar entries ranked by cosine similarity score.
                A score of 1.00 means identical; closer to 0 means less related.
              </TipText>
            </TipBody>
          </TipCard>
          <TipCard>
            <TipIcon>🔢</TipIcon>
            <TipBody>
              <TipTitle>Vector format</TipTitle>
              <TipText>
                Enter floats separated by commas, e.g.{' '}
                <code>0.12, -0.45, 0.78, 0.33</code>. Bracket notation{' '}
                <code>[0.12, -0.45, ...]</code> is also accepted.
              </TipText>
            </TipBody>
          </TipCard>
        </TipSection>
      )}
    </Page>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────────── */
function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}
function EmptyIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--c-muted-soft)' }}>
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}

/* ── Spinner ─────────────────────────────────────────────────────────────────── */
const spin = keyframes`to { transform: rotate(360deg); }`;
const Spinner = styled.span`
  width: 14px; height: 14px;
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
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: ${C.ink};
  margin-bottom: 4px;
`;
const PageSub = styled.p`font-size: 13.5px; color: ${C.muted};`;

const SearchPanel = styled.div`
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 16px;
  padding: 22px 22px 18px;
  margin-bottom: 24px;
`;

const SearchForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const FormGroupInline = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
`;

const Label = styled.label`
  font-size: 12.5px;
  font-weight: 600;
  color: ${C.muted};
  letter-spacing: 0.02em;
`;

const SubLabel = styled.span`
  font-size: 11.5px;
  color: ${C.mutedSoft};
`;

const inputBase = `
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 13px;
  color: ${C.ink};
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-radius: 10px;
  padding: 10px 12px;
  outline: none;
  width: 100%;
  transition: border-color 0.15s, box-shadow 0.15s;
  &:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(124,58,237,0.14);
  }
  &::placeholder { color: ${C.mutedSoft}; }
`;

const VecTextarea = styled.textarea`${inputBase} resize: vertical; min-height: 72px; line-height: 1.6;`;
const TextInput = styled.input`${inputBase}`;
const NumberInput = styled.input`${inputBase} width: 90px;`;

const OptionsRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
`;

const SearchBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 13.5px;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  color: #fff;
  background: var(--color-primary);
  border: none;
  flex-shrink: 0;
  transition: opacity 0.18s, transform 0.15s;
  &:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
  &:disabled { opacity: 0.55; cursor: default; }
`;

const ErrLine = styled.p`font-size: 13px; color: ${C.danger};`;

/* Results */
const ResultsSection = styled.section``;
const SectionLabel = styled.div`
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${C.muted};
  margin-bottom: 12px;
`;

const EmptyResults = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 24px;
  background: ${C.paper2};
  border: 1px dashed ${C.line};
  border-radius: 14px;
  text-align: center;
  gap: 8px;
`;
const EmptyText = styled.p`font-size: 15px; font-weight: 600; color: ${C.ink};`;
const EmptySub = styled.p`font-size: 13px; color: ${C.muted};`;

const ResultsList = styled.div`display: flex; flex-direction: column; gap: 10px;`;

const ResultCard = styled.article`
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 12px;
  transition: border-color 0.15s;
  &:hover { border-color: var(--color-accent); }
`;

const ResultRank = styled.div`
  font-size: 11px;
  font-weight: 700;
  color: ${C.mutedSoft};
  font-family: ui-monospace, monospace;
  padding-top: 2px;
  min-width: 20px;
`;

const ResultBody = styled.div`flex: 1; min-width: 0;`;

const ResultText = styled.p`
  font-size: 14px;
  color: ${C.ink};
  line-height: 1.55;
  margin-bottom: 8px;
  word-break: break-word;
`;

const ResultMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const ScoreBadge = styled.span`
  font-size: 11.5px;
  font-weight: 700;
  color: var(--color-accent);
  background: rgba(34,211,238,0.12);
  border: 1px solid rgba(34,211,238,0.3);
  padding: 2px 8px;
  border-radius: 999px;
  font-family: ui-monospace, monospace;
`;

const MetaAuthor = styled.span`font-size: 12px; color: ${C.muted};`;

const TagRow = styled.div`display: flex; gap: 5px; flex-wrap: wrap;`;
const Tag = styled.span`
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(124,58,237,0.12);
  color: var(--color-primary);
  font-weight: 500;
`;

/* Tips */
const TipSection = styled.div`display: flex; flex-direction: column; gap: 10px;`;
const TipCard = styled.div`
  display: flex;
  gap: 14px;
  padding: 16px;
  background: ${C.paper2};
  border: 1px solid ${C.line};
  border-radius: 12px;
`;
const TipIcon = styled.div`font-size: 20px; flex-shrink: 0; padding-top: 2px;`;
const TipBody = styled.div``;
const TipTitle = styled.div`font-size: 13.5px; font-weight: 600; color: ${C.ink}; margin-bottom: 4px;`;
const TipText = styled.p`font-size: 13px; color: ${C.muted}; line-height: 1.55;
  code { font-family: ui-monospace, monospace; font-size: 12px; background: ${C.paper}; padding: 1px 5px; border-radius: 5px; color: var(--color-accent); }
`;
