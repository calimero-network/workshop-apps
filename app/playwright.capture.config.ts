import { defineConfig } from '@playwright/test';

// A separate config, and a separate directory from ./e2e, on purpose. Four
// consumers read `app/e2e/*.spec.ts` as "the app's tests", including the CI
// floor check that fails a build shipping with none.
export default defineConfig({
  testDir: './design-capture',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:5173',
    actionTimeout: 15_000,
  },
  webServer: {
    command: 'npx vite --port 5173',
    port: 5173,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
