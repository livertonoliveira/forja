import { Command } from 'commander';
import { checkDockerAvailable, composeDown, composeStatus, composeUp, waitForHealthy } from '../../infra/docker.js';
import { runMigrations } from '../../store/drizzle/migrations.js';
import { loadConfig, redactDsn } from '../../config/loader.js';

const ALLOWED_ACTIONS = ['up', 'down', 'status'] as const;
type Action = (typeof ALLOWED_ACTIONS)[number];

export const infraCommand = new Command('infra')
  .description('Manage local infrastructure services (up, down, status)')
  .argument('<action>', `action to perform: ${ALLOWED_ACTIONS.join(', ')}`)
  .action(async (action: string) => {
    if (!ALLOWED_ACTIONS.includes(action as Action)) {
      console.error(`Unknown action: ${action}. Use: ${ALLOWED_ACTIONS.join(', ')}`);
      process.exit(1);
    }

    try {
      await checkDockerAvailable();
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }

    const { storeUrl: connectionString } = await loadConfig();

    try {
      if (action === 'up') {
        console.log('Starting Postgres...');
        await composeUp();
        await waitForHealthy('postgres');
        console.log('Running migrations...');
        await runMigrations(connectionString);
        console.log(`Postgres ready at ${redactDsn(connectionString)}`);
      } else if (action === 'down') {
        await composeDown();
        console.log('Postgres stopped.');
      } else if (action === 'status') {
        const output = await composeStatus();
        console.log(output || 'No services running.');
      }
    } catch (err) {
      console.error(`Error running infra ${action}: ${(err as Error).message}`);
      process.exit(1);
    }
  });
