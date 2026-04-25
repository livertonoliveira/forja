import type { CommandHelp } from './help/command-registry.js';

const NO_COLOR = process.env['NO_COLOR'] !== undefined || process.env['TERM'] === 'dumb';

export const termWidth = (): number => process.stdout.columns ?? 80;

function ansi(code: number, text: string): string {
  if (NO_COLOR) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

export const gold = (text: string): string => ansi(33, text);
export const white = (text: string): string => ansi(97, text);
export const gray = (text: string): string => ansi(90, text);

function wrap(text: string, maxWidth: number, indent = 0): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + (current ? 1 : 0) > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n' + ' '.repeat(indent));
}

export function formatCommandHelp(entry: CommandHelp): string {
  const w = termWidth();
  const lines: string[] = [];

  lines.push(gold('Command: ') + white(entry.name));
  lines.push(wrap(entry.description, w));
  lines.push('');

  lines.push(gold('Usage'));
  lines.push('  ' + entry.usage);
  lines.push('');

  if (entry.flags.length > 0) {
    lines.push(gold('Options'));
    const maxFlagLen = Math.max(...entry.flags.map((f) => f.name.length));
    for (const flag of entry.flags) {
      const nameCol = white(flag.name.padEnd(maxFlagLen));
      const defaultStr = flag.default ? gray(` (default: ${flag.default})`) : '';
      const descWidth = Math.max(20, w - maxFlagLen - 6);
      lines.push(`  ${nameCol}  ${wrap(flag.description, descWidth, maxFlagLen + 4)}${defaultStr}`);
    }
    lines.push('');
  }

  if (entry.examples.length > 0) {
    lines.push(gold('Examples'));
    for (const ex of entry.examples) {
      lines.push('  ' + white(ex.cmd));
      lines.push('  ' + gray(ex.description));
      lines.push('');
    }
  }

  if (entry.docsUrl) {
    lines.push(gold('Docs: ') + entry.docsUrl);
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

export function formatCommandList(registry: Map<string, CommandHelp>): string {
  const w = termWidth();
  const COL = 14;
  const lines: string[] = [];

  lines.push(gold('Available commands') + '\n');
  for (const [name, entry] of [...registry.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const nameCol = white(name.padEnd(COL));
    const descWidth = Math.max(20, w - COL - 4);
    lines.push(`  ${nameCol}  ${gray(wrap(entry.description, descWidth))}`);
  }
  lines.push('');
  lines.push(gray('Run "forja help <command>" for detailed usage.'));
  lines.push('');

  return lines.join('\n') + '\n';
}
