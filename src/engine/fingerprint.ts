import { createHash } from 'crypto';
import { readdir, readFile } from 'fs/promises';
import { join, extname, resolve } from 'path';

export async function fingerprintCommand(commandPath: string, signal?: AbortSignal): Promise<string> {
  const content = await readFile(commandPath, { encoding: 'utf8', signal });
  return createHash('sha256').update(content).digest('hex').slice(0, 32);
}

export async function fingerprintAllCommands(commandsDir: string): Promise<Record<string, string>> {
  const projectRoot = resolve(process.cwd());
  const resolvedDir = resolve(commandsDir);
  if (!resolvedDir.startsWith(projectRoot)) {
    throw new Error('commandsDir must be within the project root');
  }

  const entries = await readdir(commandsDir, { recursive: true });
  const mdFiles = (entries as string[]).filter((f) => extname(f) === '.md');
  const results = await Promise.all(
    mdFiles.map(async (file) => {
      const key = file.replace(/\.md$/, '');
      const fingerprint = await fingerprintCommand(join(commandsDir, file));
      return [key, fingerprint] as [string, string];
    }),
  );
  return Object.fromEntries(results);
}
