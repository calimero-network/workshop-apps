/**
 * Domain types for the incident-command app.
 * Mirror the Rust structs from the incident_tracker service spec.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus = 'open' | 'acknowledged' | 'resolved';

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  assignee: string | null;
  created_by: string;
  created_at: number;
  resolved_at: number | null;
}

export interface Comment {
  id: string;
  incident_id: string;
  author: string;
  body: string;
  created_at: number;
}

export interface Postmortem {
  id: string;
  incident_id: string;
  author: string;
  timeline: string;
  root_cause: string;
  action_items: string;
  created_at: number;
}

export interface OnCallEntry {
  id: string;
  responder: string;
  started_at: number;
}

/** Severity sort order: critical → high → medium → low (ascending = more urgent first). */
export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Accent colour for each severity level (hardcoded — not theme-dependent). */
export const SEVERITY_COLOR: Record<Severity, { bg: string; text: string }> = {
  critical: { bg: '#EF4444', text: '#ffffff' },
  high: { bg: '#F97316', text: '#ffffff' },
  medium: { bg: '#EAB308', text: '#1a1a1a' },
  low: { bg: '#22C55E', text: '#1a1a1a' },
};

/** Accent colour for each status. */
export const STATUS_COLOR: Record<IncidentStatus, { bg: string; text: string }> = {
  open: { bg: '#EF4444', text: '#ffffff' },
  acknowledged: { bg: '#F97316', text: '#ffffff' },
  resolved: { bg: '#22C55E', text: '#ffffff' },
};

/** Human-readable status labels. */
export const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
};

/** Format a Unix timestamp (ms or s) as a relative "X ago" string. */
export function timeAgo(ts: number): string {
  // Backend may return seconds; JS needs ms.
  const ms = ts > 1e12 ? ts : ts * 1000;
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
