import { Command } from 'commander';
import { readVersion } from '../lib/version.js';

const version = readVersion();

const program = new Command();

program
  .name('forja')
  .description('Forja Harness Engine CLI')
  .version(version);

program.command('run').description('Run a task through the pipeline');
program.command('gate').description('Evaluate quality gates');
program.command('trace').description('Inspect execution traces');
program.command('cost').description('Show cost analysis');
program.command('resume').description('Resume a paused pipeline');
program.command('prune').description('Prune old state and artifacts');
program.command('ui').description('Launch the web UI');
program.command('infra').description('Manage infrastructure');
program.command('config').description('Manage configuration');
program.command('hook').description('Manage hooks');
program.command('schedule').description('Manage scheduled tasks');
program.command('replay').description('Replay a task execution');

program.parse();
