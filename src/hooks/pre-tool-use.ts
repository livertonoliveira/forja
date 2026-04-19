import { TraceWriter } from '../trace/writer.js';
import { UUID_RE, validateUuid } from './utils.js';

export async function handlePreToolUse(payload: unknown): Promise<void> {
  // Allowlist enforcement is a stub until M2.4 (policies/tools.yaml).
  // Log explicitly so deployments are not silently misconfigured.
  process.stderr.write('[forja] WARNING: tool allowlist not enforced (stub — M2.4)\n');

  const raw = payload as Record<string, unknown>;
  const toolName = typeof raw?.tool_name === 'string' ? raw.tool_name : 'unknown';

  const runId = process.env.FORJA_RUN_ID;
  if (!runId || !UUID_RE.test(runId)) {
    process.stderr.write('[forja] pre-tool-use: FORJA_RUN_ID is missing or not a UUID, skipping\n');
    return;
  }

  const phase = process.env.FORJA_PHASE ?? 'unknown';
  const phaseId = validateUuid(process.env.FORJA_PHASE_ID);
  const agentId = validateUuid(process.env.FORJA_AGENT_ID);
  const spanId = process.env.FORJA_SPAN_ID;

  const allowed = checkAllowlist(toolName);

  const writer = new TraceWriter(runId);
  await writer.write({
    runId,
    eventType: 'tool_call',
    phaseId,
    agentId,
    spanId,
    payload: { tool: toolName, phase, allowed },
  });

  if (!allowed) {
    process.stdout.write(
      JSON.stringify({ decision: 'block', reason: `tool "${toolName}" is not in the allowlist` }) + '\n',
    );
    process.exit(2);
  }
}

function checkAllowlist(_toolName: string): boolean {
  // Always allow until policies/tools.yaml enforcement is implemented in M2.4
  return true;
}
