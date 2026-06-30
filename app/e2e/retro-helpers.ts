// Shared e2e helpers for the sprint-retro story specs.
//
// NOT machine-managed (only global-setup/global-teardown/helpers/tsconfig/
// playwright.config are regenerated). These wrap the real AppPage flow so each
// story spec can focus on its one criterion:
//   - ensureBoard:        post-login → live board (bootstrap + name the retro if needed)
//   - mintInvite:         pull a fresh invite code off the facilitator's board
//   - openSecondMember:   log a second node in and join the shared retro
//
// Selectors come straight from app/src/pages/app/AppPage.tsx + the Invite/Join
// modals — buttons, placeholders and column headings the user actually sees.
import { Browser, BrowserContext, Page, expect } from '@playwright/test';
import { loginViaHash } from './helpers';

export const RETRO_NAME = 'Sprint 42 Retro';

/**
 * Drive a freshly-authed page to the live three-column board. Handles every
 * post-login state the AppPage can show:
 *   - "Start a retro" (no workspace yet)  → bootstrap a shared context
 *   - "Name your retro" (unnamed context) → name it (this caller is facilitator)
 *   - board already showing               → no-op
 * Resolves once the "Went well" column header is visible.
 */
export async function ensureBoard(page: Page, name = RETRO_NAME): Promise<void> {
  const start = page.getByRole('button', { name: 'Start a retro' });
  const nameInput = page.getByPlaceholder('e.g. Sprint 42 Retro');
  const wentWell = page.getByRole('heading', { name: 'Went well' });

  await expect(start.or(nameInput).or(wentWell).first()).toBeVisible({ timeout: 30_000 });
  if (await start.isVisible()) {
    await start.click();
  }

  await expect(nameInput.or(wentWell).first()).toBeVisible({ timeout: 30_000 });
  if (await nameInput.isVisible()) {
    await nameInput.fill(name);
    await page.getByRole('button', { name: 'Create retro' }).click();
  }

  await expect(wentWell).toBeVisible({ timeout: 30_000 });
}

/** Open the Invite modal, generate a code, and return it (the recipient pastes it into Join). */
export async function mintInvite(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  await page.getByRole('button', { name: 'Generate invite code' }).click();
  const codeBox = page.locator('textarea');
  await expect(codeBox).toBeVisible({ timeout: 30_000 });
  const code = await codeBox.inputValue();
  await page.getByRole('button', { name: 'Close' }).click();
  return code;
}

/** Join an existing retro from an invite code, or no-op if already in the shared context. */
export async function joinRetro(page: Page, code: string): Promise<void> {
  const wentWell = page.getByRole('heading', { name: 'Went well' });
  const joinWelcome = page.getByRole('button', { name: 'Join with invitation' });

  await expect(joinWelcome.or(wentWell).first()).toBeVisible({ timeout: 30_000 });
  if (await wentWell.isVisible()) return; // harness already put this node in the shared context

  await joinWelcome.click();
  await page.getByPlaceholder('Paste your invite code…').fill(code);
  await page.getByRole('button', { name: 'Join workspace' }).click();
  await expect(wentWell).toBeVisible({ timeout: 30_000 });
}

/** Log a second member in on `nodeIndex` and join the shared retro. Caller closes the context. */
export async function openSecondMember(
  browser: Browser,
  code: string,
  nodeIndex = 1,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginViaHash(page, nodeIndex);
  await joinRetro(page, code);
  return { ctx, page };
}
