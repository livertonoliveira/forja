import { expectType, expectError } from 'tsd';
import type { Command, CommandContext, CommandResult, Phase, PhaseContext, PhaseResult } from '../../src/plugin/index.js';

// Command interface is assignable to { id: string; description: string }
declare const cmd: Command;
expectType<string>(cmd.id);
expectType<string>(cmd.description);

// Concrete Command implementation compiles
const myCommand: Command = {
  id: 'forja:custom-check',
  description: 'My custom check',
  labels: ['custom'],
  run: async (ctx: CommandContext): Promise<CommandResult> => {
    return { exitCode: 0, summary: 'ok' };
  },
};
expectType<Command>(myCommand);

// Concrete Phase implementation compiles
const myPhase: Phase = {
  id: 'custom:lint',
  insertAfter: 'build',
  timeoutMs: 30000,
  run: async (ctx: PhaseContext): Promise<PhaseResult> => {
    return { status: 'pass', outputs: { lintErrors: 0 } };
  },
};
expectType<Phase>(myPhase);

// PhaseResult status is strictly typed
declare const result: PhaseResult;
expectType<'pass' | 'warn' | 'fail'>(result.status);
