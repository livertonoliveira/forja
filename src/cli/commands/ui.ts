import { Command } from 'commander';
import { spawn, execFile } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_DIR = resolve(__dirname, '../../../apps/ui');

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
  .option('--dev', 'run in development mode', false)
  .action((options: { port: string; dev: boolean }) => {
    const { port, dev } = options;
    if (!PORT_RE.test(port) || Number(port) < 1 || Number(port) > 65535) {
      process.stderr.write('[forja] ui: --port must be a valid port number (1-65535)\n');
      process.exit(1);
    }
    const url = `http://localhost:${port}`;
    const nextBin = resolve(UI_DIR, 'node_modules/.bin/next');
    const args = dev ? ['dev', '--port', port] : ['start', '--port', port];

    process.stdout.write(`[forja] starting UI at ${url} (${dev ? 'dev' : 'production'} mode)\n`);

    const child = spawn(nextBin, args, {
      cwd: UI_DIR,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let browserOpened = false;

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text);
      if (!browserOpened && (text.includes('ready') || text.includes('started server') || text.includes('Local:'))) {
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

    process.once('SIGINT', () => {
      child.kill('SIGINT');
    });

    process.once('SIGTERM', () => {
      child.kill('SIGTERM');
    });
  });
