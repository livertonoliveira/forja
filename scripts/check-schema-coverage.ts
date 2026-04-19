import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
const schemasDir = path.join(projectRoot, 'src', 'schemas');
const srcDir = path.join(projectRoot, 'src');

async function discoverSchemas(): Promise<string[]> {
  const entries = await fs.promises.readdir(schemasDir, { withFileTypes: true });
  const schemaNames: string[] = [];
  const schemaPattern = /^export const (\w+(?:Schema|Enum))\b/gm;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const content = await fs.promises.readFile(path.join(schemasDir, entry.name), 'utf-8');
    let match: RegExpExecArray | null;
    while ((match = schemaPattern.exec(content)) !== null) {
      schemaNames.push(match[1]);
    }
    schemaPattern.lastIndex = 0;
  }

  return schemaNames;
}

async function collectSourceFiles(): Promise<string[]> {
  const entries = await fs.promises.readdir(srcDir, { withFileTypes: true, recursive: true } as Parameters<typeof fs.promises.readdir>[1]);
  const files: string[] = [];

  // Node 20 adds parentPath; older types expose it as path — cast covers both
  type DirentWithPath = fs.Dirent & { parentPath?: string; path?: string };
  for (const entry of entries as DirentWithPath[]) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const dir = entry.parentPath ?? entry.path ?? srcDir;
    const fullPath = path.join(dir, entry.name);
    if (fullPath.startsWith(schemasDir + path.sep) || fullPath === schemasDir) continue;
    files.push(fullPath);
  }

  return files;
}

async function findUsages(schemaNames: string[], sourceFiles: string[]): Promise<Map<string, string>> {
  const coverage = new Map<string, string>();

  const fileContents = await Promise.all(
    sourceFiles.map(async file => ({ file, content: await fs.promises.readFile(file, 'utf-8') })),
  );

  for (const { file, content } of fileContents) {
    for (const name of schemaNames) {
      if (coverage.has(name)) continue;
      if (content.includes(`${name}.parse(`) || content.includes(`${name}.safeParse(`)) {
        coverage.set(name, path.relative(projectRoot, file));
      }
    }
  }

  return coverage;
}

async function main(): Promise<void> {
  const schemaNames = await discoverSchemas();
  const sourceFiles = await collectSourceFiles();
  const coverage = await findUsages(schemaNames, sourceFiles);

  const maxLen = Math.max(...schemaNames.map((n) => n.length));

  process.stdout.write('Schema Coverage Report\n');
  process.stdout.write('======================\n');

  let hasUncovered = false;

  for (const name of schemaNames) {
    const location = coverage.get(name);
    if (location) {
      process.stdout.write(`✓ ${name.padEnd(maxLen)}   ${location}\n`);
    } else {
      process.stdout.write(`✗ ${name.padEnd(maxLen)}   (no coverage)\n`);
      hasUncovered = true;
    }
  }

  process.exit(hasUncovered ? 1 : 0);
}

main();
