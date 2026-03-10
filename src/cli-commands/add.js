/**
 * CLI command: autoshell add <file>
 *
 * Validates and copies a command config file to ~/.autoshell/commands/.
 */

import { copyFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import chalk from 'chalk';
import { parseConfig } from '../config/parser.js';
import { paths, ensureDirs } from '../utils/paths.js';

/**
 * Register the add command with the commander program.
 *
 * @param {import('commander').Command} program - Commander program instance.
 */
export function registerAddCommand(program) {
  program
    .command('add <file>')
    .description('Add a command config file to ~/.autoshell/commands/')
    .action(async (file) => {
      try {
        await runAdd(file);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * Validate and copy a config file to the commands directory.
 *
 * @param {string} file - Path to the config file to add.
 * @returns {Promise<void>}
 */
async function runAdd(file) {
  // Validate first
  await parseConfig(file);

  ensureDirs();
  const dest = join(paths.commands, basename(file));
  await copyFile(file, dest);

  console.log(chalk.green(`✓ Added "${basename(file)}" to commands/`));
}
