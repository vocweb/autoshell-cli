/**
 * CLI command: autoshell list (alias: ls)
 *
 * Displays all installed tasks with schedule info and install date.
 * Supports --json flag for machine-readable output.
 */

import chalk from 'chalk';
import { loadAllMeta } from '../utils/metadata.js';

/**
 * Register the list command with the commander program.
 *
 * @param {import('commander').Command} program - Commander program instance.
 */
export function registerListCommand(program) {
  program
    .command('list')
    .alias('ls')
    .description('List all installed tasks')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        await runList(options);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * Execute the list workflow, rendering a table or JSON output.
 *
 * @param {{ json?: boolean }} options - Commander options.
 * @returns {Promise<void>}
 */
async function runList(options) {
  const allMeta = await loadAllMeta();

  if (allMeta.length === 0) {
    console.log(chalk.yellow('No tasks installed.'));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(allMeta, null, 2));
    return;
  }

  // Table header
  console.log(chalk.bold(
    padRight('Name', 30) +
    padRight('Schedule', 25) +
    padRight('Installed', 20),
  ));
  console.log('─'.repeat(75));

  // Table rows
  for (const meta of allMeta) {
    const schedule = formatSchedule(meta.schedule);
    const installed = meta.installedAt
      ? new Date(meta.installedAt).toLocaleDateString()
      : 'unknown';

    console.log(
      padRight(meta.name, 30) +
      padRight(schedule, 25) +
      padRight(installed, 20),
    );
  }

  console.log(chalk.dim(`\n${allMeta.length} task(s) total`));
}

/**
 * Format a schedule object into a human-readable string for table display.
 *
 * @param {object|null} schedule - Schedule config object.
 * @returns {string} Human-readable schedule description.
 */
function formatSchedule(schedule) {
  if (!schedule) return 'unknown';

  switch (schedule.type) {
    case 'daily':
      return `Daily at ${schedule.time}`;
    case 'once':
      return `Once on ${schedule.date} ${schedule.time}`;
    case 'weekly':
      return `${(schedule.weekdays || []).join(',')} at ${schedule.time}`;
    case 'cron':
      return `Cron: ${schedule.cron}`;
    default:
      return schedule.type || 'unknown';
  }
}

/**
 * Pad a string to a fixed width for table column alignment.
 * Truncates strings that exceed the target width.
 *
 * @param {string} str - Input string.
 * @param {number} width - Target column width in characters.
 * @returns {string} Padded or truncated string of exactly `width` characters.
 */
function padRight(str, width) {
  const s = String(str || '');
  return s.length >= width ? s.slice(0, width - 1) + ' ' : s + ' '.repeat(width - s.length);
}
