/**
 * Domain types mirroring the spec's `room` service entities.
 *
 * SHELL PASS: hand-written to match the ABI shape ahead of codegen so the
 * presentational screens have a stable contract. Once the generated client
 * lands, prefer its exported types (Vec<T> -> T[], Option<T> -> T | null
 * already applied here) and delete this file if it becomes redundant.
 */

export type PlayerStatusValue = 'playing' | 'idle';

export interface PlayerStatus {
  player: string;
  status: PlayerStatusValue;
  live_score: number;
  live_length: number;
  best_score: number;
  updated_at: number;
}

export type DuelStatus = 'active' | 'finished';

export interface Duel {
  id: string;
  initiator: string;
  status: DuelStatus;
  duration_seconds: number;
  started_at: number;
  ended_at: number | null;
}

export interface DuelResult {
  id: string;
  duel_id: string;
  author: string;
  score: number;
  length: number;
  created_at: number;
}
