/**
 * useTripData — per-trip state: expenses and balances.
 *
 * Mirrors the useChatRoom pattern: resolves an executor identity per context,
 * builds the TripClient lazily, subscribes via useSubscription for live
 * updates, and re-fetches after every mutation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { TripClient, Expense } from '../api/trip/TripClient';

const CURRENCY_KEY_PREFIX = 'trip-currency:';

export function saveTripCurrency(contextId: string, currency: string): void {
  try { localStorage.setItem(`${CURRENCY_KEY_PREFIX}${contextId}`, currency); } catch { /* ok */ }
}

export function loadTripCurrency(contextId: string | null): string {
  if (!contextId) return '';
  try { return localStorage.getItem(`${CURRENCY_KEY_PREFIX}${contextId}`) ?? ''; } catch { return ''; }
}

export interface UseTripDataReturn {
  expenses: Expense[];
  balances: Record<string, number>;
  currency: string;
  loading: boolean;
  error: Error | null;
  executorPublicKey: string | null;
  refresh: () => Promise<void>;
  addExpense: (amount: number, description: string, splitAmong: string[]) => Promise<void>;
  editExpense: (id: string, newAmount: number, newDescription: string) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  recordPayment: (from: string, to: string, amount: number) => Promise<void>;
  createTrip: (name: string, currency: string) => Promise<string>;
}

export function useTripData(
  contextId: string | null,
  /** Executor key resolved by useChatLobby for the trip context. */
  lobbyExecutorPublicKey: string | null,
): UseTripDataReturn {
  const { mero } = useMero();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [currency, setCurrency] = useState<string>(() => loadTripCurrency(contextId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Sync currency from localStorage whenever the selected context changes.
  useEffect(() => {
    setCurrency(loadTripCurrency(contextId));
  }, [contextId]);

  // Resolve the executor identity for this context (may differ from lobby key
  // when the context lives in a subgroup, though for trip-splitter they coincide).
  const [executorPublicKey, setExecutorPublicKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) { setExecutorPublicKey(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) {
          setExecutorPublicKey(identities[0]);
          return;
        }
        if (!cancelled) setExecutorPublicKey(lobbyExecutorPublicKey);
      } catch {
        if (!cancelled) setExecutorPublicKey(lobbyExecutorPublicKey);
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, lobbyExecutorPublicKey]);

  const clientRef = useRef<TripClient | null>(null);
  clientRef.current =
    mero && contextId && executorPublicKey
      ? new TripClient(mero, contextId, executorPublicKey)
      : null;

  const refresh = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [exps, bals] = await Promise.all([
        client.listExpenses(),
        client.getBalances(),
      ]);
      setExpenses(exps);
      setBalances(bals);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates from other peers
  useSubscription(contextId ? [contextId] : [], () => { void refresh(); });

  const addExpense = useCallback(async (
    amount: number,
    description: string,
    splitAmong: string[],
  ) => {
    const client = clientRef.current;
    if (!client) throw new Error('Trip client not ready');
    await client.addExpense({ amount, description, split_among: splitAmong });
    await refresh();
  }, [refresh]);

  const editExpense = useCallback(async (
    id: string,
    newAmount: number,
    newDescription: string,
  ) => {
    const client = clientRef.current;
    if (!client) throw new Error('Trip client not ready');
    await client.editExpense({ id, new_amount: newAmount, new_description: newDescription });
    await refresh();
  }, [refresh]);

  const deleteExpense = useCallback(async (id: string) => {
    const client = clientRef.current;
    if (!client) throw new Error('Trip client not ready');
    await client.deleteExpense({ id });
    await refresh();
  }, [refresh]);

  const recordPayment = useCallback(async (
    from: string,
    to: string,
    amount: number,
  ) => {
    const client = clientRef.current;
    if (!client) throw new Error('Trip client not ready');
    await client.recordPayment({ from, to, amount });
    await refresh();
  }, [refresh]);

  const createTrip = useCallback(async (name: string, currency: string): Promise<string> => {
    const client = clientRef.current;
    if (!client) throw new Error('Trip client not ready');
    const tripId = await client.createTrip({ name, currency });
    if (contextId) {
      saveTripCurrency(contextId, currency);
      setCurrency(currency);
    }
    await refresh();
    return tripId;
  }, [contextId, refresh]);

  return {
    expenses,
    balances,
    currency,
    loading,
    error,
    executorPublicKey,
    refresh,
    addExpense,
    editExpense,
    deleteExpense,
    recordPayment,
    createTrip,
  };
}
