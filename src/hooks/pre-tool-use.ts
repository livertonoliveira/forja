import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { TraceWriter } from '../trace/writer.js';
import { UUID_RE, validateUuid } from './utils.js';
import { loadToolsPolicy, isToolAllowed } from '../policy/tools-policy.js';

// Anchored relative to this file so the hook works regardless of process.cwd().
const TOOLS_POLICY_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../policies/tools.yaml');

export async function handlePreToolUse(payload: unknown): Promise<void> {
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
  const actualModel = process.env.FORJA_MODEL;
  // FORJA_EXPECTED_MODEL is set by `forja run` alongside FORJA_MODEL before each phase starts.
  // Comparing two env vars avoids a disk read on every tool invocation.
  const expectedModel = process.env.FORJA_EXPECTED_MODEL;

  let allowed = true;
  try {
    const toolsPolicy = await loadToolsPolicy(TOOLS_POLICY_PATH);
    allowed = isToolAllowed(toolName, phase, toolsPolicy);
  } catch {
    process.stderr.write(`[forja] pre-tool-use: could not load tools policy, failing open\n`);
  }

  const writer = new TraceWriter(runId);

  if (expectedModel && actualModel !== expectedModel) {
    // Write trace before exiting so the blocked event is preserved in the audit trail.
    await writer.write({
      runId,
      eventType: 'tool_call',
      phaseId,
      agentId,
      spanId,
      payload: { tool: toolName, phase, allowed: false, model: actualModel, blockedReason: 'model_mismatch' },
    });
    process.stderr.write(
      JSON.stringify({
        decision: 'block',
        reason: actualModel
          ? `Phase '${phase}' requires model '${expectedModel}' but got '${actualModel}'. Set FORJA_MODEL=${expectedModel}.`
          : `Phase '${phase}' requires model '${expectedModel}' but FORJA_MODEL is not set. Set FORJA_MODEL=${expectedModel}.`,
      }) + '\n',
    );
    process.exit(2);
  }

  await writer.write({
    runId,
    eventType: 'tool_call',
    phaseId,
    agentId,
    spanId,
    payload: { tool: toolName, phase, allowed, model: actualModel },
  });

  if (!allowed) {
    process.stdout.write(
      JSON.stringify({ decision: 'block', reason: `Tool '${toolName}' is not allowed in phase '${phase}'` }) + '\n',
    );
    process.exit(2);
  }
}
