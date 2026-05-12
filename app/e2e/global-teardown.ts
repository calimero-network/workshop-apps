/**
 * Playwright global teardown for trip-splitter e2e tests.
 * Removes the fixtures file written by global-setup.ts.
 */

import fs from 'fs';
import { FIXTURE_PATH } from './global-setup';

export default async function globalTeardown(): Promise<void> {
  if (fs.existsSync(FIXTURE_PATH)) {
    fs.unlinkSync(FIXTURE_PATH);
  }
}
