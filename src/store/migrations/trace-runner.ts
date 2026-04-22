import fs from 'fs/promises';
import path from 'path';
import type { Migration } from './primitives.js';
import type { Logger } from '../../plugin/types.js';
import { MigrationRunner, type RunnerOptions } from './runner.js';
import { CURRENT_SCHEMA_VERSION } from '../../schemas/versioning.js';

export class TraceRunner extends MigrationRunner<string> {
  private readonly options: RunnerOptions;

  constructor(migrations: Migration[], options: RunnerOptions = {}) {
    super(migrations, 'trace');
    this.options = options;
  }

  override async apply(filePath: string): Promise<string> {
    const logger: Logger = this.options.logger ?? {
      info: (m) => console.log(`[migrate:trace] ${m}`),
      warn: (m) => console.warn(`[migrate:trace] WARN ${m}`),
      error: (m) => console.error(`[migrate:trace] ERROR ${m}`),
    };

    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
      throw new Error(`[trace] File "${path.basename(filePath)}" is empty or contains no lines`);
    }

    let header: Record<string, unknown>;
    try {
      header = JSON.parse(lines[0]) as Record<string, unknown>;
    } catch {
      throw new Error(`[trace] File "${path.basename(filePath)}" has an invalid first line (not valid JSON)`);
    }

    if (header['type'] !== 'header' || typeof header['schemaVersion'] !== 'string') {
      throw new Error(
        `[trace] File "${path.basename(filePath)}" is missing a valid header (expected type="header" with schemaVersion)`,
      );
    }

    const headerVersion = header['schemaVersion'] as string;
    const fromVersion = this.options.from ?? headerVersion;
    const toVersion = this.options.to ?? CURRENT_SCHEMA_VERSION;

    if (fromVersion === toVersion) {
      logger.info(`[trace] "${path.basename(filePath)}" is already at target version ${toVersion}, nothing to do`);
      return filePath;
    }

    const steps = this.plan(fromVersion, toVersion);

    logger.info(`[trace] Migrating "${path.basename(filePath)}" from ${fromVersion} to ${toVersion} (${steps.length} step(s))`);

    const eventLines = lines.slice(1);
    const migratedEventLines: string[] = [];

    for (let i = 0; i < eventLines.length; i++) {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(eventLines[i]) as Record<string, unknown>;
      } catch {
        throw new Error(
          `[trace] File "${path.basename(filePath)}" contains an invalid JSON line at line ${i + 2}`,
        );
      }

      const payload = event['payload'];
      const migratedPayload = await this.applySteps(payload, fromVersion, steps, logger);

      const migratedEvent = { ...event, schemaVersion: toVersion, payload: migratedPayload };
      migratedEventLines.push(JSON.stringify(migratedEvent));
    }

    const migratedHeader = { ...header, schemaVersion: toVersion };
    const newLines = [JSON.stringify(migratedHeader), ...migratedEventLines];
    const newContent = newLines.join('\n') + '\n';

    if (this.options.dryRun) {
      logger.info(`[trace] dryRun — would write migrated trace to "${path.basename(filePath)}"`);
      return filePath;
    }

    const tmpPath = `${filePath}.tmp`;
    await fs.writeFile(tmpPath, newContent, 'utf-8');
    await fs.rename(tmpPath, filePath);

    logger.info(`[trace] Written migrated file to "${path.basename(filePath)}"`);

    return filePath;
  }
}
