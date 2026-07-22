import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import { DisplayNamesProvider } from '../../components/MemberLabel';
import { DisplayNameGate } from '../../components/DisplayNameGate';
import WorkspaceChrome from '../../components/WorkspaceChrome';
import SettingsPanel from '../../components/SettingsPanel';
import UnitRail from '../../components/UnitRail';

/**
 * Multi-topology app view: chrome + a group rail + the active group's balance
 * sheet. Each group is an independent context (instance) of the `group`
 * service.
 *
 * SHELL PASS (ABI-free): this renders the GroupView layout — balances
 * summary, add-expense, settle-up, history — against local placeholder
 * state only. No generated client import yet; a later pass swaps this local
 * state for a real `useExpenses`/`useSettlements` data hook bound to
 * SplitwisecloneClient, exactly like useItems does in the neutral scaffold.
 * Keep the workspace gating, the UnitRail, and the WorkspaceChrome wiring —
 * these make the app multi-user + multi-group out of the box.
 */

/* ── placeholder domain types (stand in for the future generated client) ─── */
interface PlaceholderExpense {
  id: string;
  description: string;
  amountCents: number;
  paidBy: string;
  splitBetween: string[];
  createdAt: number;
}
interface PlaceholderSettlement {
  id: string;
  from: string;
  to: string;
  amountCents: number;
  createdAt: number;
}
type HistoryEntry =
  | { kind: 'expense'; at: number; data: PlaceholderExpense }
  | { kind: 'settlement'; at: number; data: PlaceholderSettlement };

function fmtMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function computeBalances(
  expenses: PlaceholderExpense[],
  settlements: PlaceholderSettlement[],
): Array<{ member: string; cents: number }> {
  const balances = new Map<string, number>();
  const add = (member: string, delta: number) => balances.set(member, (balances.get(member) ?? 0) + delta);
  for (const e of expenses) {
    const n = e.splitBetween.length || 1;
    const share = e.amountCents / n;
    add(e.paidBy, e.amountCents);
    for (const person of e.splitBetween) add(person, -share);
  }
  for (const s of settlements) {
    add(s.from, s.amountCents);
    add(s.to, -s.amountCents);
  }
  return [...balances.entries()]
    .map(([member, cents]) => ({ member, cents: Math.round(cents) }))
    .sort((a, b) => b.cents - a.cents);
}

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${idSeq}`;
}

export default function AppPage() {
  const ws = useWorkspace();

  const [wsName, setWsName] = useState('My splits');
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // ── placeholder group state (per-group in a real build; shared here since
  //    there's no backend yet to key it by activeUnitId) ────────────────────
  const [groupName, setGroupName] = useState('Untitled group');
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState(groupName);

  const [expenses, setExpenses] = useState<PlaceholderExpense[]>([]);
  const [settlements, setSettlements] = useState<PlaceholderSettlement[]>([]);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [splitBetween, setSplitBetween] = useState('');

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [settleAmount, setSettleAmount] = useState('');

  const balances = useMemo(() => computeBalances(expenses, settlements), [expenses, settlements]);
  const history = useMemo<HistoryEntry[]>(() => {
    const entries: HistoryEntry[] = [
      ...expenses.map((e): HistoryEntry => ({ kind: 'expense', at: e.createdAt, data: e })),
      ...settlements.map((s): HistoryEntry => ({ kind: 'settlement', at: s.createdAt, data: s })),
    ];
    return entries.sort((a, b) => b.at - a.at);
  }, [expenses, settlements]);

  const submitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const desc = description.trim();
    const dollars = Number(amount);
    const who = paidBy.trim();
    const split = splitBetween.split(',').map((s) => s.trim()).filter(Boolean);
    if (!desc || !Number.isFinite(dollars) || dollars <= 0 || !who || split.length === 0) return;
    const now = Date.now();
    setExpenses((prev) => [
      ...prev,
      { id: nextId('exp'), description: desc, amountCents: Math.round(dollars * 100), paidBy: who, splitBetween: split, createdAt: now },
    ]);
    setDescription('');
    setAmount('');
    setPaidBy('');
    setSplitBetween('');
  };

  const startEditExpense = (exp: PlaceholderExpense) => {
    setEditingExpenseId(exp.id);
    setEditDescription(exp.description);
    setEditAmount((exp.amountCents / 100).toString());
  };

  const saveEditExpense = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    const desc = editDescription.trim();
    const dollars = Number(editAmount);
    if (!desc || !Number.isFinite(dollars) || dollars <= 0) return;
    setExpenses((prev) => prev.map((x) => (x.id === id ? { ...x, description: desc, amountCents: Math.round(dollars * 100) } : x)));
    setEditingExpenseId(null);
  };

  const deleteExpense = (id: string) => setExpenses((prev) => prev.filter((x) => x.id !== id));

  const submitSettlement = (e: React.FormEvent) => {
    e.preventDefault();
    const fromName = from.trim();
    const toName = to.trim();
    const dollars = Number(settleAmount);
    if (!fromName || !toName || fromName === toName || !Number.isFinite(dollars) || dollars <= 0) return;
    const now = Date.now();
    setSettlements((prev) => [
      ...prev,
      { id: nextId('stl'), from: fromName, to: toName, amountCents: Math.round(dollars * 100), createdAt: now },
    ]);
    setFrom('');
    setTo('');
    setSettleAmount('');
  };

  const saveGroupName = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = groupNameDraft.trim();
    if (!trimmed) return;
    setGroupName(trimmed);
    setEditingGroupName(false);
  };

  // No namespace yet (fresh web session): offer create-or-join. workspace-ready
  // renders once the NAMESPACE exists (below), so the base e2e helpers work.
  if (!ws.namespaceId && !ws.loading) {
    return (
      <Empty>
        <Card>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Set up your space, then create expense groups for trips, flatmates, or anything you split costs on.</p>
          <NameField
            data-testid="field-workspace-name"
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder="e.g. My splits"
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
          <JoinModal onJoin={async (code) => { await ws.join(code); setShowJoin(false); }} onClose={() => setShowJoin(false)} />
        )}
      </Empty>
    );
  }

  // Namespace still resolving (initial load / SSO callback lookup): don't render
  // the workspace-ready chrome with a null namespace - wait for it to settle.
  if (!ws.namespaceId) {
    return <Empty><Card><p>Loading your workspace…</p></Card></Empty>;
  }

  return (
    <DisplayNamesProvider namespaceId={ws.namespaceId} contextId={ws.contextId} selfIdentity={ws.executorPublicKey}>
      <Page data-testid="workspace-ready">
        <WorkspaceChrome
          ws={ws}
          onOpenInvite={() => setShowInvite(true)}
          onOpenJoin={() => setShowJoin(true)}
          onOpenSettings={() => setShowSettings(true)}
        />
        <Layout>
          {/* A callback/SSO session is pinned to the injected context, so group
              switching/creation is disabled there (see useWorkspace switchNamespace
              /leaveWorkspace) - don't show a rail that can't change the view. */}
          {!ws.injectedContext && <UnitRail ws={ws} />}
          <Content>
            {!ws.activeUnitId ? (
              <Hint>Create or pick a group in the rail to get started.</Hint>
            ) : (
              <>
                <GroupHeader>
                  {editingGroupName ? (
                    <RenameForm onSubmit={saveGroupName}>
                      <input
                        data-testid="field-new_name"
                        value={groupNameDraft}
                        onChange={(e) => setGroupNameDraft(e.target.value)}
                        maxLength={64}
                        autoFocus
                        aria-label="Group name"
                      />
                      <Primary data-testid="action-rename_group" type="submit" disabled={!groupNameDraft.trim()}>Save</Primary>
                      <Secondary type="button" onClick={() => { setEditingGroupName(false); setGroupNameDraft(groupName); }}>Cancel</Secondary>
                    </RenameForm>
                  ) : (
                    <h1 onClick={() => { setGroupNameDraft(groupName); setEditingGroupName(true); }} title="Click to rename">
                      {groupName}
                    </h1>
                  )}
                </GroupHeader>

                <SectionTitle>Balances</SectionTitle>
                <Balances>
                  {balances.length === 0 && <Hint>No expenses yet — balances will show up here once someone adds one.</Hint>}
                  {balances.map((b) => (
                    <BalanceRow key={b.member} data-testid="item-balance" $positive={b.cents > 0} $zero={b.cents === 0}>
                      <span className="who">{b.member}</span>
                      <span className="amt">
                        {b.cents === 0 ? 'settled up' : b.cents > 0 ? `is owed ${fmtMoney(b.cents)}` : `owes ${fmtMoney(-b.cents)}`}
                      </span>
                    </BalanceRow>
                  ))}
                </Balances>

                <Columns>
                  <Panel>
                    <SectionTitle>Add expense</SectionTitle>
                    <Form data-testid="add-expense-form" onSubmit={submitExpense}>
                      <input
                        data-testid="field-description"
                        placeholder="What was it for?"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        aria-label="Description"
                      />
                      <input
                        data-testid="field-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        aria-label="Amount"
                      />
                      <input
                        data-testid="field-paid_by"
                        placeholder="Paid by"
                        value={paidBy}
                        onChange={(e) => setPaidBy(e.target.value)}
                        aria-label="Paid by"
                      />
                      <input
                        data-testid="field-split_between"
                        placeholder="Split between (comma-separated)"
                        value={splitBetween}
                        onChange={(e) => setSplitBetween(e.target.value)}
                        aria-label="Split between"
                      />
                      <Primary data-testid="action-add_expense" type="submit" disabled={!description.trim() || !amount || !paidBy.trim() || !splitBetween.trim()}>
                        Add expense
                      </Primary>
                    </Form>
                  </Panel>

                  <Panel>
                    <SectionTitle>Settle up</SectionTitle>
                    <Form data-testid="settle-up-form" onSubmit={submitSettlement}>
                      <input
                        data-testid="field-from"
                        placeholder="From"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        aria-label="From"
                      />
                      <input
                        data-testid="field-to"
                        placeholder="To"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        aria-label="To"
                      />
                      <input
                        data-testid="field-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Amount"
                        value={settleAmount}
                        onChange={(e) => setSettleAmount(e.target.value)}
                        aria-label="Settlement amount"
                      />
                      <Primary data-testid="action-record_settlement" type="submit" disabled={!from.trim() || !to.trim() || !settleAmount}>
                        Record settlement
                      </Primary>
                    </Form>
                  </Panel>
                </Columns>

                <SectionTitle>History</SectionTitle>
                <List>
                  {history.length === 0 && <Hint>No expenses or settlements yet.</Hint>}
                  {history.map((h) =>
                    h.kind === 'expense' ? (
                      editingExpenseId === h.data.id ? (
                        <EditForm key={h.data.id} onSubmit={(e) => saveEditExpense(e, h.data.id)}>
                          <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} aria-label="Edit description" />
                          <input type="number" min="0" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} aria-label="Edit amount" />
                          <Primary data-testid="action-edit_expense" type="submit">Save</Primary>
                          <Secondary type="button" onClick={() => setEditingExpenseId(null)}>Cancel</Secondary>
                        </EditForm>
                      ) : (
                        <ItemRow key={h.data.id} data-testid="item-expense">
                          <div className="text">
                            <strong>{h.data.description}</strong>
                            <span>{h.data.paidBy} paid {fmtMoney(h.data.amountCents)} · split between {h.data.splitBetween.join(', ')}</span>
                          </div>
                          <RowActions>
                            <button onClick={() => startEditExpense(h.data)} aria-label="Edit">✎</button>
                            <button data-testid="action-delete_expense" onClick={() => deleteExpense(h.data.id)} aria-label="Delete">×</button>
                          </RowActions>
                        </ItemRow>
                      )
                    ) : (
                      <ItemRow key={h.data.id} data-testid="item-settlement">
                        <div className="text">
                          <strong>Settlement</strong>
                          <span>{h.data.from} paid {h.data.to} {fmtMoney(h.data.amountCents)}</span>
                        </div>
                      </ItemRow>
                    ),
                  )}
                </List>
              </>
            )}
            <DisplayNameGate injected={ws.injectedContext} />
          </Content>
        </Layout>

        {showInvite && <InviteModal onInvite={ws.invite} onClose={() => setShowInvite(false)} />}
        {showJoin && <JoinModal onJoin={async (code) => { await ws.join(code); setShowJoin(false); }} onClose={() => setShowJoin(false)} />}
        {showSettings && <SettingsPanel ws={ws} onClose={() => setShowSettings(false)} />}
      </Page>
    </DisplayNamesProvider>
  );
}

const Page = styled.div`max-width: 1040px; margin: 0 auto; padding: 28px 20px 64px; width: 100%;`;
const Layout = styled.div`
  display: flex; gap: 20px; position: relative;
  @media (max-width: 640px) { flex-direction: column; }
`;
const Content = styled.div`flex: 1; min-width: 0; position: relative;`;
const GroupHeader = styled.div`
  margin-bottom: 18px;
  h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.4px; color: ${C.ink}; cursor: pointer; display: inline-block; }
`;
const RenameForm = styled.form`
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  input { padding: 8px 10px; font-size: 16px; font-weight: 700; color: ${C.ink}; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 8px; outline: none; &:focus { border-color: ${C.green}; } }
`;
const SectionTitle = styled.h2`
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: ${C.muted};
  margin: 22px 0 10px;
`;
const Balances = styled.div`display: flex; flex-direction: column; gap: 8px;`;
const BalanceRow = styled.div<{ $positive: boolean; $zero: boolean }>`
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 14px; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 10px;
  .who { font-size: 14px; font-weight: 600; color: ${C.ink}; }
  .amt { font-size: 13px; font-weight: 600; color: ${(p) => (p.$zero ? C.muted : p.$positive ? C.accentInk : C.danger)}; }
`;
const Columns = styled.div`
  display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 4px;
  @media (max-width: 720px) { grid-template-columns: 1fr; }
`;
const Panel = styled.div``;
const Form = styled.form`
  display: flex; gap: 8px; flex-wrap: wrap;
  input { flex: 1; min-width: 140px; padding: 10px 12px; font-size: 14px; color: ${C.ink}; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 10px; outline: none; &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); } }
`;
const EditForm = styled.form`
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 10px 14px;
  background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 12px;
  input { flex: 1; min-width: 120px; padding: 8px 10px; font-size: 13px; color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 8px; outline: none; &:focus { border-color: ${C.green}; } }
`;
const List = styled.div`display: flex; flex-direction: column; gap: 10px;`;
const ItemRow = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 16px; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 12px;
  .text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .text strong { font-size: 15px; color: ${C.ink}; }
  .text span { font-size: 13px; color: ${C.muted}; }
`;
const RowActions = styled.div`
  display: flex; gap: 2px; flex-shrink: 0;
  button { width: 30px; height: 30px; font-size: 16px; line-height: 1; color: ${C.mutedSoft}; background: transparent; border: none; border-radius: 8px; cursor: pointer; &:hover { background: ${C.paper}; color: ${C.danger}; } }
`;
const Hint = styled.p`font-size: 14px; color: ${C.muted}; padding: 8px 2px;`;
const ErrLine = styled.p`margin: 8px 0; font-size: 13px; color: ${C.danger};`;
const Empty = styled.div`flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px;`;
const Card = styled.div`
  max-width: 420px; text-align: center; padding: 32px 28px; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: 18px;
  h2 { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; color: ${C.ink}; margin-bottom: 8px; }
  p { font-size: 14px; color: ${C.muted}; margin-bottom: 22px; line-height: 1.55; }
`;
const Row = styled.div`display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;`;
const NameField = styled.input`
  width: 100%; margin-bottom: 16px; padding: 10px 12px; font-size: 14px; text-align: center;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 10px; outline: none;
  &:focus { border-color: ${C.green}; box-shadow: 0 0 0 3px rgba(164,255,17,0.18); }
`;
const Primary = styled.button`
  display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.accentInk}; background: ${C.accent}; border: 1px solid var(--c-accent);
  transition: filter 0.18s, transform 0.15s;
  &:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-1px); }
  &:disabled { opacity: 0.55; cursor: default; }
`;
const Secondary = styled.button`
  padding: 10px 16px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer;
  color: ${C.ink}; background: ${C.paper}; border: 1px solid ${C.line};
  transition: background 0.15s, border-color 0.15s;
  &:hover { background: ${C.paper2}; border-color: ${C.green}; }
`;
