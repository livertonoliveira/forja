/**
 * Minimal runner for `replay` command — used only by e2e tests.
 *
 * Avoids importing src/cli/index.ts, which requires __FORJA_VERSION__
 * to be defined at build time (esbuild injection) and is not available
 * when running under tsx directly.
 */

import { replayCommand } from '../../src/cli/commands/replay.js';

// Parse only the args passed to this script (argv[2..])
replayCommand.parse(['node', 'replay', ...process.argv.slice(2)]);
