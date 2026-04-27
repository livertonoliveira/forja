import fs from 'fs/promises';
import type { Migration } from './primitives.js';
import type { Logger } from '../../plugin/types.js';
import { MigrationRunner, type RunnerOptions } from './runner.js';
import { CURRENT_SCHEMA_VERSION } from '../../schemas/versioning.js';

const FRONT_MATTER_FIELD_RE = /^(\w+):\s*"(.*)"\s*$/;

function parseFrontMatter(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const match = FRONT_MATTER_FIELD_RE.exec(line);
    if (match) {
      result[match[1]] = match[2];
    }
  }
  return result;
}

function serializeFrontMatter(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k}: "${String(v)}"`)
    .join('\n');
}

export class ReportRunner extends MigrationRunner<string> {
  private readonly options: RunnerOptions;

  constructor(migrations: Migration[], options: RunnerOptions = {}) {
    super(migrations, 'report');
    this.options = options;
  }

  override async apply(filePath: string): Promise<string> {
    const logger: Logger = this.options.logger ?? {
      info: (m) => console.log(`[migrate:report] ${m}`),
      warn: (m) => console.warn(`[migrate:report] WARN ${m}`),
      error: (m) => console.error(`[migrate:report] ERROR ${m}`),
    };

    const content = await fs.readFile(filePath, 'utf-8');

    const parts = content.split('---\n');
    if (parts.length < 3) {
      throw new Error(`[report] File "${filePath}" does not contain a valid front-matter block`);
    }

    const frontMatterBlock = parts[1];
    const body = parts.slice(2).join('---\n');

    const frontMatter = parseFrontMatter(frontMatterBlock);

    const fromVersion = this.options.from ?? frontMatter['schemaVersion'];
    if (!fromVersion) {
      throw new Error(`[report] No schemaVersion found in front-matter of "${filePath}"`);
    }

    const toVersion = this.options.to ?? CURRENT_SCHEMA_VERSION;

    if (fromVersion === toVersion) {
      logger.info(`[report] "${filePath}" is already at target version ${toVersion}`);
      return filePath;
    }

    const steps = this.plan(fromVersion, toVersion);

    logger.info(`[report] Migrating "${filePath}" from ${fromVersion} to ${toVersion} (${steps.length} step(s))`);

    const migratedPayload = await this.runSteps(frontMatter, fromVersion, toVersion, logger);

    const migratedFrontMatter = migratedPayload as Record<string, unknown>;
    migratedFrontMatter['schemaVersion'] = toVersion;

    const newFrontMatterBlock = serializeFrontMatter(migratedFrontMatter);
    const newContent = `---\n${newFrontMatterBlock}\n---\n${body}`;

    if (this.options.dryRun) {
      logger.info(`[report] dryRun — would write migrated front-matter to "${filePath}"`);
      return filePath;
    }

    const tmpPath = `${filePath}.tmp`;
    await fs.writeFile(tmpPath, newContent, 'utf-8');
    await fs.rename(tmpPath, filePath);

    logger.info(`[report] Written migrated file to "${filePath}"`);

    return filePath;
  }
}
