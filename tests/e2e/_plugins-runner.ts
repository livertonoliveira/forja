/**
 * Minimal runner for `plugins` command — used only by e2e tests.
 *
 * Avoids importing src/cli/index.ts, which requires __FORJA_VERSION__
 * to be defined at build time (esbuild injection) and is not available
 * when running under tsx directly.
 */

import { pluginsCommand } from '../../src/cli/commands/plugins.js';

pluginsCommand.parse(['node', 'plugins', ...process.argv.slice(2)]);
