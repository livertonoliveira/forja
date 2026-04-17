import { Command } from 'commander';

export const infraCommand = new Command('infra')
  .description('Manage local infrastructure services (up, down, status)')
  .argument('<action>', 'action to perform: up, down, or status')
  .action((action: string) => {
    console.log(`[forja] infra ${action} — ainda não implementado`);
  });
