import { Command } from 'commander';
import { spawn, execFile } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_DIR = resolve(__dirname, '../../../apps/ui');
const STANDALONE_SERVER = resolve(UI_DIR, '.next/standalone/server.js');

const PORT_RE = /^\d{1,5}$/;

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  execFile(cmd, [url], (err) => {
    if (err) process.stderr.write(`[forja] could not open browser automatically. Visit ${url} manually.\n`);
  });
}

export const uiCommand = new Command('ui')
  .description('Launch the Forja web UI in the browser')
  .option('--port <port>', 'port to listen on', '4242')
  .action((options: { port: string }) => {
    const { port } = options;
    if (!PORT_RE.test(port) || Number(port) < 1 || Number(port) > 65535) {
      process.stderr.write('[forja] ui: --port must be a valid port number (1-65535)\n');
      process.exit(1);
    }

    if (!existsSync(STANDALONE_SERVER)) {
      process.stderr.write('[forja] UI build not found. This is a bug — please report it at https://github.com/livertonoliveira/forja/issues\n');
      process.exit(1);
    }

    const url = `http://localhost:${port}`;
    process.stdout.write(`[forja] starting UI at ${url}\n`);

    const child = spawn(process.execPath, [STANDALONE_SERVER], {
      cwd: UI_DIR,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, PORT: port, HOSTNAME: '0.0.0.0' },
    });

    let browserOpened = false;

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text);
      if (!browserOpened && (text.includes('ready') || text.includes('started server') || text.includes('Listening'))) {
        browserOpened = true;
        openBrowser(url);
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
    });

    child.on('exit', (code) => {
      process.exit(code ?? 0);
    });

    process.once('SIGINT', () => { child.kill('SIGINT'); });
    process.once('SIGTERM', () => { child.kill('SIGTERM'); });
  });
