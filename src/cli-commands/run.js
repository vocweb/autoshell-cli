/**
 * CLI command: autoshell run <name>
 *
 * Executes a task's script immediately with stdio inherited,
 * so the user sees output in realtime.
 *
 * Validation order before execution:
 * 1. Check task exists in the metadata store
 * 2. Validate metadata has all required execution fields
 * 3. Verify the script file exists on disk
 * 4. Spawn the script with inherited stdio
 */

import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import chalk from 'chalk';
import { findMetaByName, validateMeta } from '../utils/metadata.js';
import { getPlatform } from '../utils/platform.js';
import { expandHome } from '../utils/paths.js';

/**
 * Register the run command with the commander program.
 *
 * @param {import('commander').Command} program - Commander program instance.
 */
export function registerRunCommand(program) {
  program
    .command('run <name>')
    .description('Run a task immediately (bypass schedule)')
    .option('--dry-run', 'Preview what would be executed without running')
    .option('--preview', 'Alias for --dry-run')
    .option('-n', 'Alias for --dry-run')
    .option('--format <format>', 'Output format: text or json', 'text')
    .action(async (name, options) => {
      try {
        await runTask(name, options);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * Execute a task's script immediately after validating its metadata.
 *
 * @param {string} name - Human-readable task name.
 * @param {{ dryRun?: boolean, preview?: boolean, n?: boolean, format?: string }} options
 */
async function runTask(name, options = {}) {
  // Step 1: Find task metadata
  const meta = await findMetaByName(name);
  if (!meta) {
    console.error(chalk.red(`Error: Task "${name}" not found`));
    console.error(chalk.dim('Run "autoshell list" to see installed tasks.'));
    process.exit(1);
  }

  // Step 2: Validate metadata integrity
  const { valid, errors } = validateMeta(meta);
  if (!valid) {
    console.error(chalk.red(`Error: Task "${name}" has invalid configuration:`));
    for (const err of errors) {
      console.error(chalk.red(`  - ${err}`));
    }
    console.error(chalk.dim('\nTry reinstalling: autoshell install <config-file> --force'));
    process.exit(1);
  }

  // Step 3: Verify the script file exists on disk
  try {
    await access(meta.scriptPath);
  } catch {
    console.error(chalk.red(`Error: Script file not found: ${meta.scriptPath}`));
    console.error(chalk.dim('The script may have been deleted. Reinstall the task.'));
    process.exit(1);
  }

  // Dry-run: render preview and exit early (after validation)
  const isDryRun = options.dryRun || options.preview || options.n;
  if (isDryRun) {
    const { renderRunPreview } = await import('../renderers/dry-run-renderer.js');
    await renderRunPreview(meta, options.format);
    return;
  }

  // Step 4: Execute
  console.log(chalk.cyan(`Running: "${meta.name}"...`));
  console.log(chalk.dim(`Script: ${meta.scriptPath}`));
  console.log('');

  const shell = getPlatform() === 'win32' ? 'cmd' : '/bin/bash';
  const args = getPlatform() === 'win32' ? ['/c', meta.scriptPath] : [meta.scriptPath];

  return new Promise((resolve, reject) => {
    const child = spawn(shell, args, {
      stdio: 'inherit',
      cwd: expandHome(meta.working_dir) || undefined,
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
