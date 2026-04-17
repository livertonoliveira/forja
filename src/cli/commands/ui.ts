import { Command } from 'commander';

export const uiCommand = new Command('ui')
  .description('Launch the Forja web UI in the browser')
  .option('--port <port>', 'port to listen on', '3737')
  .action((_options: { port: string }) => {
    console.log('[forja] ui — ainda não implementado');
  });
