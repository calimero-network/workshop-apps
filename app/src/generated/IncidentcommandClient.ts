/** @generated stub from spec — will be replaced by abi-codegen after backend compiles. */

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

  async listIncidents(): Promise<Incident[]> {
    return [];
  }

  async getIncident(_incidentId: string): Promise<Incident> {
    throw new Error('Not implemented');
  }

  async createIncident(
    _title: string,
    _description: string,
    _severity: string,
  ): Promise<string> {
    return '';
  }

  async acknowledgeIncident(_incidentId: string): Promise<void> {}

  async resolveIncident(_incidentId: string): Promise<void> {}

  async updateIncident(
    _incidentId: string,
    _severity: string | null,
    _assignee: string | null,
  ): Promise<void> {}

  async getComments(_incidentId: string): Promise<Comment[]> {
    return [];
  }

  async addComment(_incidentId: string, _body: string): Promise<string> {
    return '';
  }

  async editComment(_commentId: string, _body: string): Promise<void> {}

  async deleteComment(_commentId: string): Promise<void> {}

  async getPostmortem(_incidentId: string): Promise<Postmortem | null> {
    return null;
  }

  async createPostmortem(
    _incidentId: string,
    _timeline: string,
    _rootCause: string,
    _actionItems: string,
  ): Promise<string> {
    return '';
  }

  async editPostmortem(
    _postmortemId: string,
    _timeline: string | null,
    _rootCause: string | null,
    _actionItems: string | null,
  ): Promise<void> {}

  async setOnCall(_responder: string): Promise<string> {
    return '';
  }

  async getOnCall(): Promise<OnCallEntry | null> {
    return null;
  }
}
