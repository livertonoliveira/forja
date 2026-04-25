import { commandRegistry } from './help/index.js';

export function generateBashCompletion(): string {
  const names = Array.from(commandRegistry.keys()).join(' ');
  return `_forja_completion() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local commands="${names}"
  COMPREPLY=(\$(compgen -W "\${commands}" -- "\${cur}"))
}
complete -F _forja_completion forja
`;
}

export function generateZshCompletion(): string {
  const entries = Array.from(commandRegistry.entries());
  const commandList = entries
    .map(([name, entry]) => {
      const safeName = name.replace(/'/g, '').replace(/:/g, ' ');
      const safeDesc = entry.description.replace(/'/g, '').replace(/:/g, ' ');
      return `    '${safeName}:${safeDesc}'`;
    })
    .join('\n');
  return `#compdef forja
_forja() {
  local -a commands
  commands=(
${commandList}
  )
  _describe 'command' commands
}
compdef _forja forja
`;
}

export function generateFishCompletion(): string {
  const entries = Array.from(commandRegistry.entries());
  const allNames = entries.map(([name]) => name).join(' ');
  const lines = entries
    .map(([name, entry]) => {
      const desc = entry.description.replace(/'/g, "\\'");
      return `complete -c forja -n 'not __fish_seen_subcommand_from ${allNames}' -a "${name}" -d '${desc}'`;
    })
    .join('\n');
  return `complete -c forja -f
${lines}
`;
}
