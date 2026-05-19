/**
 * Playwright specs — actor: "anyone on the team"
 *
 * Covers user story:
 *   see all tasks in one place
 *
 * Criterion:
 *   the list always shows all tasks ordered by creation date, with done and
 *   pending tasks both visible
 *
 * UI selectors are taken from TaskListView.tsx:
 *   - "Team Tasks"           — h2 heading (always present in TaskListView)
 *   - "All" / "Pending" / "Done"  — filter tab buttons
 *   - "New task title…"      — add-task title input placeholder
 *   - "+ Add Task"           — submit button for add-task form
 *   - checkbox[title="Mark as done"]  — marks a pending task complete
 */

import { test, expect } from '@playwright/test';
import { loginViaHash, clearAuth, ensureWorkspace } from './helpers';

test.describe('anyone on the team: see all tasks in one place', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaHash(page, 0);
    await ensureWorkspace(page);
  });

  test.afterEach(async ({ page }) => {
    await clearAuth(page);
  });

  test(
    'the task list always shows the Team Tasks heading and All/Pending/Done filter tabs',
    async ({ page }) => {
      // The header section of TaskListView is always rendered.
      await expect(page.getByRole('heading', { name: 'Team Tasks' })).toBeVisible({ timeout: 5_000 });

      // All three filter tabs are present.
      await expect(page.getByRole('button', { name: 'All' })).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole('button', { name: 'Pending' })).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole('button', { name: 'Done' })).toBeVisible({ timeout: 5_000 });
    },
  );

  test(
    'the list shows all tasks ordered by creation date, with done and pending tasks both visible',
    async ({ page }) => {
      // Create a pending task.
      await page.getByPlaceholder('New task title…').fill('Pending Task Visible');
      await page.getByRole('button', { name: '+ Add Task' }).click();
      await expect(page.getByText('Pending Task Visible')).toBeVisible({ timeout: 10_000 });

      // Create a second task and complete it.
      await page.getByPlaceholder('New task title…').fill('Done Task Visible');
      await page.getByRole('button', { name: '+ Add Task' }).click();
      await expect(page.getByText('Done Task Visible')).toBeVisible({ timeout: 10_000 });

      // Mark the second task as done.
      // The checkbox for "Done Task Visible" is the last "Mark as done" checkbox.
      const checkboxes = page.locator('input[type="checkbox"][title="Mark as done"]');
      await checkboxes.last().click();

      // "All" tab is the default — both tasks are visible together.
      await page.getByRole('button', { name: 'All' }).click();
      await expect(page.getByText('Pending Task Visible')).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText('Done Task Visible')).toBeVisible({ timeout: 5_000 });

      // "Done" tab shows only the completed task.
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page.getByText('Done Task Visible')).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText('Pending Task Visible')).not.toBeVisible();

      // "Pending" tab shows only the pending task.
      await page.getByRole('button', { name: 'Pending' }).click();
      await expect(page.getByText('Pending Task Visible')).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText('Done Task Visible')).not.toBeVisible();

      // Creation-date ordering: "Pending Task Visible" was created first so it
      // appears before "Done Task Visible" in the "All" view.
      await page.getByRole('button', { name: 'All' }).click();
      const taskTitles = await page.locator('input[type="checkbox"] ~ div').allInnerTexts();
      // The first task rendered must contain the first-created title.
      // (Tasks are sorted ascending by created_at in useTaskList.ts.)
      expect(taskTitles.findIndex((t) => t.includes('Pending Task Visible'))).toBeLessThan(
        taskTitles.findIndex((t) => t.includes('Done Task Visible')),
      );
    },
  );
});
