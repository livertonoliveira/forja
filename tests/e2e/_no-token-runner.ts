/**
 * Minimal runner for createCheck no-token test — used only by e2e tests.
 *
 * Runs createCheck with no GITHUB_TOKEN and no config file, then prints
 * the console.warn calls to stdout so the parent test can assert on them.
 */

import { clearConfigCache } from '../../src/config/loader.js';
import { createCheck } from '../../src/integrations/github-checks.js';

// Ensure a clean config cache (no token from any previous state)
clearConfigCache();

// Capture console.warn output
const warnings: string[] = [];
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  warnings.push(args.map(String).join(' '));
};

try {
  await createCheck({
    owner: 'test-owner',
    repo: 'test-repo',
    sha: 'abc1234',
    name: 'forja/test',
    status: 'completed',
    conclusion: 'success',
    title: 'All checks passed',
    summary: 'No issues found.',
  });
  // If we get here without throwing, that's success
  console.warn = originalWarn;
  console.log('NO_THROW');
  console.log('WARNINGS:' + JSON.stringify(warnings));
} catch (err) {
  console.warn = originalWarn;
  console.error('THREW:' + String(err));
  process.exit(1);
}
