import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { TripClient, Location, Expense, Photo, SettlementSummary } from '../api/trip/TripClient';

export interface UseTripDataReturn {
  locations: Location[];
  expenses: Expense[];
  photos: Photo[];
  settlement: SettlementSummary | null;
  loading: boolean;
  error: Error | null;
  tripExecutorKey: string | null;
  refresh: () => Promise<void>;
  postLocation: (description: string) => Promise<void>;
  logExpense: (description: string, amountCents: number, participants: string[]) => Promise<void>;
  uploadPhoto: (url: string) => Promise<void>;
  finishTrip: () => Promise<void>;
}

export function useTripData(
  tripContextId: string | null,
  lobbyExecutorPublicKey: string | null,
): UseTripDataReturn {
  const { mero } = useMero();
  const [locations, setLocations] = useState<Location[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [settlement, setSettlement] = useState<SettlementSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Resolve the executor identity for THIS trip context (may differ from the
  // workspace identity when joined later via invitation).
  const [tripExecutorKey, setTripExecutorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !tripContextId) { setTripExecutorKey(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(tripContextId);
        if (!cancelled && identities.length > 0) {
          setTripExecutorKey(identities[0]);
          return;
        }
        if (!cancelled && lobbyExecutorPublicKey) setTripExecutorKey(lobbyExecutorPublicKey);
      } catch {
        if (!cancelled && lobbyExecutorPublicKey) setTripExecutorKey(lobbyExecutorPublicKey);
      }
    })();
    return () => { cancelled = true; };
  }, [mero, tripContextId, lobbyExecutorPublicKey]);

  const getClient = useCallback((): TripClient | null => {
    if (!mero || !tripContextId || !tripExecutorKey) return null;
    return new TripClient(mero, tripContextId, tripExecutorKey);
  }, [mero, tripContextId, tripExecutorKey]);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [locs, exps, phts, sett] = await Promise.all([
        client.getLocations(),
        client.getExpenses(),
        client.getPhotos(),
        client.getSettlement(),
      ]);
      setLocations(locs);
      setExpenses(exps);
      setPhotos(phts);
      setSettlement(sett);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useEffect(() => { void refresh(); }, [refresh]);

  useSubscription(tripContextId ? [tripContextId] : [], () => { void refresh(); });

  const postLocation = useCallback(async (description: string) => {
    const client = getClient();
    if (!client) return;
    await client.postLocation({ description });
    await refresh();
  }, [getClient, refresh]);

  const logExpense = useCallback(async (
    description: string,
    amountCents: number,
    participants: string[],
  ) => {
    const client = getClient();
    if (!client) return;
    await client.logExpense({ description, amount_cents: amountCents, participants });
    await refresh();
  }, [getClient, refresh]);

  const uploadPhoto = useCallback(async (url: string) => {
    const client = getClient();
    if (!client) return;
    await client.uploadPhoto({ url });
    await refresh();
  }, [getClient, refresh]);

  const finishTrip = useCallback(async () => {
    const client = getClient();
    if (!client) throw new Error('Trip client not ready');
    await client.finishTrip();
    await refresh();
  }, [getClient, refresh]);

  // NOTE: Trip name and status are part of TripMeta in the backend, but
  // TripClient has no dedicated get_trip_meta view. The ChatPage drives
  // `tripStatus` locally (set to 'finished' after calling finishTrip()).
  // `tripName` is surfaced through the namespace alias instead.

  return {
    locations,
    expenses,
    photos,
    settlement,
    loading,
    error,
    tripExecutorKey,
    refresh,
    postLocation,
    logExpense,
    uploadPhoto,
    finishTrip,
  };
}
