/** @generated from ABI — codegen fixes applied (Rust types converted, no name collisions). */

import { MeroJs } from '@calimero-network/mero-react';

export interface StandupEntry {
  id: string;
  author: string;
  done_items: string;
  blockers: string;
  planned_items: string;
  date: string;
  created_at: number;
}

export interface Comment {
  id: string;
  author: string;
  standup_id: string;
  body: string;
  created_at: number;
}

export class AsyncstandupClient {
  private _mero: MeroJs;
  private _contextId: string;
  private _executorPublicKey: string;

  constructor(mero: MeroJs, contextId: string, executorPublicKey: string) {
    this._mero = mero;
    this._contextId = contextId;
    this._executorPublicKey = executorPublicKey;
  }

  /** Post a new standup entry. Returns the new entry's id. */
  async postStandup(params: {
    done_items: string;
    blockers: string;
    planned_items: string;
    date: string;
  }): Promise<string> {
    const result = await this._mero.rpc.execute<string>({
      contextId: this._contextId,
      method: 'post_standup',
      argsJson: params as Record<string, unknown>,
      executorPublicKey: this._executorPublicKey,
    });
    return result;
  }

  /** Edit an existing standup entry (own entries only). */
  async editStandup(params: {
    id: string;
    done_items: string;
    blockers: string;
    planned_items: string;
  }): Promise<void> {
    await this._mero.rpc.execute<null>({
      contextId: this._contextId,
      method: 'edit_standup',
      argsJson: params as Record<string, unknown>,
      executorPublicKey: this._executorPublicKey,
    });
  }

  /** Delete a standup entry (own entries only). */
  async deleteStandup(params: { id: string }): Promise<void> {
    await this._mero.rpc.execute<null>({
      contextId: this._contextId,
      method: 'delete_standup',
      argsJson: params as Record<string, unknown>,
      executorPublicKey: this._executorPublicKey,
    });
  }

  /** Get all standup entries. */
  async getStandups(): Promise<StandupEntry[]> {
    const result = await this._mero.rpc.execute<StandupEntry[]>({
      contextId: this._contextId,
      method: 'get_standups',
      argsJson: {} as Record<string, unknown>,
      executorPublicKey: this._executorPublicKey,
    });
    return result ?? [];
  }

  /** Get all standup entries for a specific date (YYYY-MM-DD). */
  async getStandupsByDate(params: { date: string }): Promise<StandupEntry[]> {
    const result = await this._mero.rpc.execute<StandupEntry[]>({
      contextId: this._contextId,
      method: 'get_standups_by_date',
      argsJson: params as Record<string, unknown>,
      executorPublicKey: this._executorPublicKey,
    });
    return result ?? [];
  }

  /** Add a comment on a standup. Returns the new comment's id. */
  async addComment(params: { standup_id: string; body: string }): Promise<string> {
    const result = await this._mero.rpc.execute<string>({
      contextId: this._contextId,
      method: 'add_comment',
      argsJson: params as Record<string, unknown>,
      executorPublicKey: this._executorPublicKey,
    });
    return result;
  }

  /** Get all comments for a standup. */
  async getComments(params: { standup_id: string }): Promise<Comment[]> {
    const result = await this._mero.rpc.execute<Comment[]>({
      contextId: this._contextId,
      method: 'get_comments',
      argsJson: params as Record<string, unknown>,
      executorPublicKey: this._executorPublicKey,
    });
    return result ?? [];
  }
}
