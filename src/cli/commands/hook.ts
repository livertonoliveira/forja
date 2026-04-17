import { Command } from 'commander';

export const hookCommand = new Command('hook')
  .description('Handle lifecycle hook events from the harness')
  .argument('<event-type>', 'hook event type: pre-tool-use, post-tool-use, or stop')
  .action((eventType: string) => {
    const MAX_STDIN_BYTES = 10 * 1024 * 1024;
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('error', (err) => {
      process.stderr.write(`[forja] hook stdin error: ${err.message}\n`);
      process.exit(1);
    });
    process.stdin.on('data', (chunk: string) => {
      raw += chunk;
      if (Buffer.byteLength(raw) > MAX_STDIN_BYTES) {
        process.stderr.write('[forja] hook stdin payload exceeds 10 MB limit\n');
        process.exit(1);
      }
    });
    process.stdin.on('end', () => {
      if (raw.trim()) {
        try {
          JSON.parse(raw);
        } catch {
          process.stderr.write('[forja] hook received invalid JSON on stdin\n');
          process.exit(1);
        }
      }
      console.log(`[forja] hook ${eventType} — ainda não implementado`);
    });
    process.stdin.resume();
  });
