/**
 * CLI command: autoshell migrate <file>
 *
 * Splits a legacy multi-record YAML config into individual files
 * in ~/.autoshell/commands/ (one file per record).
 * Saves settings block to ~/.autoshell/config.yaml if present.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import YAML from 'yaml';
import { parseConfig } from '../config/parser.js';
import { paths, ensureDirs } from '../utils/paths.js';
import { taskId } from '../utils/task-id.js';

/**
 * Register the migrate command with commander program.
 */
export function registerMigrateCommand(program) {
  program
    .command('migrate <file>')
    .description('Split multi-record config into individual command files')
    .action(async (file) => {
      try {
        await runMigrate(file);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * Parse multi-record file and split into per-task command files.
 */
async function runMigrate(file) {
  const config = await parseConfig(file);
  ensureDirs();

  // Save settings to global config if present
  if (config.settings && Object.keys(config.settings).length > 0) {
    const settingsYaml = YAML.stringify({ settings: config.settings });
    await writeFile(paths.config, settingsYaml, 'utf-8');
    console.log(chalk.green(`  ✓ Settings saved to ${paths.config}`));
  }

  // Create individual command files
  let count = 0;
  for (const record of config.records) {
    const slug = taskId(record.name);
    const filePath = join(paths.commands, `${slug}.yaml`);
    const yamlStr = YAML.stringify(record);
    await writeFile(filePath, yamlStr, 'utf-8');
    console.log(chalk.green(`  ✓ ${record.name} → ${filePath}`));
    count++;
  }

  console.log(chalk.bold(`\nMigrated ${count} record(s) into ${paths.commands}/`));
}
