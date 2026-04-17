import { Command } from 'commander';

export const configCommand = new Command('config')
  .description('Manage Forja configuration')
  .argument('<action>', 'action to perform: get or set')
  .argument('[key]', 'configuration key')
  .argument('[value]', 'configuration value')
  .action((_action: string, _key?: string, _value?: string) => {
    console.log('[forja] config — ainda não implementado');
  });
