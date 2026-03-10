/**
 * CLI command: autoshell remove <name>
 *
 * Removes a command file from ~/.autoshell/commands/ and uninstalls
 * the associated task if installed.
 */

import { readdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import YAML from 'yaml';
import { paths } from '../utils/paths.js';
import { getScheduler } from '../schedulers/index.js';
import { taskId } from '../utils/task-id.js';
import { deleteMeta, findMetaByName } from '../utils/metadata.js';

/**
 * Register the remove command with the commander program.
 *
 * @param {import('commander').Command} program - Commander program instance.
 */
export function registerRemoveCommand(program) {
  program
    .command('remove <name>')
    .description('Remove a command config and uninstall its task')
    .action(async (name) => {
      try {
        await runRemove(name);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * Locate a command file by task name, uninstall the associated scheduler
 * entry, and delete both the script and the command file from disk.
 *
 * @param {string} name - Human-readable task name to remove.
 * @returns {Promise<void>}
 */
async function runRemove(name) {
  // Find command file matching this name
  const commandFile = await findCommandFile(name);

  // Uninstall task if installed
  const meta = await findMetaByName(name);
  if (meta) {
    const scheduler = await getScheduler();
    const id = meta.taskId || taskId(name);
    try {
      await scheduler.uninstall(id);
    } catch { /* may not be registered */ }

    if (meta.scriptPath) {
      try { await unlink(meta.scriptPath); } catch { /* may not exist */ }
    }

    await deleteMeta(id);
  }

  // Delete command file
  if (commandFile) {
    await unlink(commandFile);
    console.log(chalk.green(`✓ Removed command file: ${commandFile}`));
  }

  console.log(chalk.green(`✓ Task "${name}" removed`));
}

/**
 * Search the commands directory for a YAML/JSON file containing a record
 * with the given task name. Supports both single-record and multi-record formats.
 *
 * @param {string} name - Task name to search for.
 * @returns {Promise<string|null>} Absolute file path, or null if not found.
 */
async function findCommandFile(name) {
  try {
    const files = await readdir(paths.commands);
    for (const file of files) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml') && !file.endsWith('.json')) continue;
      const filePath = join(paths.commands, file);
      try {
        const content = await readFile(filePath, 'utf-8');
        const parsed = YAML.parse(content);
        // Single-record format
        if (parsed && parsed.name === name) return filePath;
        // Multi-record format
        if (parsed && Array.isArray(parsed.records)) {
          if (parsed.records.some((r) => r.name === name)) return filePath;
        }
      } catch { /* skip unparseable files */ }
    }
  } catch { /* commands dir may not exist */ }
  return null;
}
