/**
 * CLI command: autoshell edit <name|file>
 *
 * Opens a command config file in the user's preferred editor.
 * Resolves task name to file path in ~/.autoshell/commands/, or
 * accepts a direct file path. Uses $VISUAL → $EDITOR → platform default.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import YAML from 'yaml';
import { paths } from '../utils/paths.js';
import { openInEditor } from '../utils/open-editor.js';

/**
 * Register the edit command with commander program.
 * @param {import('commander').Command} program - Commander program instance.
 */
export function registerEditCommand(program) {
  program
    .command('edit <name>')
    .description('Open a command config file in your editor')
    .action(async (name) => {
      try {
        await runEdit(name);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * Find and open a config file by task name or file path.
 * @param {string} nameOrPath - Task name or direct file path.
 */
async function runEdit(nameOrPath) {
  // Direct file path
  if (existsSync(nameOrPath)) {
    openInEditor(nameOrPath);
    console.log(chalk.green(`✓ Opening ${nameOrPath} in editor`));
    return;
  }

  // Search by task name in commands directory
  const filePath = await findByName(nameOrPath);
  if (filePath) {
    openInEditor(filePath);
    console.log(chalk.green(`✓ Opening ${filePath} in editor`));
    return;
  }

  throw new Error(`No config found for "${nameOrPath}". Check ~/.autoshell/commands/`);
}

/**
 * Search commands/ for a file containing a task with the given name.
 * @param {string} name - Task name to search for.
 * @returns {Promise<string|null>} File path or null.
 */
async function findByName(name) {
  let files;
  try {
    files = await readdir(paths.commands);
  } catch {
    return null;
  }

  for (const file of files) {
    if (!file.endsWith('.yaml') && !file.endsWith('.yml') && !file.endsWith('.json')) continue;
    const filePath = join(paths.commands, file);
    try {
      const content = await readFile(filePath, 'utf-8');
      const parsed = YAML.parse(content);
      if (parsed?.name === name) return filePath;
    } catch { /* skip unparseable */ }
  }
  return null;
}
