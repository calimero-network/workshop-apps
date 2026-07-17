/**
 * SHELL PASS PLACEHOLDER DATA.
 *
 * This pass builds the presentational surfaces only — no generated AbiClient
 * calls yet. These fixtures stand in for `list_incidents` / `list_comments` /
 * `list_postmortems` so the views have something to render. The next pass
 * replaces every import of this module with real domain hooks
 * (`useIncidents`, `useComments`, `usePostmortems`) wrapping
 * `IncidentflowClient`, wired the same way `useItems` wraps `ServiceClient`.
 */

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export type IncidentStatus = 'Investigating' | 'Mitigating' | 'Resolved';
export type PostmortemStatus = 'draft' | 'published';

export const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low'];
export const STATUSES: IncidentStatus[] = ['Investigating', 'Mitigating', 'Resolved'];

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  affected_area: string;
  status: IncidentStatus;
  assigned_to: string | null;
  created_by: string;
  created_at: number;
}

export interface TimelineEntry {
  incident_id: string;
  status: IncidentStatus;
  at: number;
}

export interface Comment {
  id: string;
  incident_id: string;
  author: string;
  body: string;
  mentions: string[];
  created_at: number;
}

export interface Postmortem {
  id: string;
  incident_id: string;
  author: string;
  summary: string;
  root_cause: string;
  resolution_steps: string;
  lessons_learned: string;
  status: PostmortemStatus;
  created_at: number;
}

const HOUR = 3_600_000;
const NOW = 1_752_000_000_000; // fixed reference instant — placeholder only

export const MOCK_INCIDENTS: Incident[] = [
  {
    id: 'inc-7a3f',
    title: 'Checkout down',
    description: '500s on the checkout API for all regions.',
    severity: 'Critical',
    affected_area: 'Payments',
    status: 'Mitigating',
    assigned_to: 'alice',
    created_by: 'bob',
    created_at: NOW - 2 * HOUR,
  },
  {
    id: 'inc-2b91',
    title: 'Elevated login latency',
    description: 'p95 login latency up 4x since the last deploy.',
    severity: 'Medium',
    affected_area: 'Auth',
    status: 'Investigating',
    assigned_to: null,
    created_by: 'carol',
    created_at: NOW - 5 * HOUR,
  },
  {
    id: 'inc-9c02',
    title: 'Search index stale',
    description: 'Search results lag behind writes by several minutes.',
    severity: 'Low',
    affected_area: 'Search',
    status: 'Resolved',
    assigned_to: 'dave',
    created_by: 'alice',
    created_at: NOW - 30 * HOUR,
  },
];

export const MOCK_TIMELINE: TimelineEntry[] = [
  { incident_id: 'inc-7a3f', status: 'Investigating', at: NOW - 2 * HOUR },
  { incident_id: 'inc-7a3f', status: 'Mitigating', at: NOW - 1 * HOUR },
  { incident_id: 'inc-2b91', status: 'Investigating', at: NOW - 5 * HOUR },
  { incident_id: 'inc-9c02', status: 'Investigating', at: NOW - 30 * HOUR },
  { incident_id: 'inc-9c02', status: 'Mitigating', at: NOW - 28 * HOUR },
  { incident_id: 'inc-9c02', status: 'Resolved', at: NOW - 27 * HOUR },
];

export const MOCK_COMMENTS: Comment[] = [
  {
    id: 'cmt-1c2d',
    incident_id: 'inc-7a3f',
    author: 'alice',
    body: 'Rolling back the last deploy now.',
    mentions: ['bob'],
    created_at: NOW - 90 * 60_000,
  },
  {
    id: 'cmt-3f4e',
    incident_id: 'inc-7a3f',
    author: 'bob',
    body: 'Confirmed — error rate dropping after rollback.',
    mentions: [],
    created_at: NOW - 60 * 60_000,
  },
];

export const MOCK_POSTMORTEMS: Postmortem[] = [
  {
    id: 'pm-9e1b',
    incident_id: 'inc-9c02',
    author: 'dave',
    summary: 'Search indexing fell behind for ~3 hours due to a stuck consumer.',
    root_cause: 'A consumer restart loop stopped acking the indexing queue.',
    resolution_steps: 'Restarted the consumer group and replayed the backlog.',
    lessons_learned: 'Add lag alerting on the indexing queue.',
    status: 'published',
    created_at: NOW - 26 * HOUR,
  },
];
