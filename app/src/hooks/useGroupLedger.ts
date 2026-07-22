/**
 * useGroupLedger — data binding for the active expense group (multi-topology
 * unit). Mirrors the canonical useItems pattern: a memoized generated client
 * (`GroupClient`) wraps `mero.rpc.execute`, `useSubscription([contextId])`
 * re-fetches on every sync event so peers' expenses/settlements/balances
 * appear live, and every mutation re-fetches afterwards.
 *
 * `contextId`/`executorPublicKey` come from `useWorkspace()` and already
 * point at the ACTIVE unit (group) — this hook never resolves identity
 * itself.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { GroupClient, type BalanceEntry, type ExpenseView, type SettlementView } from '../api/group/GroupClient';

export interface UseGroupLedgerArgs {
  contextId: string | null;
  executorPublicKey: string | null;
}

export interface UseGroupLedgerReturn {
  expenses: ExpenseView[];
  settlements: SettlementView[];
  balances: BalanceEntry[];
  loading: boolean;
  error: Error | null;
  ready: boolean;
  addExpense: (description: string, amount: number, paidBy: string, splitBetween: string[]) => Promise<void>;
  editExpense: (id: string, description: string, amount: number) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  recordSettlement: (from: string, to: string, amount: number) => Promise<void>;
  renameGroup: (newName: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useGroupLedger({ contextId, executorPublicKey }: UseGroupLedgerArgs): UseGroupLedgerReturn {
  const { mero } = useMero();
  const [expenses, setExpenses] = useState<ExpenseView[]>([]);
  const [settlements, setSettlements] = useState<SettlementView[]>([]);
  const [balances, setBalances] = useState<BalanceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Memoized typed client — null until the active unit's context + identity resolve.
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
      const [nextExpenses, nextSettlements, nextBalances] = await Promise.all([
        client.listExpenses(),
        client.listSettlements(),
        client.getBalances(),
      ]);
      setExpenses(nextExpenses);
      setSettlements(nextSettlements);
      setBalances(nextBalances);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates: re-fetch on any sync event for the active group's context
  // (local writes or a peer's, e.g. someone else adding an expense).
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const addExpense = useCallback(async (description: string, amount: number, paidBy: string, splitBetween: string[]) => {
    if (!client) return;
    await client.addExpense({ description, amount, paid_by: paidBy, split_between: splitBetween });
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
    expenses,
    settlements,
    balances,
    loading,
    error,
    ready: client !== null,
    addExpense,
    editExpense,
    deleteExpense,
    recordSettlement,
    renameGroup,
    refresh,
  };
}
