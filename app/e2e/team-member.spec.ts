/**
 * Playwright specs — actor: "team member"
 *
 * Covers user stories:
 *   1. add a task to the shared list
 *   2. mark my task as done
 *   3. edit a task I created
 *   4. delete a task I created by mistake
 *
 * UI selectors are taken from the real frontend components:
 *   - TaskListView.tsx  (add form, filter tabs, task rows, inline edit)
 *   - ChatPage.tsx      (welcome screen, workspace creation flow)
 *
 * [Verifier] NOTE: edit/delete buttons are emoji-only (✏️ / 🗑️) with no
 * visible text labels; they are located via the `title` attribute
 * ("Edit task" / "Delete task") using page.locator('[title="…"]').
 */

import { test, expect, type Browser } from '@playwright/test';
import { loginViaHash, clearAuth, ensureWorkspace } from './helpers';

// ─────────────────────────────────────────────────────────────────────────────
// Story 1: team member — add a task to the shared list
// Criterion: after a team member adds a task, all other team members see it
//            in the list within 5s
// ─────────────────────────────────────────────────────────────────────────────

test.describe('team member: add a task to the shared list', () => {
  test(
    'after a team member adds a task, all other team members see it in the list within 5s',
    async ({ browser }: { browser: Browser }) => {
      const ctxA = await browser.newContext();
      const ctxB = await browser.newContext();
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      try {
        // ── Node 0: add the task ─────────────────────────────────────────────
        await loginViaHash(pageA, 0);
        await ensureWorkspace(pageA);

        await pageA.getByPlaceholder('New task title…').fill('E2E Add Task');
        await pageA.getByRole('button', { name: '+ Add Task' }).click();

        // Immediately visible to the creator.
        await expect(pageA.getByText('E2E Add Task')).toBeVisible({ timeout: 5_000 });

        // ── Node 1: task must appear within 5s ───────────────────────────────
        await loginViaHash(pageB, 1);
        await ensureWorkspace(pageB);

        await expect(pageB.getByText('E2E Add Task')).toBeVisible({ timeout: 5_000 });
      } finally {
        await ctxA.close();
        await ctxB.close();
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Story 2: team member — mark my task as done
// Criterion: after a team member marks a task done, all other team members
//            see it checked off within 5s
// ─────────────────────────────────────────────────────────────────────────────

test.describe('team member: mark my task as done', () => {
  test(
    'after a team member marks a task done, all other team members see it checked off within 5s',
    async ({ browser }: { browser: Browser }) => {
      const ctxA = await browser.newContext();
      const ctxB = await browser.newContext();
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      try {
        // ── Node 0: create a task then complete it ───────────────────────────
        await loginViaHash(pageA, 0);
        await ensureWorkspace(pageA);

        await pageA.getByPlaceholder('New task title…').fill('E2E Complete Task');
        await pageA.getByRole('button', { name: '+ Add Task' }).click();

        // Wait for the task to appear before checking the checkbox.
        await expect(pageA.getByText('E2E Complete Task')).toBeVisible({ timeout: 10_000 });

        // The checkbox has title="Mark as done" when not yet completed.
        // It is the first unchecked checkbox on the page.
        const checkbox = pageA
          .locator('input[type="checkbox"][title="Mark as done"]')
          .first();
        await checkbox.click();

        // Creator should immediately see it as completed (line-through styling
        // applied when task.completed === true).
        await expect(
          pageA.locator('input[type="checkbox"][title="Mark as pending"]').first(),
        ).toBeVisible({ timeout: 5_000 });

        // ── Node 1: task must appear as checked within 5s ────────────────────
        await loginViaHash(pageB, 1);
        await ensureWorkspace(pageB);

        // The task text is visible and its checkbox has switched to "Mark as pending".
        await expect(pageB.getByText('E2E Complete Task')).toBeVisible({ timeout: 5_000 });
        await expect(
          pageB.locator('input[type="checkbox"][title="Mark as pending"]').first(),
        ).toBeVisible({ timeout: 5_000 });
      } finally {
        await ctxA.close();
        await ctxB.close();
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Story 3: team member — edit a task I created
// Criterion: after a team member edits their task, all other team members see
//            the updated title or description within 5s
// ─────────────────────────────────────────────────────────────────────────────

test.describe('team member: edit a task I created', () => {
  test(
    'after a team member edits their task, all other team members see the updated title within 5s',
    async ({ browser }: { browser: Browser }) => {
      const ctxA = await browser.newContext();
      const ctxB = await browser.newContext();
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      try {
        // ── Node 0: create then edit a task ──────────────────────────────────
        await loginViaHash(pageA, 0);
        await ensureWorkspace(pageA);

        await pageA.getByPlaceholder('New task title…').fill('E2E Edit Original');
        await pageA.getByRole('button', { name: '+ Add Task' }).click();

        await expect(pageA.getByText('E2E Edit Original')).toBeVisible({ timeout: 10_000 });

        // Click the edit button for this task (title="Edit task").
        // The button is the ✏️ icon rendered as a <button title="Edit task">.
        const editBtn = pageA.locator('[title="Edit task"]').first();
        await editBtn.click();

        // The inline edit form opens; clear the title field and type the new title.
        // The edit title input has autoFocus and no placeholder.
        const editTitleInput = pageA.locator('input[autofocus]').first();
        await editTitleInput.clear();
        await editTitleInput.fill('E2E Edit Updated');

        // Submit via "Save" button.
        await pageA.getByRole('button', { name: 'Save' }).click();

        // Old title is gone; new title visible.
        await expect(pageA.getByText('E2E Edit Updated')).toBeVisible({ timeout: 5_000 });
        await expect(pageA.getByText('E2E Edit Original')).not.toBeVisible();

        // ── Node 1: updated title must appear within 5s ──────────────────────
        await loginViaHash(pageB, 1);
        await ensureWorkspace(pageB);

        await expect(pageB.getByText('E2E Edit Updated')).toBeVisible({ timeout: 5_000 });
      } finally {
        await ctxA.close();
        await ctxB.close();
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Story 4: team member — delete a task I created by mistake
// Criteria:
//   a) a team member can only delete tasks they created
//      → delete button visible for own tasks, absent for others' tasks
//   b) the task disappears from the list for everyone within 5s
// ─────────────────────────────────────────────────────────────────────────────

test.describe('team member: delete a task I created by mistake', () => {
  test(
    'delete button is visible for own tasks and absent on another node',
    async ({ browser }: { browser: Browser }) => {
      const ctxA = await browser.newContext();
      const ctxB = await browser.newContext();
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      try {
        // ── Node 0: create a task ────────────────────────────────────────────
        await loginViaHash(pageA, 0);
        await ensureWorkspace(pageA);

        await pageA.getByPlaceholder('New task title…').fill('E2E Delete Ownership');
        await pageA.getByRole('button', { name: '+ Add Task' }).click();

        await expect(pageA.getByText('E2E Delete Ownership')).toBeVisible({ timeout: 10_000 });

        // Node 0 owns the task → delete button (title="Delete task") is visible.
        await expect(pageA.locator('[title="Delete task"]').first()).toBeVisible({ timeout: 5_000 });

        // ── Node 1: same task, different executor — no delete button ─────────
        await loginViaHash(pageB, 1);
        await ensureWorkspace(pageB);

        await expect(pageB.getByText('E2E Delete Ownership')).toBeVisible({ timeout: 5_000 });

        // Node 1 does NOT own the task → no delete button on this node.
        // [Verifier] NOTE: ownership enforcement is in TaskListView (isSelf check);
        //   the delete button is only rendered when task.created_by === selfExecutorKey.
        await expect(pageB.locator('[title="Delete task"]')).not.toBeVisible();
      } finally {
        await ctxA.close();
        await ctxB.close();
      }
    },
  );

  test(
    'the task disappears from the list for everyone within 5s after deletion',
    async ({ browser }: { browser: Browser }) => {
      const ctxA = await browser.newContext();
      const ctxB = await browser.newContext();
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      try {
        // ── Node 0: create then delete a task ────────────────────────────────
        await loginViaHash(pageA, 0);
        await ensureWorkspace(pageA);

        await pageA.getByPlaceholder('New task title…').fill('E2E Delete Sync');
        await pageA.getByRole('button', { name: '+ Add Task' }).click();

        await expect(pageA.getByText('E2E Delete Sync')).toBeVisible({ timeout: 10_000 });

        // Delete the task via its delete button (title="Delete task").
        await pageA.locator('[title="Delete task"]').first().click();

        // Creator no longer sees the task.
        await expect(pageA.getByText('E2E Delete Sync')).not.toBeVisible({ timeout: 5_000 });

        // ── Node 1: task must disappear within 5s ────────────────────────────
        await loginViaHash(pageB, 1);
        await ensureWorkspace(pageB);

        await expect(pageB.getByText('E2E Delete Sync')).not.toBeVisible({ timeout: 5_000 });
      } finally {
        await ctxA.close();
        await ctxB.close();
      }
    },
  );
});
