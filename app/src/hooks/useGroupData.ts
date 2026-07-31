/**
 * useGroupData — domain data hook for one Split Circle group context.
 *
 * Wraps the generated `GroupClient` (list_members / list_expenses /
 * list_settlements / get_balances / get_summary + the mutating calls) with
 * the same client-memo + useSubscription + refresh() pattern the neutral
 * scaffold's useItems used, reshaped to this app's multi-entity group
 * service: members, expenses, settlements and the two computed views
 * (balances, summary).
 *
 * `contextId`/`executorPublicKey` come from useWorkspace and point at the
 * ACTIVE unit (group) — a fresh client per active group.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import {
  GroupClient,
  type Balance,
  type ExpenseView,
  type MemberView,
  type Settlement,
  type Summary,
} from '../api/group/GroupClient';

export interface UseGroupDataArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

export interface AddExpenseParams {
  description: string;
  amount: number;
  paid_by: string;
  split_type: 'equal' | 'single';
  participants: string[];
  owed_by: string;
}

export interface UseGroupDataReturn {
  members: MemberView[];
  expenses: ExpenseView[];
  settlements: Settlement[];
  balances: Balance[];
  summary: Summary | null;
  /** The caller's own MemberProfile in THIS group, once set_display_name has
   *  been called here (a group-scoped profile, distinct from the namespace's
   *  generic display name). Null until the member joins the group. */
  selfMember: MemberView | null;
  loading: boolean;
  error: Error | null;
  /** True once the client can be built (context + identity resolved). Does
   *  NOT mean data has loaded yet — check `loading` / `members.length` too. */
  ready: boolean;
  setDisplayName: (name: string) => Promise<void>;
  addExpense: (params: AddExpenseParams) => Promise<void>;
  editExpense: (id: string, description: string, amount: number) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  recordSettlement: (from: string, to: string, amount: number) => Promise<void>;
  renameGroup: (newName: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useGroupData({ contextId, executorPublicKey }: UseGroupDataArgs): UseGroupDataReturn {
  const { mero } = useMero();
  const [members, setMembers] = useState<MemberView[]>([]);
  const [expenses, setExpenses] = useState<ExpenseView[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Memoized typed client — null until the active group's context + identity resolve.
  const client = useMemo(
    () =>
      mero && contextId && executorPublicKey
        ? new GroupClient(mero, contextId, executorPublicKey)
        : null,
    [mero, contextId, executorPublicKey],
  );

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [m, e, s, b, sum] = await Promise.all([
        client.listMembers(),
        client.listExpenses(),
        client.listSettlements(),
        client.getBalances(),
        client.getSummary(),
      ]);
      setMembers(m);
      setExpenses(e);
      setSettlements(s);
      setBalances(b);
      setSummary(sum);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  // Reset to empty the moment the active group changes, so a stale group's
  // rows never flash under the newly-selected one while the first fetch runs.
  useEffect(() => {
    setMembers([]);
    setExpenses([]);
    setSettlements([]);
    setBalances([]);
    setSummary(null);
  }, [contextId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates: every mutation here (new expense, edit, settlement, join,
  // rename) is list-changing rather than turn-critical, so a short debounce
  // collapses a burst of peer events into a single refetch.
  const debounceRef = useRef<number | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => { void refresh(); }, 300);
  }, [refresh]);
  useEffect(() => () => { if (debounceRef.current !== null) window.clearTimeout(debounceRef.current); }, []);

  useSubscription(contextId ? [contextId] : [], scheduleRefresh);

  // Safety-net poll alongside the subscription, in case a sync event is missed.
  useEffect(() => {
    if (!client) return;
    const t = window.setInterval(() => { void refresh(); }, 5000);
    return () => window.clearInterval(t);
  }, [client, refresh]);

  const selfMember = useMemo(
    () => (executorPublicKey ? members.find((m) => m.author === executorPublicKey) ?? null : null),
    [members, executorPublicKey],
  );

  const setDisplayName = useCallback(async (name: string) => {
    if (!client) return;
    await client.setDisplayName({ display_name: name });
    await refresh();
  }, [client, refresh]);

  const addExpense = useCallback(async (params: AddExpenseParams) => {
    if (!client) return;
    await client.addExpense(params);
    await refresh();
  }, [client, refresh]);

  const editExpense = useCallback(async (id: string, description: string, amount: number) => {
    if (!client) return;
    await client.editExpense({ id, description, amount });
    await refresh();
  }, [client, refresh]);

  const deleteExpense = useCallback(async (id: string) => {
    if (!client) return;
    await client.deleteExpense({ id });
    await refresh();
  }, [client, refresh]);

  const recordSettlement = useCallback(async (from: string, to: string, amount: number) => {
    if (!client) return;
    await client.recordSettlement({ from, to, amount });
    await refresh();
  }, [client, refresh]);

  const renameGroup = useCallback(async (newName: string) => {
    if (!client) return;
    await client.renameGroup({ new_name: newName });
    await refresh();
  }, [client, refresh]);

  return {
    members,
    expenses,
    settlements,
    balances,
    summary,
    selfMember,
    loading,
    error,
    ready: client !== null,
    setDisplayName,
    addExpense,
    editExpense,
    deleteExpense,
    recordSettlement,
    renameGroup,
    refresh,
  };
}
