import React, { useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useFeedback } from '../../components/Feedback';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import { DisplayNamesProvider } from '../../components/MemberLabel';
import { DisplayNameGate } from '../../components/DisplayNameGate';
import WorkspaceChrome from '../../components/WorkspaceChrome';
import { Card, Empty, Primary, Secondary, ErrLine, Hint, NARROW, WIDE, focusRing, tapTarget, EmptyState } from '../../components/primitives';
import SettingsPanel from '../../components/SettingsPanel';
import UnitRail from '../../components/UnitRail';

/**
 * DESIGN DIRECTION (shell pass): Split Circle reads like a shared ledger, not a
 * generic list. Every expense is a receipt-line with a paid-by tag and a split
 * pill; the signature element is the Dashboard's balance bar — one horizontal
 * bar per member that fills toward the brand green when they're owed money and
 * toward the danger tone when they owe it, so the whole group's financial state
 * reads in one glance without parsing a single number.
 *
 * ABI-FREE SHELL PASS: this view is presentational only. Expenses, settlements
 * and members below are local component state seeded with a few example rows —
 * NOT wired to SplitcircleClient. A later pass replaces this local state with
 * real hooks (useExpenses/useSettlements/useMembers) bound to list_expenses,
 * add_expense, edit_expense, delete_expense, record_settlement, list_settlements,
 * list_members, get_balances, get_summary and rename_group.
 */

type SplitType = 'equal' | 'single';

interface Member {
  id: string;
  name: string;
}

interface ExpenseRowData {
  id: string;
  description: string;
  amount: number; // minor units (paise/cents)
  paidBy: string;
  splitType: SplitType;
  participants: string[];
  owedBy: string;
}

interface SettlementRowData {
  id: string;
  from: string;
  to: string;
  amount: number; // minor units
}

const MEMBERS: Member[] = [
  { id: 'm-priya', name: 'Priya' },
  { id: 'm-rahul', name: 'Rahul' },
  { id: 'm-sam', name: 'Sam' },
  { id: 'm-meera', name: 'Meera' },
];

const INITIAL_EXPENSES: ExpenseRowData[] = [
  { id: 'exp-1', description: 'Dinner at Beach Shack', amount: 120000, paidBy: 'm-priya', splitType: 'equal', participants: ['m-priya', 'm-rahul', 'm-sam'], owedBy: '' },
  { id: 'exp-2', description: 'Scooter rental', amount: 80000, paidBy: 'm-rahul', splitType: 'single', participants: [], owedBy: 'm-sam' },
  { id: 'exp-3', description: 'Groceries', amount: 45000, paidBy: 'm-meera', splitType: 'equal', participants: ['m-priya', 'm-rahul', 'm-sam', 'm-meera'], owedBy: '' },
];

const INITIAL_SETTLEMENTS: SettlementRowData[] = [
  { id: 'settle-1', from: 'm-sam', to: 'm-rahul', amount: 80000 },
  { id: 'settle-2', from: 'm-meera', to: 'm-priya', amount: 15000 },
];

const fmt = (minor: number): string => `₹${Math.round(Math.abs(minor) / 100).toLocaleString()}`;
const nameOf = (id: string): string => MEMBERS.find((m) => m.id === id)?.name ?? 'Unknown';

function splitShare(amount: number, count: number): number {
  return count > 0 ? Math.round(amount / count) : 0;
}

/** Pure so the split math is easy to eyeball/test independent of the UI. */
function summarize(expenses: ExpenseRowData[]): { total: number; paid: Record<string, number>; owed: Record<string, number> } {
  const paid: Record<string, number> = {};
  const owed: Record<string, number> = {};
  for (const m of MEMBERS) { paid[m.id] = 0; owed[m.id] = 0; }
  let total = 0;
  for (const e of expenses) {
    total += e.amount;
    paid[e.paidBy] = (paid[e.paidBy] ?? 0) + e.amount;
    if (e.splitType === 'equal') {
      const share = splitShare(e.amount, e.participants.length);
      for (const p of e.participants) owed[p] = (owed[p] ?? 0) + share;
    } else if (e.owedBy) {
      owed[e.owedBy] = (owed[e.owedBy] ?? 0) + e.amount;
    }
  }
  return { total, paid, owed };
}

function computeBalances(expenses: ExpenseRowData[], settlements: SettlementRowData[]): Record<string, number> {
  const { paid, owed } = summarize(expenses);
  const net: Record<string, number> = {};
  for (const m of MEMBERS) net[m.id] = (paid[m.id] ?? 0) - (owed[m.id] ?? 0);
  for (const s of settlements) {
    net[s.from] = (net[s.from] ?? 0) + s.amount;
    net[s.to] = (net[s.to] ?? 0) - s.amount;
  }
  return net;
}

/* Drawn marks, not emoji — stroked with currentColor so they take the preset accent. */
const IconEqualSplit = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="6" cy="8" r="2.2" /><circle cx="18" cy="8" r="2.2" /><circle cx="12" cy="17" r="2.2" />
    <path d="M7.6 9.6 10.6 15.4M16.4 9.6 13.4 15.4" />
  </svg>
);
const IconSingleOwed = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="6" cy="8" r="2.2" /><circle cx="18" cy="16" r="2.2" />
    <path d="M8 9.5 16 14.5M13 12.5v-2h5" />
  </svg>
);
const IconCheck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const IconPencil = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="M13.5 7.5l3 3" />
  </svg>
);
const IconTrash = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m1 0-1 13a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1L7 7" />
  </svg>
);

type Tab = 'expenses' | 'dashboard' | 'members';
const TABS: { key: Tab; label: string }[] = [
  { key: 'expenses', label: 'Expenses' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'members', label: 'Members' },
];

export default function AppPage() {
  const { notify } = useFeedback();
  const ws = useWorkspace();

  const [wsName, setWsName] = useState('My group');
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<Tab>('expenses');

  // Local mock domain state — swapped for the real ABI-backed hooks in the next pass.
  const [expenses, setExpenses] = useState<ExpenseRowData[]>(INITIAL_EXPENSES);
  const [settlements, setSettlements] = useState<SettlementRowData[]>(INITIAL_SETTLEMENTS);
  const idCounter = useRef(0);
  const nextId = (prefix: string) => { idCounter.current += 1; return `${prefix}-${idCounter.current}`; };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(MEMBERS[0].id);
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [participants, setParticipants] = useState<string[]>(MEMBERS.map((m) => m.id));
  const [owedBy, setOwedBy] = useState(MEMBERS[1]?.id ?? MEMBERS[0].id);

  const [showSettle, setShowSettle] = useState(false);
  const [settleFrom, setSettleFrom] = useState(MEMBERS[0].id);
  const [settleTo, setSettleTo] = useState(MEMBERS[1]?.id ?? MEMBERS[0].id);
  const [settleAmount, setSettleAmount] = useState('');

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  const { total, paid, owed } = useMemo(() => summarize(expenses), [expenses]);
  const balances = useMemo(() => computeBalances(expenses, settlements), [expenses, settlements]);
  const maxAbsBalance = Math.max(1, ...MEMBERS.map((m) => Math.abs(balances[m.id] ?? 0)));
  const topPayer = useMemo(
    () => MEMBERS.reduce((best, m) => ((paid[m.id] ?? 0) > (paid[best.id] ?? 0) ? m : best), MEMBERS[0]),
    [paid],
  );

  const groupName = ws.units.find((u) => u.contextId === ws.activeUnitId)?.name || 'Group';

  const toggleParticipant = (id: string) => {
    setParticipants((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const submitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const minor = Math.round(Number(amount) * 100);
    if (!description.trim() || !minor || minor <= 0) return;
    if (splitType === 'equal' && participants.length === 0) return;
    if (splitType === 'single' && !owedBy) return;
    const row: ExpenseRowData = {
      id: nextId('exp'),
      description: description.trim(),
      amount: minor,
      paidBy,
      splitType,
      participants: splitType === 'equal' ? participants : [],
      owedBy: splitType === 'single' ? owedBy : '',
    };
    setExpenses((prev) => [...prev, row]);
    setDescription('');
    setAmount('');
    notify('Expense added');
  };

  const startEdit = (row: ExpenseRowData) => {
    setEditingId(row.id);
    setEditDescription(row.description);
    setEditAmount(String(row.amount / 100));
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const minor = Math.round(Number(editAmount) * 100);
    if (!editDescription.trim() || !minor || minor <= 0 || !editingId) return;
    const id = editingId;
    setExpenses((prev) => prev.map((row) => (row.id === id ? { ...row, description: editDescription.trim(), amount: minor } : row)));
    setEditingId(null);
    notify('Expense updated');
  };

  const removeExpense = (id: string) => {
    setExpenses((prev) => prev.filter((row) => row.id !== id));
    if (editingId === id) setEditingId(null);
    notify('Expense removed');
  };

  const submitSettlement = (e: React.FormEvent) => {
    e.preventDefault();
    const minor = Math.round(Number(settleAmount) * 100);
    if (!minor || minor <= 0 || settleFrom === settleTo) return;
    setSettlements((prev) => [...prev, { id: nextId('settle'), from: settleFrom, to: settleTo, amount: minor }]);
    setSettleAmount('');
    setShowSettle(false);
    notify('Settlement recorded');
  };

  const submitRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setRenaming(false);
    setNewName('');
    notify('Group renamed');
  };

  // No namespace yet (fresh web session): offer create-or-join. workspace-ready
  // renders once the NAMESPACE exists (below), so the base e2e helpers work.
  if (!ws.namespaceId && !ws.loading) {
    return (
      <Empty>
        <Card>
          <h2>Welcome to {APP_DISPLAY_NAME}</h2>
          <p>Create a group to start tracking shared expenses, or join one you were invited to.</p>
          <WorkspaceNameField
            data-testid="field-workspace-name"
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder="Group name"
            maxLength={64}
            aria-label="Group name"
          />
          <Row>
            <Primary data-testid="create-workspace-btn" onClick={() => { void ws.bootstrap(wsName).catch(() => {}); }}>Create group</Primary>
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
    return <Empty><Card><p>Loading your groups…</p></Card></Empty>;
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
          {!ws.injectedContext && <UnitRail ws={ws} />}
          <Content>
            {!ws.activeUnitId ? (
              <Hint>Create or pick a group in the rail to get started.</Hint>
            ) : (
              <>
                <GroupHeader>
                  <div className="titleBlock">
                    {renaming ? (
                      <RenameForm onSubmit={submitRename}>
                        <input
                          data-testid="field-new_name"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder={groupName}
                          maxLength={64}
                          autoFocus
                          aria-label="New group name"
                        />
                        <Primary data-testid="action-rename_group" type="submit" disabled={!newName.trim()}>Save</Primary>
                        <Secondary type="button" onClick={() => { setRenaming(false); setNewName(''); }}>Cancel</Secondary>
                      </RenameForm>
                    ) : (
                      <h1>
                        {groupName}
                        <RenameBtn type="button" aria-label="Rename group" onClick={() => setRenaming(true)}>{IconPencil}</RenameBtn>
                      </h1>
                    )}
                    <p className="sub">{MEMBERS.length} members · shared expenses</p>
                  </div>
                  <Avatars>
                    {MEMBERS.map((m) => <span key={m.id} title={m.name}>{m.name[0]}</span>)}
                  </Avatars>
                </GroupHeader>

                <Tabs role="tablist">
                  {TABS.map((t) => (
                    <TabBtn key={t.key} role="tab" aria-selected={tab === t.key} $active={tab === t.key} onClick={() => setTab(t.key)} data-testid={`tab-${t.key}`}>
                      {t.label}
                    </TabBtn>
                  ))}
                </Tabs>

                {tab === 'expenses' && (
                  <>
                    <Card>
                      <PanelTitle><h2>Expenses</h2></PanelTitle>
                      {expenses.length === 0 ? (
                        <EmptyState>
                          <h3>No expenses yet</h3>
                          <p>Add the first one below and everyone in this group sees it straight away.</p>
                        </EmptyState>
                      ) : (
                        <ExpenseList>
                          {expenses.map((exp) => (
                            <ExpenseRow data-testid="item-expense" key={exp.id}>
                              {editingId === exp.id ? (
                                <EditForm onSubmit={saveEdit}>
                                  <input
                                    data-testid="field-description"
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    placeholder="Description"
                                    aria-label="Description"
                                  />
                                  <input
                                    data-testid="field-amount"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={editAmount}
                                    onChange={(e) => setEditAmount(e.target.value)}
                                    placeholder="Amount"
                                    aria-label="Amount"
                                  />
                                  <Primary data-testid="action-edit_expense" type="submit">Save</Primary>
                                  <Secondary type="button" onClick={() => setEditingId(null)}>Cancel</Secondary>
                                </EditForm>
                              ) : (
                                <>
                                  <div className="expLeft">
                                    <span className="icon">{exp.splitType === 'equal' ? IconEqualSplit : IconSingleOwed}</span>
                                    <div>
                                      <div className="desc">{exp.description}</div>
                                      <div className="meta">
                                        Paid by {nameOf(exp.paidBy)} ·{' '}
                                        {exp.splitType === 'equal'
                                          ? `split equally with ${exp.participants.map(nameOf).join(', ')}`
                                          : <Pill>owed fully by {nameOf(exp.owedBy)}</Pill>}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="expRight">
                                    <div className="amt">
                                      <div className="val">{fmt(exp.amount)}</div>
                                      <div className="split">
                                        {exp.splitType === 'equal' ? `${fmt(splitShare(exp.amount, exp.participants.length))} each` : `${nameOf(exp.owedBy)} owes all`}
                                      </div>
                                    </div>
                                    <RowActions>
                                      <button type="button" data-testid="action-edit_expense" aria-label="Edit expense" onClick={() => startEdit(exp)}>{IconPencil}</button>
                                      <button type="button" data-testid="action-delete_expense" aria-label="Delete expense" onClick={() => removeExpense(exp.id)}>{IconTrash}</button>
                                    </RowActions>
                                  </div>
                                </>
                              )}
                            </ExpenseRow>
                          ))}
                        </ExpenseList>
                      )}

                      {editingId === null && (
                        <AddExpenseForm onSubmit={submitExpense}>
                          <div className="label">New expense — split type</div>
                          <SplitPicker data-testid="field-split_type">
                            <button type="button" className={splitType === 'equal' ? 'sel' : ''} aria-pressed={splitType === 'equal'} onClick={() => setSplitType('equal')}>Equally</button>
                            <button type="button" className={splitType === 'single' ? 'sel' : ''} aria-pressed={splitType === 'single'} onClick={() => setSplitType('single')}>Owed by one person</button>
                          </SplitPicker>
                          <FieldRow>
                            <input
                              data-testid="field-description"
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              placeholder="Description"
                              aria-label="Description"
                            />
                            <input
                              data-testid="field-amount"
                              type="number"
                              min="0"
                              step="0.01"
                              value={amount}
                              onChange={(e) => setAmount(e.target.value)}
                              placeholder="Amount"
                              aria-label="Amount"
                              className="amountInput"
                            />
                            <select data-testid="field-paid_by" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} aria-label="Paid by">
                              {MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.name} paid</option>)}
                            </select>
                          </FieldRow>
                          {splitType === 'equal' ? (
                            <Chips data-testid="field-participants">
                              {MEMBERS.map((m) => (
                                <button
                                  type="button"
                                  key={m.id}
                                  className={participants.includes(m.id) ? 'on' : ''}
                                  aria-pressed={participants.includes(m.id)}
                                  onClick={() => toggleParticipant(m.id)}
                                >
                                  {m.name}
                                </button>
                              ))}
                            </Chips>
                          ) : (
                            <FieldRow>
                              <select data-testid="field-owed_by" value={owedBy} onChange={(e) => setOwedBy(e.target.value)} aria-label="Owed by">
                                {MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.name} owes all</option>)}
                              </select>
                            </FieldRow>
                          )}
                          <Actions>
                            <Primary data-testid="action-add_expense" type="submit" disabled={!description.trim() || !amount}>Add expense</Primary>
                          </Actions>
                        </AddExpenseForm>
                      )}
                    </Card>

                    <Card>
                      <PanelTitle>
                        <h2>Settle up</h2>
                        <Secondary data-testid="open-settle-btn" onClick={() => setShowSettle((v) => !v)}>Record settlement</Secondary>
                      </PanelTitle>
                      {settlements.length === 0 ? (
                        <Hint>No settlements recorded yet.</Hint>
                      ) : (
                        <SettleList>
                          {settlements.map((s) => (
                            <SettleRow data-testid="item-settlement" key={s.id}>
                              <span className="tick">{IconCheck}</span>
                              <span className="text">{nameOf(s.from)} paid {nameOf(s.to)} <strong>{fmt(s.amount)}</strong></span>
                            </SettleRow>
                          ))}
                        </SettleList>
                      )}
                      {showSettle && (
                        <SettleForm onSubmit={submitSettlement}>
                          <select data-testid="field-from" value={settleFrom} onChange={(e) => setSettleFrom(e.target.value)} aria-label="From">
                            {MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                          <span className="arrow">→</span>
                          <select data-testid="field-to" value={settleTo} onChange={(e) => setSettleTo(e.target.value)} aria-label="To">
                            {MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                          <input
                            data-testid="field-amount"
                            type="number"
                            min="0"
                            step="0.01"
                            value={settleAmount}
                            onChange={(e) => setSettleAmount(e.target.value)}
                            placeholder="Amount"
                            aria-label="Amount"
                          />
                          <Primary data-testid="action-record_settlement" type="submit" disabled={settleFrom === settleTo || !settleAmount}>Record</Primary>
                        </SettleForm>
                      )}
                    </Card>
                  </>
                )}

                {tab === 'dashboard' && (
                  <Card>
                    <PanelTitle><h2>Dashboard</h2></PanelTitle>
                    <Grid3>
                      <Stat><div className="num">{fmt(total)}</div><div className="lbl">Total group spend</div></Stat>
                      <Stat><div className="num">{fmt(paid[topPayer.id] ?? 0)}</div><div className="lbl">{topPayer.name} has paid</div></Stat>
                      <Stat><div className="num">{MEMBERS.length}</div><div className="lbl">Active members</div></Stat>
                    </Grid3>
                    <BalancesSection>
                      <h3>Balances (net)</h3>
                      {MEMBERS.map((m) => {
                        const net = balances[m.id] ?? 0;
                        const pct = Math.min(100, Math.round((Math.abs(net) / maxAbsBalance) * 100));
                        return (
                          <BalRow key={m.id}>
                            <span className="name">{m.name}</span>
                            <BarTrack><BarFill style={{ width: `${pct}%` }} $positive={net >= 0} /></BarTrack>
                            <span className={`val ${net >= 0 ? 'pos' : 'neg'}`}>{net >= 0 ? '+' : '-'}{fmt(net)}</span>
                          </BalRow>
                        );
                      })}
                    </BalancesSection>
                  </Card>
                )}

                {tab === 'members' && (
                  <Card>
                    <PanelTitle><h2>Members</h2></PanelTitle>
                    <MemberList>
                      {MEMBERS.map((m) => (
                        <MemberItem data-testid="item-member" key={m.id}>
                          <span className="av">{m.name[0]}</span>
                          <span className="name">{m.name}</span>
                          <span className="stat">paid {fmt(paid[m.id] ?? 0)} · owes {fmt(owed[m.id] ?? 0)}</span>
                        </MemberItem>
                      ))}
                    </MemberList>
                    <Hint>Invite more people from the top bar.</Hint>
                  </Card>
                )}

                <DisplayNameGate injected={ws.injectedContext} />
              </>
            )}
          </Content>
        </Layout>

        {showInvite && <InviteModal onInvite={ws.invite} onClose={() => setShowInvite(false)} />}
        {showJoin && <JoinModal onJoin={async (code) => { await ws.join(code); setShowJoin(false); }} onClose={() => setShowJoin(false)} />}
        {showSettings && <SettingsPanel ws={ws} onClose={() => setShowSettings(false)} />}
      </Page>
    </DisplayNamesProvider>
  );
}

const Page = styled.div`
  max-width: var(--c-app-max); margin: 0 auto;
  padding: var(--c-space-7) var(--c-space-5) var(--c-space-16);
  width: 100%;
`;
const Layout = styled.div`
  display: flex; gap: var(--c-space-5); position: relative;
  @media ${NARROW} { flex-direction: column; }
`;
const Content = styled.div`flex: 1; min-width: 0; position: relative; display: flex; flex-direction: column; gap: var(--c-space-5);`;
const Row = styled.div`display: flex; gap: var(--c-space-3); justify-content: center; flex-wrap: wrap;`;
const WorkspaceNameField = styled.input`
  width: 100%; margin-bottom: var(--c-space-4);
  padding: var(--c-space-2) var(--c-space-3);
  font-family: inherit; font-size: var(--c-text-base); text-align: center;
  color: ${C.ink}; background: ${C.paper};
  border: 1px solid ${C.line}; border-radius: var(--c-radius-sm); outline: none;
  ${focusRing}
`;

const GroupHeader = styled.div`
  display: flex; align-items: flex-end; justify-content: space-between; gap: var(--c-space-4); flex-wrap: wrap;
  .titleBlock h1 {
    display: flex; align-items: center; gap: var(--c-space-2);
    font-family: var(--c-font-display); letter-spacing: var(--c-display-tracking);
    font-size: var(--c-text-2xl); font-weight: 800; color: ${C.ink};
  }
  .sub { margin-top: var(--c-space-1); font-size: var(--c-text-sm); color: ${C.muted}; }
`;
const RenameBtn = styled.button`
  ${tapTarget}
  display: grid; place-items: center; width: 22px; height: 22px;
  color: ${C.mutedSoft}; background: transparent; border: none; border-radius: var(--c-radius-sm); cursor: pointer;
  svg { width: 14px; height: 14px; }
  &:hover { color: ${C.accentText}; }
  ${focusRing}
`;
const RenameForm = styled.form`
  display: flex; align-items: center; gap: var(--c-space-2); flex-wrap: wrap;
  input {
    font-family: inherit; font-size: var(--c-text-lg); color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: var(--c-radius-sm); padding: var(--c-space-2) var(--c-space-3); outline: none;
    ${focusRing}
  }
`;
const Avatars = styled.div`
  display: flex;
  span {
    width: 30px; height: 30px; border-radius: var(--c-radius-pill);
    display: grid; place-items: center;
    background: ${C.paper2}; border: 2px solid ${C.paper};
    font-size: var(--c-text-xs); font-weight: 700; color: ${C.ink};
    margin-left: -8px;
  }
  span:first-child { margin-left: 0; }
`;

const Tabs = styled.div`display: flex; gap: var(--c-space-2); border-bottom: 1px solid ${C.line};`;
const TabBtn = styled.button<{ $active: boolean }>`
  ${tapTarget}
  padding: var(--c-space-2) var(--c-space-1); margin-bottom: -1px;
  font-size: var(--c-text-sm); font-weight: 600; cursor: pointer;
  background: transparent; border: none; border-bottom: 2px solid transparent;
  color: ${(p) => (p.$active ? C.accentText : C.muted)};
  border-bottom-color: ${(p) => (p.$active ? C.accent : 'transparent')};
  transition: color var(--c-duration-fast) var(--c-ease), border-color var(--c-duration-fast) var(--c-ease);
  ${focusRing}
`;

const PanelTitle = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: var(--c-space-3);
  margin-bottom: var(--c-space-4); flex-wrap: wrap;
  h2 { margin: 0; }
`;

const ExpenseList = styled.div`display: flex; flex-direction: column;`;
const ExpenseRow = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: var(--c-space-3);
  padding: var(--c-space-4) 0; border-bottom: 1px solid ${C.line};
  &:last-child { border-bottom: none; }
  .expLeft { display: flex; align-items: center; gap: var(--c-space-3); min-width: 0; }
  .icon {
    width: 36px; height: 36px; flex-shrink: 0; display: grid; place-items: center;
    background: ${C.paper}; border: 1px solid ${C.line}; border-radius: var(--c-radius-md); color: ${C.accentText};
    svg { width: 17px; height: 17px; }
  }
  .desc { font-size: var(--c-text-base); font-weight: 600; color: ${C.ink}; }
  .meta { font-size: var(--c-text-sm); color: ${C.muted}; margin-top: var(--c-space-1); }
  .expRight { display: flex; align-items: center; gap: var(--c-space-3); flex-shrink: 0; }
  .amt { text-align: right; }
  .amt .val { font-size: var(--c-text-base); font-weight: 700; color: ${C.ink}; }
  .amt .split { font-size: var(--c-text-xs); color: ${C.muted}; margin-top: var(--c-space-1); }
  @media ${NARROW} { flex-wrap: wrap; }
`;
const RowActions = styled.div`
  display: flex; gap: var(--c-space-1);
  button {
    ${tapTarget}
    width: 28px; height: 28px; display: grid; place-items: center;
    color: ${C.mutedSoft}; background: transparent; border: none; border-radius: var(--c-radius-sm); cursor: pointer;
    svg { width: 15px; height: 15px; }
    &:hover { background: ${C.paper}; color: ${C.ink}; }
    ${focusRing}
  }
`;
const Pill = styled.span`
  display: inline-block; padding: 1px var(--c-space-2); border-radius: var(--c-radius-pill);
  font-size: var(--c-text-xs); background: ${C.paper}; border: 1px solid ${C.line}; color: ${C.muted};
`;

const EditForm = styled.form`
  display: flex; gap: var(--c-space-2); align-items: center; flex-wrap: wrap; width: 100%;
  input {
    flex: 1; min-width: 120px; padding: var(--c-space-2) var(--c-space-3);
    font-family: inherit; font-size: var(--c-text-base); color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: var(--c-radius-sm); outline: none;
    ${focusRing}
  }
`;

const AddExpenseForm = styled.form`
  margin-top: var(--c-space-5); padding-top: var(--c-space-4); border-top: 1px solid ${C.line};
  .label { font-size: var(--c-text-sm); color: ${C.muted}; margin-bottom: var(--c-space-2); }
`;
const SplitPicker = styled.div`
  display: flex; gap: var(--c-space-2); margin-bottom: var(--c-space-3);
  button {
    ${tapTarget}
    flex: 1; padding: var(--c-space-2) var(--c-space-3); text-align: center;
    font-size: var(--c-text-sm); font-family: inherit; cursor: pointer;
    color: ${C.muted}; background: ${C.paper}; border: 1px solid ${C.line}; border-radius: var(--c-radius-sm);
    &.sel { border-color: ${C.accent}; color: ${C.accentText}; background: color-mix(in srgb, var(--c-accent) 10%, transparent); }
    ${focusRing}
  }
  @media ${NARROW} { flex-direction: column; }
`;
const FieldRow = styled.div`
  display: flex; gap: var(--c-space-2); flex-wrap: wrap; margin-bottom: var(--c-space-3);
  input, select {
    flex: 1; min-width: 140px; padding: var(--c-space-2) var(--c-space-3);
    font-family: inherit; font-size: var(--c-text-base); color: ${C.ink}; background: ${C.paper2};
    border: 1px solid ${C.line}; border-radius: var(--c-radius-sm); outline: none;
    ${focusRing}
  }
  .amountInput { max-width: 140px; }
  @media ${NARROW} { flex-direction: column; input, select { max-width: none; } }
`;
const Chips = styled.div`
  display: flex; gap: var(--c-space-2); flex-wrap: wrap; margin-bottom: var(--c-space-3);
  button {
    ${tapTarget}
    padding: var(--c-space-1) var(--c-space-3); border-radius: var(--c-radius-pill);
    font-size: var(--c-text-xs); font-family: inherit; cursor: pointer;
    color: ${C.muted}; background: ${C.paper}; border: 1px solid ${C.line};
    &.on { border-color: ${C.accent}; color: ${C.accentText}; background: color-mix(in srgb, var(--c-accent) 10%, transparent); }
    ${focusRing}
  }
`;

const SettleList = styled.div`display: flex; flex-direction: column;`;
const SettleRow = styled.div`
  display: flex; align-items: center; gap: var(--c-space-3);
  padding: var(--c-space-3) 0; border-bottom: 1px solid ${C.line}; font-size: var(--c-text-base); color: ${C.ink};
  &:last-child { border-bottom: none; }
  .tick {
    width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%; background: ${C.green};
    display: grid; place-items: center; color: ${C.greenInk};
    svg { width: 10px; height: 10px; }
  }
`;
const SettleForm = styled.form`
  display: flex; align-items: center; gap: var(--c-space-2); flex-wrap: wrap;
  margin-top: var(--c-space-4); padding-top: var(--c-space-4); border-top: 1px solid ${C.line};
  .arrow { color: ${C.mutedSoft}; }
  select, input {
    padding: var(--c-space-2) var(--c-space-3); font-family: inherit; font-size: var(--c-text-base);
    color: ${C.ink}; background: ${C.paper2}; border: 1px solid ${C.line}; border-radius: var(--c-radius-sm); outline: none;
    ${focusRing}
  }
  input { max-width: 140px; }
  @media ${NARROW} { flex-direction: column; align-items: stretch; input { max-width: none; } }
`;

const Grid3 = styled.div`
  display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--c-space-4);
  @media ${WIDE} { grid-template-columns: 1fr; }
`;
const Stat = styled.div`
  background: ${C.paper}; border: 1px solid ${C.line}; border-radius: var(--c-radius-md); padding: var(--c-space-4);
  .num { font-family: var(--c-font-display); font-size: var(--c-text-xl); font-weight: 700; color: ${C.ink}; }
  .lbl { font-size: var(--c-text-xs); color: ${C.muted}; margin-top: var(--c-space-1); }
`;
const BalancesSection = styled.div`
  margin-top: var(--c-space-8);
  h3 {
    font-size: var(--c-text-sm); font-weight: 600; color: ${C.muted}; margin-bottom: var(--c-space-4);
    text-transform: uppercase; letter-spacing: 0.06em;
  }
`;
const BalRow = styled.div`
  display: flex; align-items: center; gap: var(--c-space-3); padding: var(--c-space-2) 0; border-bottom: 1px solid ${C.line};
  &:last-child { border-bottom: none; }
  .name { width: 90px; flex-shrink: 0; font-size: var(--c-text-sm); font-weight: 600; color: ${C.ink}; }
  .val { width: 80px; flex-shrink: 0; text-align: right; font-size: var(--c-text-sm); font-weight: 600; }
  .val.pos { color: ${C.green}; }
  .val.neg { color: ${C.danger}; }
`;
const BarTrack = styled.div`
  flex: 1; height: 8px; border-radius: var(--c-radius-pill); background: ${C.paper}; border: 1px solid ${C.line}; overflow: hidden;
`;
const BarFill = styled.div<{ $positive: boolean }>`
  height: 100%; border-radius: var(--c-radius-pill);
  background: ${(p) => (p.$positive ? C.green : C.danger)};
  transition: width var(--c-duration-base) var(--c-ease);
`;

const MemberList = styled.div`display: flex; flex-direction: column;`;
const MemberItem = styled.div`
  display: flex; align-items: center; gap: var(--c-space-3);
  padding: var(--c-space-3) 0; border-bottom: 1px solid ${C.line};
  &:last-child { border-bottom: none; }
  .av {
    width: 30px; height: 30px; flex-shrink: 0; border-radius: var(--c-radius-pill);
    display: grid; place-items: center; background: ${C.paper}; border: 1px solid ${C.line};
    font-size: var(--c-text-xs); font-weight: 700; color: ${C.ink};
  }
  .name { flex: 1; font-size: var(--c-text-base); font-weight: 600; color: ${C.ink}; }
  .stat { font-size: var(--c-text-xs); color: ${C.muted}; }
  @media ${NARROW} { flex-wrap: wrap; .stat { width: 100%; } }
`;
const Actions = styled.div`display: flex; justify-content: flex-end;`;
