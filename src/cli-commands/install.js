/**
 * CLI command: autoshell install [file|URL]
 *
 * Parses config, generates scripts, registers with OS scheduler,
 * and saves metadata. Supports --dry-run and --force flags.
 */

import { writeFile, chmod, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import { parseConfig } from '../config/parser.js';
import { generateScript } from '../generators/script.js';
import { getScheduler } from '../schedulers/index.js';
import { taskId } from '../utils/task-id.js';
import { paths, ensureDirs } from '../utils/paths.js';
import { getPlatform } from '../utils/platform.js';
import { saveMeta, loadMeta } from '../utils/metadata.js';
import { removeQuarantine } from '../utils/quarantine.js';

/**
 * Register the install command with commander program.
 *
 * @param {import('commander').Command} program - Commander program instance.
 */
export function registerInstallCommand(program) {
  program
    .command('install [source]')
    .description('Install tasks from config file, URL, or ~/.autoshell/commands/')
    .option('--dry-run', 'Show what would be done without executing')
    .option('--force', 'Overwrite existing tasks without prompting')
    .action(async (source, options) => {
      try {
        await runInstall(source, options);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * Execute the install workflow.
 */
async function runInstall(source, options) {
  ensureDirs();
  const platform = getPlatform();
  const ext = platform === 'win32' ? '.bat' : '.sh';

  // Determine config sources
  const configs = await resolveConfigs(source);

  if (configs.length === 0) {
    console.log(chalk.yellow('No config files found.'));
    return;
  }

  const scheduler = await getScheduler();
  let installed = 0;
  let skipped = 0;

  for (const config of configs) {
    for (const record of config.records) {
      if (!record.enabled) {
        skipped++;
        continue;
      }

      const id = taskId(record.name);
      const scriptPath = join(paths.scripts, `${id}${ext}`);

      // Check if already installed
      if (!options.force) {
        const existing = await loadMeta(id);
        if (existing) {
          console.log(chalk.yellow(`  Skip: "${record.name}" (already installed, use --force to overwrite)`));
          skipped++;
          continue;
        }
      }

      if (options.dryRun) {
        console.log(chalk.cyan(`  [dry-run] Would install: "${record.name}" → ${scriptPath}`));
        installed++;
        continue;
      }

      // Generate and write script
      const script = generateScript(record, platform);
      await writeFile(scriptPath, script, 'utf-8');
      if (platform !== 'win32') {
        await chmod(scriptPath, 0o755);
      }
      await removeQuarantine(scriptPath);

      // Register with scheduler
      await scheduler.install(id, record, scriptPath);

      // Save metadata
      await saveMeta(id, {
        name: record.name,
        taskId: id,
        schedule: record.schedule,
        commands: record.commands || [],
        working_dir: record.working_dir || null,
        env: record.env || null,
        interactive: record.interactive || [],
        notifications: record.notifications || null,
        source: null,
        installedAt: new Date().toISOString(),
        scriptPath,
      });

      console.log(chalk.green(`  ✓ Installed: "${record.name}"`));
      installed++;
    }
  }

  // Summary
  const parts = [`${installed} task(s) installed`];
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (options.dryRun) parts.unshift('[dry-run]');
  console.log(chalk.bold(`\n${parts.join(', ')}`));
}

/**
 * Resolve config sources: from a specific file/URL or scan commands directory.
 */
async function resolveConfigs(source) {
  if (source) {
    // Single file or URL
    const config = await parseConfig(source);
    return [config];
  }

  // Scan ~/.autoshell/commands/ for config files
  const configs = [];
  try {
    const files = await readdir(paths.commands);
    for (const file of files) {
      if (file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json')) {
        const filePath = join(paths.commands, file);
        try {
          const config = await parseConfig(filePath);
          configs.push(config);
        } catch (err) {
          console.error(chalk.yellow(`  Warning: Failed to parse ${file}: ${err.message}`));
        }
      }
    }
  } catch {
    // commands directory may not exist yet
  }

  return configs;
}
