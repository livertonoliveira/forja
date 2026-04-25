import { Command } from 'commander';
import { generateBashCompletion, generateZshCompletion, generateFishCompletion } from '../completion.js';

const SUPPORTED_SHELLS = ['bash', 'zsh', 'fish'] as const;
type Shell = (typeof SUPPORTED_SHELLS)[number];

const installInstructions: Record<Shell, string> = {
  bash: [
    '# To install permanently, add to ~/.bashrc or ~/.bash_profile:',
    'eval "$(forja completion bash)"',
  ].join('\n'),
  zsh: [
    '# To install permanently:',
    '#   mkdir -p ~/.zsh/completions',
    '#   forja completion zsh > ~/.zsh/completions/_forja',
    '#   Add to ~/.zshrc: fpath=(~/.zsh/completions $fpath) && autoload -Uz compinit && compinit',
  ].join('\n'),
  fish: [
    '# To install permanently:',
    '#   forja completion fish > ~/.config/fish/completions/forja.fish',
  ].join('\n'),
};

const generators: Record<Shell, () => string> = {
  bash: generateBashCompletion,
  zsh: generateZshCompletion,
  fish: generateFishCompletion,
};

export const completionCommand = new Command('completion')
  .description('Print shell completion script for bash, zsh, or fish')
  .argument('<shell>', 'target shell: bash | zsh | fish')
  .action((shell: string) => {
    if (!(SUPPORTED_SHELLS as readonly string[]).includes(shell)) {
      process.stderr.write(`[forja] completion: unsupported shell "${shell}"\n`);
      process.stderr.write(`Supported shells: ${SUPPORTED_SHELLS.join(', ')}\n`);
      process.exit(1);
    }
    const s = shell as Shell;
    process.stdout.write(generators[s]());
    process.stderr.write(`\n${installInstructions[s]}\n`);
  });
