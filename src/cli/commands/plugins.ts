import { Command } from 'commander';
import { PluginRegistry, detectPluginTypes } from '../../plugin/registry.js';

const COL_ID = 'ID';
const COL_TYPE = 'Type';
const COL_VERSION = 'Version';
const COL_SOURCE = 'Source';
const COL_PATH = 'Path';

const listCommand = new Command('list')
  .description('List registered plugins with version and source')
  .option('--json', 'output as JSON')
  .option('--invalid', 'show plugins that failed validation')
  .action(async (opts: { json?: boolean; invalid?: boolean }) => {
    if (opts.invalid) {
      console.log('No invalid plugin tracking available. Check stderr output during bootstrap for warnings.');
      return;
    }

    const registry = new PluginRegistry();
    try {
      await registry.bootstrap({ cwd: process.cwd() });
    } catch (err) {
      console.error(`[forja] Plugin bootstrap failed: ${String(err)}`);
      process.exit(1);
    }

    const plugins = registry.list();

    if (opts.json) {
      const output = plugins.map(({ module: _module, ...rest }) => rest);
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    if (plugins.length === 0) {
      console.log('No plugins registered.');
      return;
    }

    const rows = plugins.map(p => ({
      id: p.id,
      type: detectPluginTypes(p).join(', '),
      version: p.version,
      source: p.source,
      path: p.path,
    }));

    const widthId = Math.max(COL_ID.length, ...rows.map(r => r.id.length));
    const widthType = Math.max(COL_TYPE.length, ...rows.map(r => r.type.length));
    const widthVersion = Math.max(COL_VERSION.length, ...rows.map(r => r.version.length));
    const widthSource = Math.max(COL_SOURCE.length, ...rows.map(r => r.source.length));
    const widthPath = Math.max(COL_PATH.length, ...rows.map(r => r.path.length));

    const sep = `${'-'.repeat(widthId + 2)}-${'-'.repeat(widthType + 2)}-${'-'.repeat(widthVersion + 2)}-${'-'.repeat(widthSource + 2)}-${'-'.repeat(widthPath + 2)}`;

    console.log(
      `${COL_ID.padEnd(widthId)}  ${COL_TYPE.padEnd(widthType)}  ${COL_VERSION.padEnd(widthVersion)}  ${COL_SOURCE.padEnd(widthSource)}  ${COL_PATH}`,
    );
    console.log(sep);
    for (const row of rows) {
      console.log(
        `${row.id.padEnd(widthId)}  ${row.type.padEnd(widthType)}  ${row.version.padEnd(widthVersion)}  ${row.source.padEnd(widthSource)}  ${row.path}`,
      );
    }
  });

export const pluginsCommand = new Command('plugins')
  .description('Manage Forja plugins')
  .addCommand(listCommand);
