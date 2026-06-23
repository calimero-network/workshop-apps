/**
 * useExpenses — per-workspace expenses state.
 *
 * Wraps ExpensesClient and subscribes to the shared "expenses" context so
 * every mutation is reflected in real time across all connected peers.
 */

import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { ExpensesClient, Expense, Category } from '../api/expenses/ExpensesClient';

export interface UseExpensesReturn {
  myExpenses: Expense[];
  pendingExpenses: Expense[];
  allExpenses: Expense[];
  categories: Category[];
  loading: boolean;
  error: Error | null;

  refresh: () => Promise<void>;

  submitExpense: (params: {
    description: string;
    amount: number;
    currency: string;
    category: string;
  }) => Promise<void>;

  editExpense: (params: {
    expense_id: string;
    description: string;
    amount: number;
    currency: string;
    category: string;
  }) => Promise<void>;

  approveExpense: (expense_id: string, note: string) => Promise<void>;
  rejectExpense: (expense_id: string, note: string) => Promise<void>;
  markReimbursed: (expense_id: string) => Promise<void>;
  addCategory: (name: string) => Promise<void>;
}

export function useExpenses(
  contextId: string | null,
  executorPublicKey: string | null,
): UseExpensesReturn {
  const { mero } = useMero();

  const [myExpenses, setMyExpenses] = useState<Expense[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const getClient = useCallback((): ExpensesClient | null => {
    if (!mero || !contextId || !executorPublicKey) return null;
    return new ExpensesClient(mero, contextId, executorPublicKey);
  }, [mero, contextId, executorPublicKey]);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [my, pending, all, cats] = await Promise.all([
        client.listMyExpenses(),
        client.listPendingExpenses(),
        client.listAllExpenses(),
        client.listCategories(),
      ]);
      setMyExpenses(my.slice().sort((a, b) => b.submitted_at - a.submitted_at));
      setPendingExpenses(pending.slice().sort((a, b) => b.submitted_at - a.submitted_at));
      setAllExpenses(all.slice().sort((a, b) => b.submitted_at - a.submitted_at));
      setCategories(cats);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  // Initial load whenever context / identity become ready.
  useEffect(() => {
    if (contextId && executorPublicKey) void refresh();
  }, [contextId, executorPublicKey, refresh]);

  // Live updates: every state-change event on this context triggers a refresh.
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  // ── Mutations ────────────────────────────────────────────────────────────

  const submitExpense = useCallback(async (params: {
    description: string;
    amount: number;
    currency: string;
    category: string;
  }) => {
    const client = getClient();
    if (!client) throw new Error('Expenses client not ready');
    await client.submitExpense(params);
    await refresh();
  }, [getClient, refresh]);

  const editExpense = useCallback(async (params: {
    expense_id: string;
    description: string;
    amount: number;
    currency: string;
    category: string;
  }) => {
    const client = getClient();
    if (!client) throw new Error('Expenses client not ready');
    await client.editExpense(params);
    await refresh();
  }, [getClient, refresh]);

  const approveExpense = useCallback(async (expense_id: string, note: string) => {
    const client = getClient();
    if (!client) throw new Error('Expenses client not ready');
    await client.approveExpense({ expense_id, note });
    await refresh();
  }, [getClient, refresh]);

  const rejectExpense = useCallback(async (expense_id: string, note: string) => {
    const client = getClient();
    if (!client) throw new Error('Expenses client not ready');
    await client.rejectExpense({ expense_id, note });
    await refresh();
  }, [getClient, refresh]);

  const markReimbursed = useCallback(async (expense_id: string) => {
    const client = getClient();
    if (!client) throw new Error('Expenses client not ready');
    await client.markReimbursed({ expense_id });
    await refresh();
  }, [getClient, refresh]);

  const addCategory = useCallback(async (name: string) => {
    const client = getClient();
    if (!client) throw new Error('Expenses client not ready');
    await client.addCategory({ name });
    await refresh();
  }, [getClient, refresh]);

  return {
    myExpenses,
    pendingExpenses,
    allExpenses,
    categories,
    loading,
    error,
    refresh,
    submitExpense,
    editExpense,
    approveExpense,
    rejectExpense,
    markReimbursed,
    addCategory,
  };
}
