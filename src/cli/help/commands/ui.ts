import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'ui',
  description: 'Launch the Forja web UI in the browser',
  usage: 'forja ui [options]',
  examples: [
    { cmd: 'forja ui', description: 'Launch the web UI on the default port 4242' },
    { cmd: 'forja ui --port 8080', description: 'Launch the web UI on a custom port' },
  ],
  flags: [
    { name: '--port <port>', type: 'number', default: '4242', description: 'Port to listen on' },
  ],
});
