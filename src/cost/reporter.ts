import { CostAccumulator } from './accumulator.js';

export class CostReporter {
  private accumulator = new CostAccumulator();

  async format(runId: string): Promise<string> {
    const { totalUsd, byPhase } = await this.accumulator.getTotal(runId);
    const shortId = runId.slice(0, 8);
    const lines: string[] = [`Run ${shortId} — Total: $${totalUsd.toFixed(4)}`];

    for (const [phase, { usd, tokens }] of Object.entries(byPhase)) {
      const tokensFormatted = tokens.toLocaleString('pt-BR');
      lines.push(`  ${phase.padEnd(10)} $${usd.toFixed(4)}  (${tokensFormatted} tokens)`);
    }

    return lines.join('\n');
  }
}
