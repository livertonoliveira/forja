import { Command } from 'commander';
import { handlePostToolUse, handlePreToolUse, handleStop } from '../../hooks/index.js';

function safeMessage(err: Error): string {
  return err.message.replace(/[^\x20-\x7E\n]/g, '?');
}

export const hookCommand = new Command('hook')
  .description('Handle lifecycle hook events from the harness')
  .argument('<event-type>', 'hook event type: pre-tool-use, post-tool-use, or stop')
  .action((eventType: string) => {
    const MAX_STDIN_BYTES = 10 * 1024 * 1024;
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('error', (err) => {
      process.stderr.write(`[forja] hook stdin error: ${safeMessage(err)}\n`);
      process.exit(1);
    });
    process.stdin.on('data', (chunk: string) => {
      raw += chunk;
      if (Buffer.byteLength(raw) > MAX_STDIN_BYTES) {
        process.stderr.write('[forja] hook stdin payload exceeds 10 MB limit\n');
        process.exit(1);
      }
    });
    // stdin must be fully consumed before dispatching — async/await cannot wrap this boundary
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
            process.stderr.write(`[forja] post-tool-use error: ${safeMessage(err)}\n`);
            process.exit(1);
          });
      } else if (eventType === 'pre-tool-use') {
        handlePreToolUse(parsed ?? {})
          .then(() => process.exit(0))
          .catch((err: Error) => {
            process.stderr.write(`[forja] pre-tool-use error: ${safeMessage(err)}\n`);
            process.exit(1);
          });
      } else if (eventType === 'stop') {
        handleStop(parsed ?? {})
          .then(() => process.exit(0))
          .catch((err: Error) => {
            process.stderr.write(`[forja] stop error: ${safeMessage(err)}\n`);
            process.exit(1);
          });
      } else {
        process.stderr.write(`[forja] hook: unknown event type "${eventType}"\n`);
        process.exit(1);
      }
    });
    process.stdin.resume();
  });
