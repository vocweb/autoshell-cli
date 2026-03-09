/**
 * CLI command: autoshell status [name]
 *
 * Shows task status including last run time, recent output,
 * and error lines from log files.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import { paths } from '../utils/paths.js';
import { loadAllMeta, findMetaByName } from '../utils/metadata.js';

/**
 * Register the status command with commander program.
 */
export function registerStatusCommand(program) {
  program
    .command('status [name]')
    .description('Show task status and last run info')
    .action(async (name) => {
      try {
        if (name) {
          const meta = await findMetaByName(name);
          if (!meta) {
            console.error(chalk.red(`Error: Task "${name}" not found`));
            process.exit(1);
          }
          await showStatus(meta);
        } else {
          const allMeta = await loadAllMeta();
          if (allMeta.length === 0) {
            console.log(chalk.yellow('No tasks installed.'));
            return;
          }
          for (const meta of allMeta) {
            await showStatus(meta);
            console.log('');
          }
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * Display status for a single task.
 */
async function showStatus(meta) {
  const id = meta.taskId;
  console.log(chalk.bold(`Task: ${meta.name}`));
  console.log(`  ID: ${id}`);
  console.log(`  Schedule: ${formatSchedule(meta.schedule)}`);
  console.log(`  Installed: ${meta.installedAt || 'unknown'}`);

  // Find latest log file
  const logDir = join(paths.logs, id);
  const lastLog = await getLatestLog(logDir);

  if (!lastLog) {
    console.log(chalk.dim('  Last run: no logs found'));
    return;
  }

  console.log(`  Last run: ${lastLog.time}`);

  // Show last 5 lines of output
  const lines = lastLog.content.split('\n').filter(Boolean);
  const tail = lines.slice(-5);
  if (tail.length > 0) {
    console.log(chalk.dim('  Output (last 5 lines):'));
    for (const line of tail) {
      console.log(`    ${line}`);
    }
  }

  // Show last 3 stderr lines
  const errorLines = lines.filter((l) => l.includes('[stderr]') || l.includes('ERROR'));
  if (errorLines.length > 0) {
    const errTail = errorLines.slice(-3);
    console.log(chalk.red('  Errors (last 3):'));
    for (const line of errTail) {
      console.log(chalk.red(`    ${line}`));
    }
  }
}

/**
 * Get the most recent log file from a task's log directory.
 */
async function getLatestLog(logDir) {
  try {
    const files = await readdir(logDir);
    const logFiles = files.filter((f) => f.endsWith('.log')).sort().reverse();
    if (logFiles.length === 0) return null;

    const latestPath = join(logDir, logFiles[0]);
    const content = await readFile(latestPath, 'utf-8');
    const stats = await stat(latestPath);

    return {
      path: latestPath,
      time: stats.mtime.toISOString(),
      content,
    };
  } catch {
    return null;
  }
}

function formatSchedule(schedule) {
  if (!schedule) return 'unknown';
  switch (schedule.type) {
    case 'daily': return `Daily at ${schedule.time}`;
    case 'once': return `Once on ${schedule.date} ${schedule.time}`;
    case 'weekly': return `${(schedule.weekdays || []).join(',')} at ${schedule.time}`;
    case 'cron': return `Cron: ${schedule.cron}`;
    default: return schedule.type || 'unknown';
  }
}
