import { completionCommand } from '../../src/cli/commands/completion.js';

completionCommand.parse(['node', 'completion', ...process.argv.slice(2)]);
