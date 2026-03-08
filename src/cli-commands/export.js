/**
 * CLI command: autoshell export
 *
 * Reads all task metadata and reconstructs a YAML config file.
 * Useful for backup and sharing configurations.
 */

import { writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import YAML from 'yaml';
import { loadAllMeta } from '../utils/metadata.js';

/**
 * Register the export command with commander program.
 */
export function registerExportCommand(program) {
  program
    .command('export')
    .description('Export installed tasks to YAML config')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .action(async (options) => {
      try {
        await runExport(options);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * Export all installed tasks as YAML.
 */
async function runExport(options) {
  const allMeta = await loadAllMeta();

  if (allMeta.length === 0) {
    console.error(chalk.yellow('No tasks installed to export.'));
    return;
  }

  // Reconstruct records from metadata
  const records = allMeta.map((meta) => {
    const record = { name: meta.name, schedule: meta.schedule };
    if (meta.working_dir) record.working_dir = meta.working_dir;
    if (meta.env) record.env = meta.env;
    if (meta.commands && meta.commands.length > 0) record.commands = meta.commands;
    if (meta.interactive && meta.interactive.length > 0) record.interactive = meta.interactive;
    if (meta.notifications) record.notifications = meta.notifications;
    return record;
  });

  const config = { records };
  const yamlStr = YAML.stringify(config);

  if (options.output) {
    await writeFile(options.output, yamlStr, 'utf-8');
    console.log(chalk.green(`✓ Exported ${records.length} task(s) to ${options.output}`));
  } else {
    console.log(yamlStr);
  }
}
