export interface CommandFlag {
  name: string;
  type: string;
  default?: string;
  description: string;
}

export interface CommandExample {
  cmd: string;
  description: string;
}

export interface CommandHelp {
  name: string;
  description: string;
  usage: string;
  examples: CommandExample[];
  flags: CommandFlag[];
  docsUrl?: string;
}

export const commandRegistry = new Map<string, CommandHelp>();

export function registerCommand(help: CommandHelp): void {
  commandRegistry.set(help.name, help);
}
