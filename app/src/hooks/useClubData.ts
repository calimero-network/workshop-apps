/**
 * useClubData — per-club state: workouts, cheers, and settings.
 *
 * Mirrors the useChatRoom pattern: resolve executor identity per context,
 * build the ClubClient lazily, subscribe via useSubscription, refresh after
 * every mutation so the UI stays current.
 */

import { useCallback, useEffect, useState } from 'react';
import { useMero, useSubscription } from '@calimero-network/mero-react';
import { ClubClient, Workout, ClubSettings } from '../api/club/ClubClient';

export interface UseClubDataReturn {
  workouts: Workout[];
  settings: ClubSettings | null;
  loading: boolean;
  error: Error | null;

  logWorkout: (activity: string, durationMinutes: number, note: string) => Promise<void>;
  editWorkout: (id: string, activity: string, durationMinutes: number, note: string) => Promise<void>;
  deleteWorkout: (id: string) => Promise<void>;
  addCheer: (workoutId: string) => Promise<void>;
  setWeeklyGoal: (goal: number) => Promise<void>;

  refresh: () => Promise<void>;
  clubExecutorKey: string | null;
}

export function useClubData(
  contextId: string | null,
  _lobbyExecutorPublicKey: string | null,
): UseClubDataReturn {
  const { mero } = useMero();

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [settings, setSettings] = useState<ClubSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Resolve executor identity for this context (may differ from the lobby
  // identity when running in a distinct context; fallback to lobby key).
  const [clubExecutorKey, setClubExecutorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mero || !contextId) {
      setClubExecutorKey(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await mero.admin.getContextIdentitiesOwned(contextId);
        if (!cancelled && identities.length > 0) {
          setClubExecutorKey(identities[0]);
          return;
        }
        if (!cancelled && _lobbyExecutorPublicKey) {
          setClubExecutorKey(_lobbyExecutorPublicKey);
        }
      } catch {
        if (!cancelled && _lobbyExecutorPublicKey) {
          setClubExecutorKey(_lobbyExecutorPublicKey);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mero, contextId, _lobbyExecutorPublicKey]);

  const getClient = useCallback((): ClubClient | null => {
    if (!mero || !contextId || !clubExecutorKey) return null;
    return new ClubClient(mero, contextId, clubExecutorKey);
  }, [mero, contextId, clubExecutorKey]);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;

    setLoading(true);
    setError(null);
    try {
      const [wks, cfg] = await Promise.all([
        client.getWorkouts(),
        client.getClubSettings(),
      ]);
      // Sort workouts newest first
      setWorkouts([...wks].sort((a, b) => b.created_at - a.created_at));
      setSettings(cfg);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live-update on any club event (WorkoutLogged, CheerAdded, WeeklyGoalUpdated, etc.)
  useSubscription(contextId ? [contextId] : [], () => {
    void refresh();
  });

  const logWorkout = useCallback(async (
    activity: string,
    durationMinutes: number,
    note: string,
  ) => {
    const client = getClient();
    if (!client) return;
    await client.logWorkout({ activity, duration_minutes: durationMinutes, note });
    await refresh();
  }, [getClient, refresh]);

  const editWorkout = useCallback(async (
    id: string,
    activity: string,
    durationMinutes: number,
    note: string,
  ) => {
    const client = getClient();
    if (!client) return;
    await client.editWorkout({ id, activity, duration_minutes: durationMinutes, note });
    await refresh();
  }, [getClient, refresh]);

  const deleteWorkout = useCallback(async (id: string) => {
    const client = getClient();
    if (!client) return;
    await client.deleteWorkout({ id });
    await refresh();
  }, [getClient, refresh]);

  const addCheer = useCallback(async (workoutId: string) => {
    const client = getClient();
    if (!client) return;
    await client.addCheer({ workout_id: workoutId });
    await refresh();
  }, [getClient, refresh]);

  const setWeeklyGoal = useCallback(async (goal: number) => {
    const client = getClient();
    if (!client) return;
    await client.setWeeklyGoal({ goal });
    await refresh();
  }, [getClient, refresh]);

  return {
    workouts,
    settings,
    loading,
    error,
    logWorkout,
    editWorkout,
    deleteWorkout,
    addCheer,
    setWeeklyGoal,
    refresh,
    clubExecutorKey,
  };
}
