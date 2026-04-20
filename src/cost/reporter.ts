import { CostAccumulator } from './accumulator.js';

export class CostReporter {
  private accumulator = new CostAccumulator();

  async format(runId: string): Promise<string> {
    const { totalUsd, byPhase } = await this.accumulator.getTotal(runId);
    const shortId = runId.slice(0, 8);
    const lines: string[] = [`Run ${shortId} — Total: $${totalUsd.toFixed(4)}`];

    for (const [phase, { usd, tokens, cacheCreationTokens, cacheReadTokens }] of Object.entries(byPhase)) {
      const tokensFormatted = tokens.toLocaleString('pt-BR');
      const cacheInfo = (cacheCreationTokens > 0 || cacheReadTokens > 0)
        ? `  cache: ${cacheCreationTokens.toLocaleString('pt-BR')} write / ${cacheReadTokens.toLocaleString('pt-BR')} read`
        : '';
      lines.push(`  ${phase.padEnd(10)} $${usd.toFixed(4)}  (${tokensFormatted} tokens${cacheInfo})`);
    }

    return lines.join('\n');
  }
}
