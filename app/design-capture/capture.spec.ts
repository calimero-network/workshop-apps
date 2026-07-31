import { test, expect, Page } from '@playwright/test';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { loginViaHash, createWorkspace, waitForWorkspaceReady } from '../e2e/helpers';

// Required, never defaulted: frames must not be able to land inside a repo.
const OUT = process.env.DESIGN_CAPTURE_OUT;
const DESKTOP = { width: 1280, height: 800 };
const NARROW = { width: 390, height: 844 };

// The theme is read from localStorage before first paint and a stored value
// always wins, so seeding the key is the path a real user takes.
const STORAGE_KEY = 'app:theme';

async function shot(page: Page, id: string, opts: { fonts?: boolean } = {}) {
  // Never networkidle: an authenticated app holds a live sync connection to its
  // node, so the network never falls idle and the wait can only time out.
  await page.waitForLoadState('load');
  // evaluate needs JS, which the preview context disables.
  if (opts.fonts !== false) await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({ path: join(OUT!, `${id}.png`), fullPage: false, animations: 'disabled' });
}

async function seedTheme(page: Page, mode: 'light' | 'dark') {
  await page.addInitScript(
    ([k, m]) => window.localStorage.setItem(k as string, m as string),
    [STORAGE_KEY, mode],
  );
}

test.beforeAll(() => {
  expect(OUT, 'DESIGN_CAPTURE_OUT must name a directory outside the project').toBeTruthy();
  mkdirSync(OUT!, { recursive: true });
});

test('capture the surfaces the build agent authors', async ({ page, browser }) => {
  // The landing FIRST. App.tsx wraps "/" in RedirectIfAuthed, so once a session
  // exists this route redirects into the app and the landing is unreachable.
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  expect(new URL(page.url()).pathname, 'the landing redirected, so this frame is not the landing').toBe('/');
  await shot(page, 'landing-desktop');

  await page.setViewportSize(NARROW);
  await page.goto('/');
  await shot(page, 'landing-narrow');

  const current = await page.evaluate(() => document.documentElement.dataset.theme);
  const opposite = current === 'dark' ? 'light' : 'dark';

  const altCtx = await browser.newContext({ viewport: DESKTOP });
  const alt = await altCtx.newPage();
  await seedTheme(alt, opposite);
  await alt.goto('/');
  expect(new URL(alt.url()).pathname).toBe('/');
  await shot(alt, 'landing-alt');
  await altCtx.close();

  // From here the session exists and "/" is no longer the landing.
  await page.setViewportSize(DESKTOP);
  await loginViaHash(page, 0);
  await createWorkspace(page);
  await waitForWorkspaceReady(page);
  await shot(page, 'app-desktop');

  await page.setViewportSize(NARROW);
  await shot(page, 'app-narrow');

  await page.setViewportSize(DESKTOP);
  await page.evaluate(
    ([k, m]) => { window.localStorage.setItem(k as string, m as string); },
    [STORAGE_KEY, opposite],
  );
  await page.reload();
  await waitForWorkspaceReady(page);
  await shot(page, 'app-alt');
});

test('capture the approved design preview', async ({ browser }) => {
  // Written next to this spec by the worker. Absent in the foundation's own CI,
  // where no SPEC phase has run, so this is a skip rather than a failure.
  const previewUrl = new URL('preview.html', import.meta.url);
  test.skip(!existsSync(fileURLToPath(previewUrl)), 'no approved preview for this app');

  // This document is model-authored, and file:// grants it more than http would.
  // The web UI only ever renders it inside sandbox="" with a strict CSP, so
  // scripts are off here too: the frame then matches the preview the user
  // approved, rather than something the document can redraw for itself.
  const ctx = await browser.newContext({ viewport: DESKTOP, javaScriptEnabled: false });
  const page = await ctx.newPage();
  // This exact document and nothing else. Scripting off does not stop markup:
  // an <img> or <iframe> naming any other path renders it into the frame, and
  // the frame is uploaded to the critique model from inside the build worker.
  // The mockup is self-contained by construction, so it needs no sub-resource.
  await page.route('**', (route) => {
    if (route.request().url() === previewUrl.href) route.continue();
    else route.abort();
  });
  await page.goto(previewUrl.href);
  await shot(page, 'preview', { fonts: false });
  await ctx.close();
});
