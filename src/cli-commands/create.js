/**
 * CLI command: autoshell create
 *
 * Interactive wizard that guides user through creating a command config.
 * Uses inquirer for prompts. Saves output to ~/.autoshell/commands/ or -o file.
 */

import { writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import YAML from 'yaml';
import { paths, ensureDirs } from '../utils/paths.js';
import { taskId } from '../utils/task-id.js';

/**
 * Register the create command with commander program.
 */
export function registerCreateCommand(program) {
  program
    .command('create')
    .description('Interactive wizard to create a command config')
    .option('-o, --output <file>', 'Output file path (default: ~/.autoshell/commands/<slug>.yaml)')
    .action(async (options) => {
      try {
        await runCreate(options);
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * Run the interactive create wizard.
 */
async function runCreate(options) {
  console.log(chalk.bold('AutoShell — Create New Task\n'));

  // Step 1: Task name
  const { name } = await inquirer.prompt({
    type: 'input',
    name: 'name',
    message: 'Task name:',
    validate: (v) => v.trim() ? true : 'Name is required',
  });

  // Step 2: Schedule type
  const { scheduleType } = await inquirer.prompt({
    type: 'list',
    name: 'scheduleType',
    message: 'Schedule type:',
    choices: ['daily', 'weekly', 'once', 'cron'],
  });

  // Step 3: Schedule details
  const schedule = { type: scheduleType };

  if (scheduleType !== 'cron') {
    const { time } = await inquirer.prompt({
      type: 'input',
      name: 'time',
      message: 'Time (HH:MM):',
      default: '09:00',
      validate: (v) => /^\d{2}:\d{2}$/.test(v) ? true : 'Format: HH:MM',
    });
    schedule.time = time;
  }

  if (scheduleType === 'once') {
    const { date } = await inquirer.prompt({
      type: 'input',
      name: 'date',
      message: 'Date (YYYY-MM-DD):',
      validate: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? true : 'Format: YYYY-MM-DD',
    });
    schedule.date = date;
  }

  if (scheduleType === 'weekly') {
    const { weekdays } = await inquirer.prompt({
      type: 'checkbox',
      name: 'weekdays',
      message: 'Weekdays:',
      choices: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      validate: (v) => v.length > 0 ? true : 'Select at least one day',
    });
    schedule.weekdays = weekdays;
  }

  if (scheduleType === 'cron') {
    const { cron } = await inquirer.prompt({
      type: 'input',
      name: 'cron',
      message: 'Cron expression:',
      default: '0 9 * * *',
    });
    schedule.cron = cron;
  }

  // Step 4: Working directory
  const { workingDir } = await inquirer.prompt({
    type: 'input',
    name: 'workingDir',
    message: 'Working directory (optional, press Enter to skip):',
  });

  // Step 5: Commands
  const { commandsStr } = await inquirer.prompt({
    type: 'editor',
    name: 'commandsStr',
    message: 'Commands (one per line):',
    default: 'echo "Hello from AutoShell!"',
  });
  const commands = commandsStr.split('\n').map((l) => l.trim()).filter(Boolean);

  // Step 6: Interactive block
  const { addInteractive } = await inquirer.prompt({
    type: 'confirm',
    name: 'addInteractive',
    message: 'Add interactive program block?',
    default: false,
  });

  let interactive;
  if (addInteractive) {
    const { program: prog, inputsStr } = await inquirer.prompt([
      { type: 'input', name: 'program', message: 'Program name (e.g., claude):' },
      { type: 'input', name: 'inputsStr', message: 'Inputs (comma-separated):' },
    ]);
    interactive = [{
      program: prog,
      inputs: inputsStr.split(',').map((s) => s.trim()).filter(Boolean),
    }];
  }

  // Build config
  const config = { name, schedule };
  if (workingDir) config.working_dir = workingDir;
  if (commands.length > 0) config.commands = commands;
  if (interactive) config.interactive = interactive;

  // Generate YAML
  const yamlStr = YAML.stringify(config);

  // Determine output path
  const slug = taskId(name);
  const outputPath = options.output || join(paths.commands, `${slug}.yaml`);

  ensureDirs();
  await writeFile(outputPath, yamlStr, 'utf-8');

  console.log(chalk.green(`\n✓ Saved to: ${outputPath}`));
  console.log(chalk.dim(`\nRun "autoshell install ${outputPath}" to activate.`));
}
