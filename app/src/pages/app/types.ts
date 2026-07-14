/**
 * Domain types for the issue tracker board — shell pass placeholders.
 *
 * These mirror the spec's Category / Task / Comment entities so the
 * presentational views (BoardView in AppPage.tsx, TaskDetailModal) can be
 * built against the real shape now. A later pass swaps the local mock state
 * in AppPage.tsx for a hook backed by the generated AbiClient — these types
 * carry over unchanged.
 */

export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type Status = 'open' | 'completed';

export interface Category {
  id: string;
  name: string;
  created_at: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  priority: Priority;
  status: Status;
  archived: boolean;
  category_id: string;
  author: string;
  created_at: number;
}

export interface Comment {
  id: string;
  task_id: string;
  author: string;
  body: string;
  pr_link: string | null;
  created_at: number;
  updated_at: number;
}

export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];
