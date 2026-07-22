import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { C } from '../../theme';
import { APP_DISPLAY_NAME } from '../../config';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useGroupLedger } from '../../hooks/useGroupLedger';
import { describeError } from '../../utils/errors';
import InviteModal from '../../components/InviteModal';
import JoinModal from '../../components/JoinModal';
import { DisplayNamesProvider, MemberLabel } from '../../components/MemberLabel';
import { DisplayNameGate } from '../../components/DisplayNameGate';
import WorkspaceChrome from '../../components/WorkspaceChrome';
import SettingsPanel from '../../components/SettingsPanel';
import UnitRail from '../../components/UnitRail';
import type { ExpenseView, SettlementView } from '../../api/group/GroupClient';

/**
 * Multi-topology app view: chrome + a group rail + the active group's balance
 * sheet. Each group is an independent context (instance) of the `group`
 * service, bound live via `useGroupLedger` (GroupClient + useSubscription).
 * Keep the workspace gating, the UnitRail, and the WorkspaceChrome wiring —
 * these make the app multi-user + multi-group out of the box.
 */

type HistoryEntry =
  | { kind: 'expense'; at: number; data: ExpenseView }
  | { kind: 'settlement'; at: number; data: SettlementView };

function fmtMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export default function AppPage() {
  const ws = useWorkspace();
  const ledger = useGroupLedger({ contextId: ws.contextId, executorPublicKey: ws.executorPublicKey });

  const [wsName, setWsName] = useState('My splits');
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // The active unit's rail name (set at createContext time) is the only
  // display name available client-side — the spec exposes no get-metadata
  // method. `rename_group` mutates the backend's GroupMetadata; since it
  // can't be read back, track the new name locally once the mutation
  // succeeds so the header reflects it immediately for this session.
  const activeUnit = ws.units.find((u) => u.contextId === ws.activeUnitId);
  const [groupNameOverride, setGroupNameOverride] = useState<string | null>(null);
  useEffect(() => { setGroupNameOverride(null); }, [ws.activeUnitId]);
  const groupName = groupNameOverride ?? activeUnit?.name ?? 'Untitled group';

  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState(groupName);
  const [renameError, setRenameError] = useState<Error | null>(null);

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

  const balances = useMemo(
    () => [...ledger.balances].sort((a, b) => b.balance - a.balance),
    [ledger.balances],
  );
  const history = useMemo<HistoryEntry[]>(() => {
    const entries: HistoryEntry[] = [
      ...ledger.expenses.map((e): HistoryEntry => ({ kind: 'expense', at: e.created_at, data: e })),
      ...ledger.settlements.map((s): HistoryEntry => ({ kind: 'settlement', at: s.created_at, data: s })),
    ];
    return entries.sort((a, b) => b.at - a.at);
  }, [ledger.expenses, ledger.settlements]);

  const submitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const desc = description.trim();
    const dollars = Number(amount);
    const who = paidBy.trim();
    const split = splitBetween.split(',').map((s) => s.trim()).filter(Boolean);
    if (!desc || !Number.isFinite(dollars) || dollars <= 0 || !who || split.length === 0) return;
    void ledger.addExpense(desc, Math.round(dollars * 100), who, split).catch(() => {});
    setDescription('');
    setAmount('');
    setPaidBy('');
    setSplitBetween('');
  };

  const startEditExpense = (exp: ExpenseView) => {
    setEditingExpenseId(exp.id);
    setEditDescription(exp.description);
    setEditAmount((exp.amount / 100).toString());
  };

  const saveEditExpense = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    const desc = editDescription.trim();
    const dollars = Number(editAmount);
    if (!desc || !Number.isFinite(dollars) || dollars <= 0) return;
    void ledger.editExpense(id, desc, Math.round(dollars * 100)).catch(() => {});
    setEditingExpenseId(null);
  };

  const deleteExpense = (id: string) => { void ledger.deleteExpense(id).catch(() => {}); };

  const submitSettlement = (e: React.FormEvent) => {
    e.preventDefault();
    const fromName = from.trim();
    const toName = to.trim();
    const dollars = Number(settleAmount);
    if (!fromName || !toName || fromName === toName || !Number.isFinite(dollars) || dollars <= 0) return;
    void ledger.recordSettlement(fromName, toName, Math.round(dollars * 100)).catch(() => {});
    setFrom('');
    setTo('');
    setSettleAmount('');
  };

  const saveGroupName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = groupNameDraft.trim();
    if (!trimmed) return;
    setRenameError(null);
    try {
      await ledger.renameGroup(trimmed);
      setGroupNameOverride(trimmed);
      setEditingGroupName(false);
    } catch (err) {
      setRenameError(err instanceof Error ? err : new Error(String(err)));
    }
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
                      <Secondary type="button" onClick={() => { setEditingGroupName(false); setGroupNameDraft(groupName); setRenameError(null); }}>Cancel</Secondary>
                    </RenameForm>
                  ) : (
                    <h1 onClick={() => { setGroupNameDraft(groupName); setEditingGroupName(true); }} title="Click to rename">
                      {groupName}
                    </h1>
                  )}
                  {renameError && <ErrLine>{describeError(renameError)}</ErrLine>}
                </GroupHeader>

                <SectionTitle>Balances</SectionTitle>
                <Balances>
                  {balances.length === 0 && <Hint>No expenses yet — balances will show up here once someone adds one.</Hint>}
                  {balances.map((b) => (
                    <BalanceRow key={b.member} data-testid={`item-balance-${b.member}`} $positive={b.balance > 0} $zero={b.balance === 0}>
                      <span className="who">{b.member}</span>
                      <span className="amt">
                        {b.balance === 0 ? 'settled up' : b.balance > 0 ? `is owed ${fmtMoney(b.balance)}` : `owes ${fmtMoney(-b.balance)}`}
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
                {ledger.error && <ErrLine>{describeError(ledger.error)}</ErrLine>}
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
                        <ItemRow key={h.data.id} data-testid={`item-expense-${h.data.id}`}>
                          <div className="text">
                            <strong>{h.data.description}</strong>
                            <span>
                              {h.data.paid_by} paid {fmtMoney(h.data.amount)} · split between {h.data.split_between.join(', ')}
                              {' · added by '}<MemberLabel memberId={h.data.author} />
                            </span>
                          </div>
                          <RowActions>
                            <button onClick={() => startEditExpense(h.data)} aria-label="Edit">✎</button>
                            <button data-testid="action-delete_expense" onClick={() => deleteExpense(h.data.id)} aria-label="Delete">×</button>
                          </RowActions>
                        </ItemRow>
                      )
                    ) : (
                      <ItemRow key={h.data.id} data-testid={`item-settlement-${h.data.id}`}>
                        <div className="text">
                          <strong>Settlement</strong>
                          <span>
                            {h.data.from} paid {h.data.to} {fmtMoney(h.data.amount)}
                            {' · recorded by '}<MemberLabel memberId={h.data.author} />
                          </span>
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
