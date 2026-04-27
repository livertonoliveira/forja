import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'completion',
  description: 'Print shell completion script for bash, zsh, or fish',
  usage: 'forja completion <shell>',
  examples: [
    { cmd: 'forja completion bash | source /dev/stdin', description: 'Enable bash completion in the current session' },
    { cmd: 'forja completion zsh > ~/.zsh/completions/_forja', description: 'Install zsh completion permanently' },
    { cmd: 'forja completion fish > ~/.config/fish/completions/forja.fish', description: 'Install fish completion permanently' },
  ],
  flags: [],
});
