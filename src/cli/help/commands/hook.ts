import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'hook',
  description: 'Handle lifecycle hook events from the harness (reads JSON payload from stdin)',
  usage: 'forja hook <event-type>',
  examples: [
    { cmd: 'forja hook pre-tool-use  # reads JSON payload from stdin', description: 'Handle a pre-tool-use event (called by Claude Code hooks)' },
    { cmd: 'forja hook post-tool-use # reads JSON payload from stdin', description: 'Handle a post-tool-use event (called by Claude Code hooks)' },
    { cmd: 'forja hook stop          # reads JSON payload from stdin', description: 'Handle a stop event (called by Claude Code hooks)' },
  ],
  flags: [],
});
