/**
 * Minimal runner for `prune` command — used only by e2e tests.
 *
 * Avoids importing src/cli/index.ts, which requires __FORJA_VERSION__
 * to be defined at build time (esbuild injection) and is not available
 * when running under tsx directly.
 */

import { pruneCommand } from '../../src/cli/commands/prune.js';

pruneCommand.parse(['node', 'prune', ...process.argv.slice(2)]);
