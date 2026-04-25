import { registerCommand } from '../command-registry.js'

registerCommand({
  name: 'doctor',
  description: 'Run installation diagnostics and health checks',
  usage: 'forja doctor [options]',
  examples: [
    { cmd: 'forja doctor', description: 'Run all checks and display results' },
    { cmd: 'forja doctor --json', description: 'Output results as JSON' },
  ],
  flags: [
    { name: '--json', type: 'boolean', description: 'Output results as JSON' },
  ],
})
