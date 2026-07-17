/**
 * Shared enums for the incident-tracker views. `severity` and `status` are
 * plain `String` fields on the backend (no enum validation beyond
 * non-empty) — these lists are the frontend's fixed vocabulary for the
 * select inputs. `Open` mirrors the backend's `create_incident` default.
 */

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export type IncidentStatus = 'Open' | 'Investigating' | 'Mitigating' | 'Resolved';
export type PostmortemStatus = 'draft' | 'published';

export const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low'];
export const STATUSES: IncidentStatus[] = ['Open', 'Investigating', 'Mitigating', 'Resolved'];
