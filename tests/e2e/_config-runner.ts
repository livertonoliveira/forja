/**
 * Minimal runner for `config` command — used only by e2e tests.
 *
 * Avoids importing src/cli/index.ts which requires __FORJA_VERSION__
 * to be defined at build time (esbuild injection) and is not available
 * when running under tsx directly.
 */

import { configCommand } from '../../src/cli/commands/config.js';

// Parse only the args passed to this script (argv[2..])
configCommand.parse(['node', 'config', ...process.argv.slice(2)]);
