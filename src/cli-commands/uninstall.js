/**
 * CLI command: autoshell uninstall [name]
 *
 * Removes scheduled tasks by unregistering from OS scheduler,
 * deleting generated scripts, and removing metadata files.
 */

import { unlink } from 'node:fs/promises';
import chalk from 'chalk';
import { getScheduler } from '../schedulers/index.js';
import { taskId } from '../utils/task-id.js';
import { loadAllMeta, deleteMeta, findMetaByName } from '../utils/metadata.js';

/**
 * Register the uninstall command with commander program.
 */
export function registerUninstallCommand(program) {
  program
    .command('uninstall [name]')
    .description('Uninstall a task or all tasks')
    .option('--all', 'Uninstall all tasks')
    .action(async (name, options) => {
      try {
        await runUninstall(name, options);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * Execute the uninstall workflow.
 */
async function runUninstall(name, options) {
  const scheduler = await getScheduler();

  if (options.all) {
    // Uninstall all tasks
    const allMeta = await loadAllMeta();
    if (allMeta.length === 0) {
      console.log(chalk.yellow('No tasks installed.'));
      return;
    }

    for (const meta of allMeta) {
      await removeSingleTask(meta, scheduler);
    }
    console.log(chalk.bold(`\n${allMeta.length} task(s) uninstalled`));
    return;
  }

  if (!name) {
    console.error(chalk.red('Error: Provide a task name or use --all'));
    process.exit(1);
  }

  // Find by name
  const meta = await findMetaByName(name);
  if (!meta) {
    console.error(chalk.red(`Error: Task "${name}" not found`));
    process.exit(1);
  }

  await removeSingleTask(meta, scheduler);
  console.log(chalk.bold('\n1 task uninstalled'));
}

/**
 * Remove a single task: unregister scheduler, delete script, delete metadata.
 */
async function removeSingleTask(meta, scheduler) {
  const id = meta.taskId || taskId(meta.name);

  // Unregister from scheduler
  try {
    await scheduler.uninstall(id);
  } catch {
    // Scheduler entry may not exist
  }

  // Delete script file
  if (meta.scriptPath) {
    try { await unlink(meta.scriptPath); } catch { /* may not exist */ }
  }

  // Delete metadata
  await deleteMeta(id);

  console.log(chalk.green(`  ✓ Uninstalled: "${meta.name}"`));
}
