import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useGroupData } from '../../hooks/useGroupData';
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
import type { MemberView } from '../../api/group/GroupClient';

/**
 * DESIGN DIRECTION: Split Circle reads like a shared ledger, not a generic
 * list. Every expense is a receipt-line with a paid-by tag and a split pill;
 * the signature element is the Dashboard's balance bar — one horizontal bar
 * per member that fills toward the brand green when they're owed money and
 * toward the danger tone when they owe it, so the whole group's financial
 * state reads in one glance without parsing a single number.
 *
 * Wired to GroupClient via useGroupData: members/expenses/settlements are
 * this group's authored records, balances/summary are the backend's own
 * computed views (get_balances / get_summary) — the split math is never
 * recomputed client-side, only formatted.
 */

type SplitType = 'equal' | 'single';

const fmt = (minor: number): string => `₹${Math.round(Math.abs(minor) / 100).toLocaleString()}`;

function nameOf(members: MemberView[], id: string): string {
  return members.find((m) => m.id === id)?.display_name ?? 'Unknown';
}

function splitShare(amount: number, count: number): number {
  return count > 0 ? Math.round(amount / count) : 0;
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
  const data = useGroupData({ contextId: ws.contextId, executorPublicKey: ws.executorPublicKey });

  const [wsName, setWsName] = useState('My group');
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<Tab>('expenses');

  // Group-scoped join: the caller's own MemberProfile in THIS group is created
  // by set_display_name, distinct from the namespace's generic display name.
  const [joinName, setJoinName] = useState('');
  const [joining, setJoining] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [participants, setParticipants] = useState<string[]>([]);
  const [owedBy, setOwedBy] = useState('');
  const participantsSeeded = useRef(false);

  const [showSettle, setShowSettle] = useState(false);
  const [settleFrom, setSettleFrom] = useState('');
  const [settleTo, setSettleTo] = useState('');
  const [settleAmount, setSettleAmount] = useState('');

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  // GroupInfo.name isn't exposed by any view method — rename_group only
  // mutates backend state — so the header shows this local override (seeded
  // from the context label) immediately after a successful rename.
  const [nameOverride, setNameOverride] = useState<string | null>(null);

  const { members, expenses, settlements, summary, balances, selfMember } = data;

  // Reset per-group UI state whenever the active group changes, so a stale
  // draft/edit from the previous group never bleeds into the new one.
  useEffect(() => {
    setTab('expenses');
    setEditingId(null);
    setShowSettle(false);
    setRenaming(false);
    setNameOverride(null);
    participantsSeeded.current = false;
  }, [ws.activeUnitId]);

  // Seed the form's member-scoped defaults once real members are known. Never
  // gate a controlled select's value on a `|| fallback` expression — set real
  // state here so every change still fires onChange.
  useEffect(() => {
    if (members.length === 0) return;
    const ids = members.map((m) => m.id);
    const self = selfMember?.id ?? ids[0];
    const other = ids.find((id) => id !== self) ?? self;
    if (!paidBy || !ids.includes(paidBy)) setPaidBy(self);
    if (!owedBy || !ids.includes(owedBy)) setOwedBy(other);
    if (!settleFrom || !ids.includes(settleFrom)) setSettleFrom(self);
    if (!settleTo || !ids.includes(settleTo)) setSettleTo(other);
    if (!participantsSeeded.current) {
      participantsSeeded.current = true;
      setParticipants(ids);
    } else {
      setParticipants((prev) => prev.filter((id) => ids.includes(id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, selfMember]);

  const groupName = nameOverride ?? ws.units.find((u) => u.contextId === ws.activeUnitId)?.name ?? 'Group';
  // Heuristic: the earliest joiner is very likely the group's creator (there's
  // no get_group_info view method to read GroupInfo's governance directly).
  const creator = useMemo(
    () => (members.length > 0 ? members.reduce((a, b) => (a.joined_at <= b.joined_at ? a : b)) : null),
    [members],
  );

  const paidMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const row of summary?.members ?? []) m[row.member_id] = row.total_paid;
    return m;
  }, [summary]);
  const owedMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const row of summary?.members ?? []) m[row.member_id] = row.total_owed;
    return m;
  }, [summary]);
  const balanceMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of balances) m[b.member_id] = b.net;
    return m;
  }, [balances]);
  const total = summary?.total_spent ?? 0;
  const maxAbsBalance = Math.max(1, ...balances.map((b) => Math.abs(b.net)));
  const topPayer = useMemo(
    () => (summary?.members ?? []).reduce<{ member_id: string; total_paid: number } | null>(
      (best, m) => (!best || m.total_paid > best.total_paid ? m : best),
      null,
    ),
    [summary],
  );

  const toggleParticipant = (id: string) => {
    setParticipants((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const submitJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = joinName.trim();
    if (!trimmed || joining) return;
    setJoining(true);
    try {
      await data.setDisplayName(trimmed);
      setJoinName('');
      notify('Welcome to the group');
    } catch (err) {
      notify(describeError(err), 'error');
    } finally {
      setJoining(false);
    }
  };

  const submitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const minor = Math.round(Number(amount) * 100);
    if (!description.trim() || !minor || minor <= 0 || !paidBy) return;
    if (splitType === 'equal' && participants.length === 0) return;
    if (splitType === 'single' && !owedBy) return;
    try {
      await data.addExpense({
        description: description.trim(),
        amount: minor,
        paid_by: paidBy,
        split_type: splitType,
        participants: splitType === 'equal' ? participants : [],
        owed_by: splitType === 'single' ? owedBy : '',
      });
      setDescription('');
      setAmount('');
      notify('Expense added');
    } catch (err) {
      notify(describeError(err), 'error');
    }
  };

  const startEdit = (row: { id: string; description: string; amount: number }) => {
    setEditingId(row.id);
    setEditDescription(row.description);
    setEditAmount(String(row.amount / 100));
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const minor = Math.round(Number(editAmount) * 100);
    if (!editDescription.trim() || !minor || minor <= 0 || !editingId) return;
    try {
      await data.editExpense(editingId, editDescription.trim(), minor);
      setEditingId(null);
      notify('Expense updated');
    } catch (err) {
      notify(describeError(err), 'error');
    }
  };

  const removeExpense = async (id: string) => {
    try {
      await data.deleteExpense(id);
      if (editingId === id) setEditingId(null);
      notify('Expense removed');
    } catch (err) {
      notify(describeError(err), 'error');
    }
  };

  const submitSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    const minor = Math.round(Number(settleAmount) * 100);
    if (!minor || minor <= 0 || settleFrom === settleTo) return;
    try {
      await data.recordSettlement(settleFrom, settleTo, minor);
      setSettleAmount('');
      setShowSettle(false);
      notify('Settlement recorded');
    } catch (err) {
      notify(describeError(err), 'error');
    }
  };

  const submitRename = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      await data.renameGroup(trimmed);
      setNameOverride(trimmed);
      setRenaming(false);
      setNewName('');
      notify('Group renamed');
    } catch (err) {
      notify(describeError(err), 'error');
    }
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
            ) : !data.ready || (data.loading && members.length === 0) ? (
              <Hint>Loading group…</Hint>
            ) : !selfMember ? (
              <Card data-testid="group-join-gate">
                <h2>Join {groupName}</h2>
                <p>Pick the name the rest of this group will see you as.</p>
                <JoinForm onSubmit={(e) => { void submitJoin(e); }}>
                  <input
                    data-testid="field-display_name"
                    value={joinName}
                    onChange={(e) => setJoinName(e.target.value)}
                    placeholder="Your name"
                    maxLength={64}
                    autoFocus
                    aria-label="Your name"
                  />
                  <Primary data-testid="action-set_display_name" type="submit" disabled={!joinName.trim() || joining}>
                    {joining ? 'Joining…' : 'Join group'}
                  </Primary>
                </JoinForm>
              </Card>
            ) : (
              <>
                <GroupHeader>
                  <div className="titleBlock">
                    {renaming ? (
                      <RenameForm onSubmit={(e) => { void submitRename(e); }}>
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
                    <p className="sub">
                      {members.length} member{members.length === 1 ? '' : 's'} · shared expenses
                      {creator ? ` · started by ${creator.display_name}` : ''}
                    </p>
                  </div>
                  <Avatars>
                    {members.map((m) => <span key={m.id} title={m.display_name}>{m.display_name[0]?.toUpperCase() ?? '?'}</span>)}
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
                            <ExpenseRow data-testid={`item-expense-${exp.id}`} key={exp.id}>
                              {editingId === exp.id ? (
                                <EditForm onSubmit={(e) => { void saveEdit(e); }}>
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
                                    <span className="icon">{exp.split_type === 'equal' ? IconEqualSplit : IconSingleOwed}</span>
                                    <div>
                                      <div className="desc">{exp.description}</div>
                                      <div className="meta">
                                        Paid by {nameOf(members, exp.paid_by)} ·{' '}
                                        {exp.split_type === 'equal'
                                          ? `split equally with ${exp.participants.map((p) => nameOf(members, p)).join(', ')}`
                                          : <Pill>owed fully by {nameOf(members, exp.owed_by)}</Pill>}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="expRight">
                                    <div className="amt">
                                      <div className="val">{fmt(exp.amount)}</div>
                                      <div className="split">
                                        {exp.split_type === 'equal' ? `${fmt(splitShare(exp.amount, exp.participants.length))} each` : `${nameOf(members, exp.owed_by)} owes all`}
                                      </div>
                                    </div>
                                    <RowActions>
                                      <button type="button" data-testid="action-edit_expense" aria-label="Edit expense" onClick={() => startEdit(exp)}>{IconPencil}</button>
                                      <button type="button" data-testid="action-delete_expense" aria-label="Delete expense" onClick={() => { void removeExpense(exp.id); }}>{IconTrash}</button>
                                    </RowActions>
                                  </div>
                                </>
                              )}
                            </ExpenseRow>
                          ))}
                        </ExpenseList>
                      )}

                      {editingId === null && (
                        <AddExpenseForm onSubmit={(e) => { void submitExpense(e); }}>
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
                              {members.map((m) => <option key={m.id} value={m.id}>{m.display_name} paid</option>)}
                            </select>
                          </FieldRow>
                          {splitType === 'equal' ? (
                            <Chips data-testid="field-participants">
                              {members.map((m) => (
                                <button
                                  type="button"
                                  key={m.id}
                                  className={participants.includes(m.id) ? 'on' : ''}
                                  aria-pressed={participants.includes(m.id)}
                                  onClick={() => toggleParticipant(m.id)}
                                >
                                  {m.display_name}
                                </button>
                              ))}
                            </Chips>
                          ) : (
                            <FieldRow>
                              <select data-testid="field-owed_by" value={owedBy} onChange={(e) => setOwedBy(e.target.value)} aria-label="Owed by">
                                {members.map((m) => <option key={m.id} value={m.id}>{m.display_name} owes all</option>)}
                              </select>
                            </FieldRow>
                          )}
                          <Actions>
                            <Primary data-testid="action-add_expense" type="submit" disabled={!description.trim() || !amount || !paidBy}>Add expense</Primary>
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
                            <SettleRow data-testid={`item-settlement-${s.id}`} key={s.id}>
                              <span className="tick">{IconCheck}</span>
                              <span className="text">{nameOf(members, s.from)} paid {nameOf(members, s.to)} <strong>{fmt(s.amount)}</strong></span>
                            </SettleRow>
                          ))}
                        </SettleList>
                      )}
                      {showSettle && (
                        <SettleForm onSubmit={(e) => { void submitSettlement(e); }}>
                          <select data-testid="field-from" value={settleFrom} onChange={(e) => setSettleFrom(e.target.value)} aria-label="From">
                            {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                          </select>
                          <span className="arrow">→</span>
                          <select data-testid="field-to" value={settleTo} onChange={(e) => setSettleTo(e.target.value)} aria-label="To">
                            {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
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
                      <Stat>
                        <div className="num">{fmt(topPayer ? paidMap[topPayer.member_id] ?? 0 : 0)}</div>
                        <div className="lbl">{topPayer ? `${nameOf(members, topPayer.member_id)} has paid` : 'No spend yet'}</div>
                      </Stat>
                      <Stat><div className="num">{members.length}</div><div className="lbl">Active members</div></Stat>
                    </Grid3>
                    <BalancesSection>
                      <h3>Balances (net)</h3>
                      {members.map((m) => {
                        const net = balanceMap[m.id] ?? 0;
                        const pct = Math.min(100, Math.round((Math.abs(net) / maxAbsBalance) * 100));
                        return (
                          <BalRow key={m.id}>
                            <span className="name">{m.display_name}</span>
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
                      {members.map((m) => (
                        <MemberItem data-testid={`item-member-${m.id}`} key={m.id}>
                          <span className="av">{m.display_name[0]?.toUpperCase() ?? '?'}</span>
                          <span className="name">{m.display_name}</span>
                          <span className="stat">paid {fmt(paidMap[m.id] ?? 0)} · owes {fmt(owedMap[m.id] ?? 0)}</span>
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
const JoinForm = styled.form`
  display: flex; gap: var(--c-space-3); flex-wrap: wrap; margin-top: var(--c-space-4);
  input {
    flex: 1; min-width: 160px; padding: var(--c-space-2) var(--c-space-3);
    font-family: inherit; font-size: var(--c-text-base); color: ${C.ink}; background: ${C.paper};
    border: 1px solid ${C.line}; border-radius: var(--c-radius-sm); outline: none;
    ${focusRing}
  }
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
