import React, { useState } from 'react';
import styled from 'styled-components';
import { C } from '../theme';
import type { Expense, Category } from '../api/expenses/ExpensesClient';

const STATUS_COLORS: Record<string, string> = {
  pending:     'rgba(234,179,8,0.15)',
  approved:    'rgba(5,150,105,0.15)',
  rejected:    'rgba(220,38,38,0.15)',
  reimbursed:  'rgba(59,130,246,0.15)',
};
const STATUS_TEXT: Record<string, string> = {
  pending:     '#b45309',
  approved:    '#065f46',
  rejected:    '#991b1b',
  reimbursed:  '#1e40af',
};

function fmtAmount(amount: number, currency: string): string {
  // amount is stored as minor units (cents). Display as major units.
  return `${(amount / 100).toFixed(2)} ${currency}`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  myExpenses: Expense[];
  categories: Category[];
  loading: boolean;
  onSubmit: (params: { description: string; amount: number; currency: string; category: string }) => Promise<void>;
  onEdit: (params: { expense_id: string; description: string; amount: number; currency: string; category: string }) => Promise<void>;
  onAddCategory: (name: string) => Promise<void>;
}

export default function SubmitExpenseView({ myExpenses, categories, loading, onSubmit, onEdit, onAddCategory }: Props) {
  const [desc, setDesc] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [category, setCategory] = useState('');
  const [newCat, setNewCat] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmountStr, setEditAmountStr] = useState('');
  const [editCurrency, setEditCurrency] = useState('USD');
  const [editCategory, setEditCategory] = useState('');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const parsed = parseFloat(amountStr);
    if (!desc.trim()) { setFormError('Description is required.'); return; }
    if (!amountStr.trim() || isNaN(parsed) || parsed <= 0) { setFormError('Enter a valid amount.'); return; }
    if (!category) { setFormError('Select a category.'); return; }
    setSubmitting(true);
    try {
      await onSubmit({ description: desc.trim(), amount: Math.round(parsed * 100), currency, category });
      setDesc(''); setAmountStr(''); setCategory('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCat.trim()) return;
    try { await onAddCategory(newCat.trim()); setNewCat(''); } catch { /* ignore */ }
  };

  const startEdit = (exp: Expense) => {
    setEditId(exp.id);
    setEditDesc(exp.description);
    setEditAmountStr((exp.amount / 100).toFixed(2));
    setEditCurrency(exp.currency);
    setEditCategory(exp.category);
    setEditError('');
  };

  const cancelEdit = () => { setEditId(null); setEditError(''); };

  const saveEdit = async () => {
    if (!editId) return;
    setEditError('');
    const parsed = parseFloat(editAmountStr);
    if (!editDesc.trim()) { setEditError('Description required.'); return; }
    if (isNaN(parsed) || parsed <= 0) { setEditError('Valid amount required.'); return; }
    if (!editCategory) { setEditError('Category required.'); return; }
    setEditSaving(true);
    try {
      await onEdit({ expense_id: editId, description: editDesc.trim(), amount: Math.round(parsed * 100), currency: editCurrency, category: editCategory });
      setEditId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <Wrap>
      {/* ── Submit form ── */}
      <Card>
        <CardTitle>Submit Expense</CardTitle>
        <Form onSubmit={handleSubmit}>
          <Row>
            <Field style={{ flex: 2 }}>
              <label>Description *</label>
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="e.g. Flight to NYC"
                maxLength={200}
              />
            </Field>
          </Row>
          <Row>
            <Field>
              <label>Amount *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field style={{ maxWidth: 100 }}>
              <label>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option>USD</option><option>EUR</option><option>GBP</option>
                <option>CAD</option><option>AUD</option><option>JPY</option>
              </select>
            </Field>
            <Field style={{ flex: 2 }}>
              <label>Category *</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">— select —</option>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </Field>
          </Row>
          {formError && <ErrMsg>{formError}</ErrMsg>}
          <SubmitBtn type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Expense'}</SubmitBtn>
        </Form>

        {/* Quick add category */}
        <CatRow>
          <span>Add category:</span>
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
            placeholder="e.g. Travel"
            style={{ flex: 1 }}
          />
          <AddCatBtn type="button" onClick={handleAddCategory} disabled={!newCat.trim()}>Add</AddCatBtn>
        </CatRow>
      </Card>

      {/* ── My expenses list ── */}
      <Card>
        <CardTitle>My Expenses {myExpenses.length > 0 && <Count>{myExpenses.length}</Count>}</CardTitle>
        {loading && myExpenses.length === 0 && <Empty>Loading…</Empty>}
        {!loading && myExpenses.length === 0 && <Empty>No expenses submitted yet.</Empty>}
        <ExpenseList>
          {myExpenses.map((exp) =>
            editId === exp.id ? (
              <EditForm key={exp.id}>
                <EditRow>
                  <input
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Description"
                    style={{ flex: 2 }}
                  />
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editAmountStr}
                    onChange={(e) => setEditAmountStr(e.target.value)}
                    placeholder="Amount"
                    style={{ width: 90 }}
                  />
                  <select value={editCurrency} onChange={(e) => setEditCurrency(e.target.value)} style={{ width: 70 }}>
                    <option>USD</option><option>EUR</option><option>GBP</option>
                    <option>CAD</option><option>AUD</option><option>JPY</option>
                  </select>
                  <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} style={{ flex: 1 }}>
                    <option value="">— category —</option>
                    {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </EditRow>
                {editError && <ErrMsg>{editError}</ErrMsg>}
                <EditActions>
                  <SaveBtn onClick={saveEdit} disabled={editSaving}>{editSaving ? 'Saving…' : 'Save'}</SaveBtn>
                  <CancelBtn onClick={cancelEdit}>Cancel</CancelBtn>
                </EditActions>
              </EditForm>
            ) : (
              <ExpenseItem key={exp.id}>
                <ExpenseTop>
                  <Desc>{exp.description}</Desc>
                  <Amount>{fmtAmount(exp.amount, exp.currency)}</Amount>
                  <StatusBadge $status={exp.status}>{exp.status}</StatusBadge>
                </ExpenseTop>
                <ExpenseMeta>
                  <span>{exp.category}</span>
                  <span>{fmtDate(exp.submitted_at)}</span>
                  {exp.reviewer_note && <Note>Note: {exp.reviewer_note}</Note>}
                  {exp.status === 'pending' && (
                    <EditLink onClick={() => startEdit(exp)}>Edit</EditLink>
                  )}
                </ExpenseMeta>
              </ExpenseItem>
            )
          )}
        </ExpenseList>
      </Card>
    </Wrap>
  );
}

/* ── Styled components ────────────────────────────────────────────────────── */

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  overflow-y: auto;
  flex: 1;
`;

const Card = styled.div`
  background: ${C.paper};
  border: 1px solid ${C.line};
  border-radius: 14px;
  padding: 20px 22px;
`;

const CardTitle = styled.h3`
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: ${C.ink};
  margin: 0 0 16px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Count = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(30,64,175,0.12);
  color: #1e40af;
  font-size: 12px;
  font-weight: 700;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Row = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
  min-width: 120px;
  label {
    font-size: 12px;
    font-weight: 600;
    color: ${C.muted};
    letter-spacing: 0.02em;
  }
  input, select {
    padding: 9px 12px;
    border-radius: 9px;
    border: 1px solid ${C.line};
    background: ${C.paper2};
    color: ${C.ink};
    font-size: 13.5px;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    &:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(30,64,175,0.12); }
  }
`;

const ErrMsg = styled.p`
  font-size: 12.5px;
  color: ${C.danger};
  margin: 0;
`;

const SubmitBtn = styled.button`
  align-self: flex-start;
  padding: 10px 22px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  color: #fff;
  background: var(--color-primary);
  border: none;
  transition: opacity 0.15s, transform 0.15s;
  &:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
  &:disabled { opacity: 0.55; cursor: default; }
`;

const CatRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid ${C.line};
  span { font-size: 12.5px; color: ${C.muted}; font-weight: 600; white-space: nowrap; }
  input {
    padding: 7px 10px;
    border-radius: 8px;
    border: 1px solid ${C.line};
    background: ${C.paper2};
    color: ${C.ink};
    font-size: 13px;
    outline: none;
    &:focus { border-color: var(--color-primary); }
  }
`;

const AddCatBtn = styled.button`
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  color: var(--color-primary);
  background: rgba(30,64,175,0.08);
  border: 1px solid rgba(30,64,175,0.25);
  transition: background 0.14s;
  &:hover:not(:disabled) { background: rgba(30,64,175,0.14); }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const Empty = styled.div`
  text-align: center;
  padding: 28px 0;
  font-size: 13.5px;
  color: ${C.muted};
`;

const ExpenseList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ExpenseItem = styled.div`
  padding: 12px 14px;
  border: 1px solid ${C.line};
  border-radius: 10px;
  background: ${C.paper2};
`;

const ExpenseTop = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const Desc = styled.span`
  flex: 1;
  font-size: 13.5px;
  font-weight: 600;
  color: ${C.ink};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Amount = styled.span`
  font-size: 14px;
  font-weight: 700;
  color: ${C.ink};
  white-space: nowrap;
`;

const StatusBadge = styled.span<{ $status: string }>`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 3px 8px;
  border-radius: 999px;
  background: ${(p) => STATUS_COLORS[p.$status] ?? 'rgba(100,100,100,0.12)'};
  color: ${(p) => STATUS_TEXT[p.$status] ?? C.muted};
`;

const ExpenseMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
  font-size: 12px;
  color: ${C.muted};
  flex-wrap: wrap;
`;

const Note = styled.span`
  font-style: italic;
  color: ${C.mutedSoft};
`;

const EditLink = styled.button`
  margin-left: auto;
  background: none;
  border: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
  cursor: pointer;
  padding: 0;
  &:hover { text-decoration: underline; }
`;

const EditForm = styled.div`
  padding: 12px 14px;
  border: 1px solid var(--color-primary);
  border-radius: 10px;
  background: rgba(30,64,175,0.04);
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const EditRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  input, select {
    padding: 7px 10px;
    border-radius: 8px;
    border: 1px solid ${C.line};
    background: ${C.paper};
    color: ${C.ink};
    font-size: 13px;
    outline: none;
    min-width: 60px;
    flex: 1;
    &:focus { border-color: var(--color-primary); }
  }
`;

const EditActions = styled.div`
  display: flex;
  gap: 8px;
`;

const SaveBtn = styled.button`
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  color: #fff;
  background: var(--color-primary);
  border: none;
  &:disabled { opacity: 0.55; cursor: default; }
`;

const CancelBtn = styled.button`
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  color: ${C.ink};
  background: ${C.paper};
  border: 1px solid ${C.line};
  &:hover { background: ${C.paper2}; }
`;
