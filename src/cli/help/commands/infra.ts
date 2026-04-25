import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'infra',
  description: 'Manage local infrastructure services via Docker Compose',
  usage: 'forja infra <action>',
  examples: [
    { cmd: 'forja infra up', description: 'Start all local infrastructure services (PostgreSQL, etc.)' },
    { cmd: 'forja infra down', description: 'Stop all local infrastructure services' },
    { cmd: 'forja infra status', description: 'Show the running status of infrastructure services' },
  ],
  flags: [],
});
