/**
 * CLI command: autoshell validate [file]
 *
 * Validates config files against the AutoShell schema.
 * Without arguments, validates all files in ~/.autoshell/commands/.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import { parseConfig } from '../config/parser.js';
import { paths } from '../utils/paths.js';

/**
 * Register the validate command with the commander program.
 *
 * @param {import('commander').Command} program - Commander program instance.
 */
export function registerValidateCommand(program) {
  program
    .command('validate [file]')
    .description('Validate config file(s)')
    .action(async (file) => {
      try {
        const hasErrors = await runValidate(file);
        if (hasErrors) process.exit(1);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * Validate one or all config files.
 * @returns {boolean} True if any errors found.
 */
async function runValidate(file) {
  if (file) {
    return validateSingle(file);
  }

  // Validate all files in commands/
  let files;
  try {
    const entries = await readdir(paths.commands);
    files = entries.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json'));
  } catch {
    console.log(chalk.yellow('No commands directory found.'));
    return false;
  }

  if (files.length === 0) {
    console.log(chalk.yellow('No config files found in commands/.'));
    return false;
  }

  let hasErrors = false;
  for (const f of files) {
    const filePath = join(paths.commands, f);
    const failed = await validateSingle(filePath);
    if (failed) hasErrors = true;
  }

  return hasErrors;
}

/**
 * Validate a single config file.
 * @returns {boolean} True if validation failed.
 */
async function validateSingle(filePath) {
  try {
    await parseConfig(filePath);
    console.log(chalk.green(`  ✓ ${filePath}`));
    return false;
  } catch (err) {
    console.error(chalk.red(`  ✗ ${filePath}`));
    console.error(chalk.red(`    ${err.message}`));
    return true;
  }
}
