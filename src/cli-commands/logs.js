/**
 * CLI command: autoshell logs [name]
 *
 * View stdout/stderr logs for tasks. Supports line limit (-n),
 * error-only filter (-e), and follow mode (-f).
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { watch } from 'node:fs';
import chalk from 'chalk';
import { paths } from '../utils/paths.js';
import { findMetaByName, loadAllMeta } from '../utils/metadata.js';
import { taskId } from '../utils/task-id.js';

/**
 * Register the logs command with commander program.
 */
export function registerLogsCommand(program) {
  program
    .command('logs [name]')
    .description('View task logs')
    .option('-n, --lines <count>', 'Number of lines to show', '20')
    .option('-e, --errors', 'Show only error/stderr lines')
    .option('-f, --follow', 'Follow log output (like tail -f)')
    .action(async (name, options) => {
      try {
        await runLogs(name, options);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * Execute the logs workflow.
 */
async function runLogs(name, options) {
  if (!name) {
    // Show latest logs for all tasks
    const allMeta = await loadAllMeta();
    if (allMeta.length === 0) {
      console.log(chalk.yellow('No tasks installed.'));
      return;
    }
    for (const meta of allMeta) {
      console.log(chalk.bold(`\n── ${meta.name} ──`));
      await showTaskLogs(meta.taskId, options);
    }
    return;
  }

  const meta = await findMetaByName(name);
  if (!meta) {
    console.error(chalk.red(`Error: Task "${name}" not found`));
    process.exit(1);
  }

  await showTaskLogs(meta.taskId, options);
}

/**
 * Display logs for a specific task.
 */
async function showTaskLogs(id, options) {
  const logDir = join(paths.logs, id);
  const lineCount = parseInt(options.lines, 10) || 20;

  // Find log files
  let logFiles;
  try {
    const files = await readdir(logDir);
    logFiles = files.filter((f) => f.endsWith('.log')).sort().reverse();
  } catch {
    console.log(chalk.dim('  No logs found.'));
    return;
  }

  if (logFiles.length === 0) {
    console.log(chalk.dim('  No logs found.'));
    return;
  }

  // Read latest log
  const latestPath = join(logDir, logFiles[0]);

  if (options.follow) {
    await followLog(latestPath);
    return;
  }

  const content = await readFile(latestPath, 'utf-8');
  let lines = content.split('\n').filter(Boolean);

  // Filter errors only
  if (options.errors) {
    lines = lines.filter((l) => l.includes('[stderr]') || l.includes('ERROR'));
  }

  // Show last N lines
  const tail = lines.slice(-lineCount);
  for (const line of tail) {
    if (line.includes('[stderr]') || line.includes('ERROR')) {
      console.log(chalk.red(line));
    } else {
      console.log(line);
    }
  }

  if (lines.length > lineCount) {
    console.log(chalk.dim(`  ... ${lines.length - lineCount} more lines (use -n to show more)`));
  }
}

/**
 * Follow a log file in real-time (similar to tail -f).
 * Blocks until Ctrl+C.
 */
async function followLog(filePath) {
  console.log(chalk.dim(`Following ${filePath} (Ctrl+C to stop)...\n`));

  // Print existing content first
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n').filter(Boolean).slice(-10);
  for (const line of lines) {
    console.log(line);
  }

  // Watch for changes
  let lastSize = Buffer.byteLength(content, 'utf-8');

  const watcher = watch(filePath, async () => {
    try {
      const newContent = await readFile(filePath, 'utf-8');
      const newSize = Buffer.byteLength(newContent, 'utf-8');
      if (newSize > lastSize) {
        const added = newContent.slice(lastSize);
        process.stdout.write(added);
        lastSize = newSize;
      }
    } catch {
      // File may be rotated
    }
  });

  // Keep process alive until Ctrl+C
  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });

  // Block indefinitely
  await new Promise(() => {});
}
