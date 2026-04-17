import { Command } from 'commander';
import { handlePostToolUse } from '../../hooks/index.js';

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
      let parsed: unknown = undefined;
      if (raw.trim()) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          process.stderr.write('[forja] hook received invalid JSON on stdin\n');
          process.exit(1);
        }
      }

      if (eventType === 'post-tool-use') {
        handlePostToolUse(parsed ?? {})
          .then(() => process.exit(0))
          .catch((err: Error) => {
            process.stderr.write(`[forja] post-tool-use error: ${err.message}\n`);
            process.exit(1);
          });
      }
    });
    process.stdin.resume();
  });
