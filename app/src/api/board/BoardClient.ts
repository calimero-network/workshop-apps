/** @generated — board service ABI client for task-tracker. */

import { MeroJs } from '@calimero-network/mero-react';

// ── domain types ──────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  description: string;
  status: string;       // "todo" | "in_progress" | "done"
  priority: string;     // "low" | "medium" | "high"
  assignee: string | null;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export interface Comment {
  id: string;
  task_id: string;
  author: string;
  body: string;
  created_at: number;
}

// ── event types ───────────────────────────────────────────────────────────────

export type AbiEvent =
  | { name: 'BoardInitialized' }
  | { name: 'TaskCreated'; payload: { id: string } }
  | { name: 'TaskStatusUpdated'; payload: { id: string; status: string } }
  | { name: 'TaskAssigned'; payload: { id: string; assignee: string } }
  | { name: 'CommentAdded'; payload: { id: string; task_id: string } }
  | { name: 'CommentEdited'; payload: { id: string } }
  | { name: 'CommentDeleted'; payload: { id: string } };

// ── client ────────────────────────────────────────────────────────────────────

export class BoardClient {
  private _mero: MeroJs;
  private _contextId: string;
  private _executorPublicKey: string;

  constructor(mero: MeroJs, contextId: string, executorPublicKey: string) {
    this._mero = mero;
    this._contextId = contextId;
    this._executorPublicKey = executorPublicKey;
  }

  /** Initialize the board with a name (called via initializationParams on createContext). */
  public async initBoard(params: { name: string }): Promise<string> {
    const response = await this._mero.rpc.execute({
      contextId: this._contextId,
      method: 'init_board',
      argsJson: params,
      executorPublicKey: this._executorPublicKey,
    });
    return response as string;
  }

  /** Create a new task. Returns the new task ID. */
  public async createTask(params: { title: string; description: string; priority: string }): Promise<string> {
    const response = await this._mero.rpc.execute({
      contextId: this._contextId,
      method: 'create_task',
      argsJson: params,
      executorPublicKey: this._executorPublicKey,
    });
    return response as string;
  }

  /** Move a task to a new status column. */
  public async updateTaskStatus(params: { task_id: string; new_status: string }): Promise<void> {
    await this._mero.rpc.execute({
      contextId: this._contextId,
      method: 'update_task_status',
      argsJson: params,
      executorPublicKey: this._executorPublicKey,
    });
  }

  /** Assign a task to a member identity. */
  public async assignTask(params: { task_id: string; assignee: string }): Promise<void> {
    await this._mero.rpc.execute({
      contextId: this._contextId,
      method: 'assign_task',
      argsJson: params,
      executorPublicKey: this._executorPublicKey,
    });
  }

  /** Fetch all tasks on the board. */
  public async getTasks(): Promise<Task[]> {
    const response = await this._mero.rpc.execute({
      contextId: this._contextId,
      method: 'get_tasks',
      argsJson: {},
      executorPublicKey: this._executorPublicKey,
    });
    return (response as Task[]) ?? [];
  }

  /** Add a comment to a task. Returns the new comment ID. */
  public async addComment(params: { task_id: string; body: string }): Promise<string> {
    const response = await this._mero.rpc.execute({
      contextId: this._contextId,
      method: 'add_comment',
      argsJson: params,
      executorPublicKey: this._executorPublicKey,
    });
    return response as string;
  }

  /** Edit the body of a comment you authored. */
  public async editComment(params: { comment_id: string; new_body: string }): Promise<void> {
    await this._mero.rpc.execute({
      contextId: this._contextId,
      method: 'edit_comment',
      argsJson: params,
      executorPublicKey: this._executorPublicKey,
    });
  }

  /** Delete a comment you authored. */
  public async deleteComment(params: { comment_id: string }): Promise<void> {
    await this._mero.rpc.execute({
      contextId: this._contextId,
      method: 'delete_comment',
      argsJson: params,
      executorPublicKey: this._executorPublicKey,
    });
  }

  /** Fetch all comments for a specific task. */
  public async getComments(params: { task_id: string }): Promise<Comment[]> {
    const response = await this._mero.rpc.execute({
      contextId: this._contextId,
      method: 'get_comments',
      argsJson: params,
      executorPublicKey: this._executorPublicKey,
    });
    return (response as Comment[]) ?? [];
  }
}
