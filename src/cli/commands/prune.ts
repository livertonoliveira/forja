import { Command } from 'commander';
import { loadConfig } from '../../config/loader.js';
import { DrizzlePostgresStore } from '../../store/drizzle/adapter.js';
import { pruneRuns } from '../../store/retention.js';

export const pruneCommand = new Command('prune')
  .description('Remove old runs and artifacts from local storage')
  .option('--before <date>', 'delete runs created before this ISO date')
  .option('--dry-run', 'show what would be deleted without removing anything')
  .action(async (options) => {
    const config = await loadConfig();
    const store = new DrizzlePostgresStore(config.storeUrl);

    let beforeDate: Date;
    if (options.before) {
      beforeDate = new Date(options.before);
      if (isNaN(beforeDate.getTime())) {
        console.error(`[forja] Data inválida: ${options.before}`);
        process.exit(1);
      }
    } else {
      const days = config.retentionDays ?? 90;
      beforeDate = new Date();
      beforeDate.setDate(beforeDate.getDate() - days);
    }

    const isDryRun = !!options.dryRun;

    if (isDryRun) {
      console.log(`[forja] Dry run — runs que seriam deletados antes de ${beforeDate.toISOString().split('T')[0]}:`);
    }

    try {
      const result = await pruneRuns(store, { beforeDate, dryRun: isDryRun });

      if (isDryRun) {
        console.log(`[forja] ${result.deletedRuns} run(s) seriam removidos, liberando ~${formatBytes(result.freedBytes)}`);
      } else {
        console.log(`[forja] Prunado ${result.deletedRuns} runs, liberado ${formatBytes(result.freedBytes)}`);
        if (result.deletedRuns > 0) {
          console.log(`\nDica: Execute \`forja schedule prune --cron "0 2 * * 0"\` para automatizar a limpeza semanal.`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[forja] Erro ao executar prune: ${message}`);
      process.exit(1);
    } finally {
      await store.close().catch(() => {});
    }
  });

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
