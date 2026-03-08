/**
 * CLI command: autoshell run <name>
 *
 * Executes a task's script immediately with stdio inherited,
 * so the user sees output in realtime.
 */

import { spawn } from 'node:child_process';
import chalk from 'chalk';
import { findMetaByName } from '../utils/metadata.js';
import { getPlatform } from '../utils/platform.js';

/**
 * Register the run command with commander program.
 */
export function registerRunCommand(program) {
  program
    .command('run <name>')
    .description('Run a task immediately (bypass schedule)')
    .action(async (name) => {
      try {
        await runTask(name);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * Execute a task's script immediately.
 */
async function runTask(name) {
  const meta = await findMetaByName(name);
  if (!meta) {
    console.error(chalk.red(`Error: Task "${name}" not found`));
    process.exit(1);
  }

  if (!meta.scriptPath) {
    console.error(chalk.red(`Error: No script path found for "${name}"`));
    process.exit(1);
  }

  console.log(chalk.cyan(`Running: "${meta.name}"...`));
  console.log(chalk.dim(`Script: ${meta.scriptPath}`));
  console.log('');

  const shell = getPlatform() === 'win32' ? 'cmd' : '/bin/bash';
  const args = getPlatform() === 'win32' ? ['/c', meta.scriptPath] : [meta.scriptPath];

  return new Promise((resolve, reject) => {
    const child = spawn(shell, args, {
      stdio: 'inherit',
      cwd: meta.working_dir || undefined,
    });

    child.on('close', (code) => {
      console.log('');
      if (code === 0) {
        console.log(chalk.green(`Task "${meta.name}" completed (exit code: 0)`));
      } else {
        console.log(chalk.red(`Task "${meta.name}" failed (exit code: ${code})`));
      }
      resolve();
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to execute script: ${err.message}`));
    });
  });
}
