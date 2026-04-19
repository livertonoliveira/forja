import { describe, it, expect, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { fingerprintCommand, fingerprintAllCommands } from '../fingerprint.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir(): Promise<string> {
  // Must be inside process.cwd() due to root boundary check in fingerprintAllCommands
  const dir = join(process.cwd(), '.tmp-fp-test', `forja-fp-test-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

const dirsToClean: string[] = [];

afterAll(async () => {
  await Promise.all(dirsToClean.map((d) => rm(d, { recursive: true, force: true })));
  // Clean up the parent .tmp-fp-test dir if empty
  try {
    await rm(join(process.cwd(), '.tmp-fp-test'), { recursive: true, force: true });
  } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// fingerprintCommand
// ---------------------------------------------------------------------------

describe('fingerprintCommand', () => {
  it('returns a 32-char hex string', async () => {
    const dir = await makeTmpDir();
    dirsToClean.push(dir);
    const file = join(dir, 'cmd.md');
    await writeFile(file, 'hello world');

    const result = await fingerprintCommand(file);

    expect(result).toMatch(/^[0-9a-f]{32}$/);
  });

  it('fingerprint changes when file content changes', async () => {
    const dir = await makeTmpDir();
    dirsToClean.push(dir);

    const fileA = join(dir, 'a.md');
    const fileB = join(dir, 'b.md');
    await writeFile(fileA, 'content version A');
    await writeFile(fileB, 'content version B');

    const fpA = await fingerprintCommand(fileA);
    const fpB = await fingerprintCommand(fileB);

    expect(fpA).not.toBe(fpB);
  });

  it('same content always produces the same fingerprint (determinism)', async () => {
    const dir = await makeTmpDir();
    dirsToClean.push(dir);

    const file1 = join(dir, 'c1.md');
    const file2 = join(dir, 'c2.md');
    const content = 'deterministic content';
    await writeFile(file1, content);
    await writeFile(file2, content);

    const fp1 = await fingerprintCommand(file1);
    const fp2 = await fingerprintCommand(file2);

    expect(fp1).toBe(fp2);
  });

  it('calling the same file twice returns identical fingerprints', async () => {
    const dir = await makeTmpDir();
    dirsToClean.push(dir);
    const file = join(dir, 'stable.md');
    await writeFile(file, 'stable content');

    const first = await fingerprintCommand(file);
    const second = await fingerprintCommand(file);

    expect(first).toBe(second);
  });

  it('empty file produces a 32-char hex fingerprint', async () => {
    const dir = await makeTmpDir();
    dirsToClean.push(dir);
    const file = join(dir, 'empty.md');
    await writeFile(file, '');

    const result = await fingerprintCommand(file);

    expect(result).toMatch(/^[0-9a-f]{32}$/);
  });
});

// ---------------------------------------------------------------------------
// fingerprintAllCommands
// ---------------------------------------------------------------------------

describe('fingerprintAllCommands', () => {
  it('returns a Record with one key per .md file in the directory', async () => {
    const dir = await makeTmpDir();
    dirsToClean.push(dir);
    await writeFile(join(dir, 'alpha.md'), 'alpha');
    await writeFile(join(dir, 'beta.md'), 'beta');
    await writeFile(join(dir, 'gamma.md'), 'gamma');

    const result = await fingerprintAllCommands(dir);

    expect(Object.keys(result).sort()).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('each value is a 32-char hex string', async () => {
    const dir = await makeTmpDir();
    dirsToClean.push(dir);
    await writeFile(join(dir, 'cmd1.md'), 'content 1');
    await writeFile(join(dir, 'cmd2.md'), 'content 2');

    const result = await fingerprintAllCommands(dir);

    for (const fp of Object.values(result)) {
      expect(fp).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it('ignores non-.md files', async () => {
    const dir = await makeTmpDir();
    dirsToClean.push(dir);
    await writeFile(join(dir, 'command.md'), 'markdown');
    await writeFile(join(dir, 'script.sh'), 'bash');
    await writeFile(join(dir, 'config.json'), '{}');

    const result = await fingerprintAllCommands(dir);

    expect(Object.keys(result)).toEqual(['command']);
  });

  it('returns an empty object when the directory has no .md files', async () => {
    const dir = await makeTmpDir();
    dirsToClean.push(dir);
    await writeFile(join(dir, 'readme.txt'), 'text');

    const result = await fingerprintAllCommands(dir);

    expect(result).toEqual({});
  });

  it('uses the basename (without extension) as the key', async () => {
    const dir = await makeTmpDir();
    dirsToClean.push(dir);
    await writeFile(join(dir, 'my-command.md'), 'body');

    const result = await fingerprintAllCommands(dir);

    expect(result).toHaveProperty('my-command');
    expect(result).not.toHaveProperty('my-command.md');
  });

  it('fingerprints differ for files with different content', async () => {
    const dir = await makeTmpDir();
    dirsToClean.push(dir);
    await writeFile(join(dir, 'x.md'), 'content x');
    await writeFile(join(dir, 'y.md'), 'content y');

    const result = await fingerprintAllCommands(dir);

    expect(result['x']).not.toBe(result['y']);
  });
});
