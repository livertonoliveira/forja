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

  let allowed = true;
  try {
    const toolsPolicy = await loadToolsPolicy(TOOLS_POLICY_PATH);
    allowed = isToolAllowed(toolName, phase, toolsPolicy);
  } catch {
    process.stderr.write(`[forja] pre-tool-use: could not load tools policy, failing open\n`);
  }

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
      JSON.stringify({ decision: 'block', reason: `Tool '${toolName}' is not allowed in phase '${phase}'` }) + '\n',
    );
    process.exit(2);
  }
}
