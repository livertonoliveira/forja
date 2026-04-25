import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'config',
  description: 'Manage Forja configuration (get or set key-value pairs)',
  usage: 'forja config <action> [key] [value]',
  examples: [
    { cmd: 'forja config get store_url', description: 'Get the current store URL' },
    { cmd: 'forja config get github_token', description: 'Get the configured GitHub token' },
    { cmd: 'forja config set store_url postgres://localhost/forja', description: 'Set the database store URL' },
    { cmd: 'forja config set slack_webhook_url https://hooks.slack.com/...', description: 'Set the Slack webhook URL' },
  ],
  flags: [],
});
