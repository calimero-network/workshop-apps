/** @generated — codegen fixes applied (class name, Rust types → TS, private field renames) */

import { MeroJs } from '@calimero-network/mero-react';
import type { Incident, Comment, Postmortem, OnCallEntry } from '../types/incidents';

export class IncidentcommandClient {
  private _mero: MeroJs;
  private _contextId: string;
  private _executorPublicKey: string;

  constructor(mero: MeroJs, contextId: string, executorPublicKey: string) {
    this._mero = mero;
    this._contextId = contextId;
    this._executorPublicKey = executorPublicKey;
  }

  /** Shared RPC executor — unwraps `app::Result<T>` and throws on `Err`. */
  private async execute<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    const result = await this._mero.rpc.execute<{ Ok: T } | { Err: string }>({
      contextId: this._contextId,
      method,
      argsJson: args,
    });
    if ('Err' in result) {
      throw new Error(typeof result.Err === 'string' ? result.Err : JSON.stringify(result.Err));
    }
    return result.Ok;
  }

  // ── Incident lifecycle ──────────────────────────────────────────────────────

  /** Declare a new incident; returns the new incident id. */
  createIncident(title: string, description: string, severity: string): Promise<string> {
    return this.execute<string>('create_incident', { title, description, severity });
  }

  /** Move an incident from 'open' → 'acknowledged'. */
  acknowledgeIncident(incident_id: string): Promise<void> {
    return this.execute<void>('acknowledge_incident', { incident_id });
  }

  /** Move an incident to 'resolved'. */
  resolveIncident(incident_id: string): Promise<void> {
    return this.execute<void>('resolve_incident', { incident_id });
  }

  /**
   * Update severity and/or assignee of an incident.
   * Pass `null` to leave a field unchanged.
   */
  updateIncident(
    incident_id: string,
    severity: string | null,
    assignee: string | null,
  ): Promise<void> {
    return this.execute<void>('update_incident', { incident_id, severity, assignee });
  }

  // ── Incident queries ────────────────────────────────────────────────────────

  /** Returns all incidents (open, acknowledged, and resolved). */
  listIncidents(): Promise<Incident[]> {
    return this.execute<Incident[]>('list_incidents');
  }

  /** Returns a single incident by id. */
  getIncident(incident_id: string): Promise<Incident> {
    return this.execute<Incident>('get_incident', { incident_id });
  }

  // ── Comments ────────────────────────────────────────────────────────────────

  /** Add a comment to an incident thread; returns the new comment id. */
  addComment(incident_id: string, body: string): Promise<string> {
    return this.execute<string>('add_comment', { incident_id, body });
  }

  /** Edit the body of an existing comment (caller must be the author). */
  editComment(comment_id: string, body: string): Promise<void> {
    return this.execute<void>('edit_comment', { comment_id, body });
  }

  /** Delete a comment (caller must be the author). */
  deleteComment(comment_id: string): Promise<void> {
    return this.execute<void>('delete_comment', { comment_id });
  }

  /** Fetch all comments for an incident. */
  getComments(incident_id: string): Promise<Comment[]> {
    return this.execute<Comment[]>('get_comments', { incident_id });
  }

  // ── Postmortems ─────────────────────────────────────────────────────────────

  /** Create a postmortem for a resolved incident; returns the postmortem id. */
  createPostmortem(
    incident_id: string,
    timeline: string,
    root_cause: string,
    action_items: string,
  ): Promise<string> {
    return this.execute<string>('create_postmortem', {
      incident_id,
      timeline,
      root_cause,
      action_items,
    });
  }

  /**
   * Edit fields of an existing postmortem.
   * Pass `null` to leave a field unchanged.
   */
  editPostmortem(
    postmortem_id: string,
    timeline: string | null,
    root_cause: string | null,
    action_items: string | null,
  ): Promise<void> {
    return this.execute<void>('edit_postmortem', {
      postmortem_id,
      timeline,
      root_cause,
      action_items,
    });
  }

  /** Fetch the postmortem for an incident (null if none written yet). */
  getPostmortem(incident_id: string): Promise<Postmortem | null> {
    return this.execute<Postmortem | null>('get_postmortem', { incident_id });
  }

  // ── On-call ─────────────────────────────────────────────────────────────────

  /** Set the current on-call responder; returns the entry id. */
  setOnCall(responder: string): Promise<string> {
    return this.execute<string>('set_on_call', { responder });
  }

  /** Fetch the current on-call entry (null if none set). */
  getOnCall(): Promise<OnCallEntry | null> {
    return this.execute<OnCallEntry | null>('get_on_call');
  }
}
