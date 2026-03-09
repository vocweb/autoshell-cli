/**
 * AutoShell create wizard — interactive prompt functions.
 *
 * Exports one public function: runWizardPrompts()
 * Groups prompts by mode: simple | ai-agent | full
 * Each prompt prints a short explanation before asking.
 */

import chalk from 'chalk';
import inquirer from 'inquirer';

// Available rate limit presets (must match src/interactive/rate-limit-presets.js)
const PRESET_NAMES = [
  'claude-code', 'aider', 'cursor-cli', 'github-copilot', 'plandex',
  'continue-cli', 'opencode', 'cody-cli', 'gemini-cli', 'goose',
];

// ---------------------------------------------------------------------------
// Individual prompt functions
// ---------------------------------------------------------------------------

/**
 * Mode selector — first question in every wizard run.
 * Drives how many subsequent questions are asked.
 *
 * @returns {Promise<'simple'|'ai-agent'|'full'>}
 */
export async function askMode() {
  const { mode } = await inquirer.prompt({
    type: 'list',
    name: 'mode',
    message: 'What type of task do you want to create?',
    choices: [
      {
        name: 'Simple commands    — run shell commands on a schedule',
        value: 'simple',
      },
      {
        name: 'AI agent automation — run Claude, Aider, etc. with rate limit handling',
        value: 'ai-agent',
      },
      {
        name: 'Full config         — configure all options (schedule, notifications, logging...)',
        value: 'full',
      },
    ],
  });
  return mode;
}

/**
 * Ask for the task name.
 * The name becomes the config file slug and appears in `autoshell list`.
 *
 * @returns {Promise<string>}
 */
export async function askName() {
  console.log(chalk.dim(
    '  A short, human-readable name for this task.\n' +
    '  Used as the config file name and displayed in `autoshell list`.',
  ));
  const { name } = await inquirer.prompt({
    type: 'input',
    name: 'name',
    message: 'Task name:',
    validate: (v) => v.trim() ? true : 'Name is required',
  });
  return name.trim();
}

/**
 * Ask for schedule type and follow-up details.
 * daily/weekly/once use a time picker; cron accepts a raw expression.
 *
 * @returns {Promise<object>} Schedule object with type + details.
 */
export async function askSchedule() {
  console.log(chalk.dim(
    '  When should this task run?\n' +
    '  daily/weekly/once run at a fixed time. cron uses standard cron syntax.',
  ));

  const { scheduleType } = await inquirer.prompt({
    type: 'list',
    name: 'scheduleType',
    message: 'Schedule type:',
    choices: ['daily', 'weekly', 'once', 'cron'],
  });

  const schedule = { type: scheduleType };

  if (scheduleType !== 'cron') {
    const { time } = await inquirer.prompt({
      type: 'input',
      name: 'time',
      message: 'Time (HH:MM, 24h format):',
      default: '09:00',
      validate: (v) => /^\d{2}:\d{2}$/.test(v) ? true : 'Format: HH:MM (e.g. 09:00, 14:30)',
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
      message: 'Which days?',
      choices: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      validate: (v) => v.length > 0 ? true : 'Select at least one day',
    });
    schedule.weekdays = weekdays;
  }

  if (scheduleType === 'cron') {
    console.log(chalk.dim('  Standard 5-field cron: minute hour day month weekday'));
    const { cron } = await inquirer.prompt({
      type: 'input',
      name: 'cron',
      message: 'Cron expression:',
      default: '0 9 * * *',
    });
    schedule.cron = cron;
  }

  return schedule;
}

/**
 * Ask for shell commands via an editor prompt (Simple + Full modes).
 * Opens the user's $EDITOR; each non-empty line becomes one command.
 *
 * @returns {Promise<string[]>} Array of trimmed, non-empty command strings.
 */
export async function askCommands() {
  console.log(chalk.dim(
    '  Shell commands to execute, one per line.\n' +
    '  They run sequentially in a single shell script.',
  ));
  const { commandsStr } = await inquirer.prompt({
    type: 'editor',
    name: 'commandsStr',
    message: 'Commands (opens editor, one per line):',
    default: 'echo "Hello from AutoShell!"',
  });
  return commandsStr.split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * Ask for the interactive CLI program name (AI Agent + Full modes).
 *
 * @returns {Promise<string>}
 */
export async function askInteractiveProgram() {
  console.log(chalk.dim(
    '  The CLI program to run interactively (e.g. claude, aider, opencode).\n' +
    '  AutoShell spawns it in a PTY and can auto-respond to prompts.',
  ));
  const { program } = await inquirer.prompt({
    type: 'input',
    name: 'program',
    message: 'Interactive program:',
    default: 'claude',
    validate: (v) => v.trim() ? true : 'Program name is required',
  });
  return program.trim();
}

/**
 * Ask for a rate limit preset (AI Agent + Full modes).
 * Returns null if the user selects "none".
 *
 * @returns {Promise<string|null>}
 */
export async function askRateLimitPreset() {
  console.log(chalk.dim(
    '  Auto-detect rate limits and wait for reset.\n' +
    '  Pick a preset matching your AI agent, or "none" to skip.',
  ));
  const { preset } = await inquirer.prompt({
    type: 'list',
    name: 'preset',
    message: 'Rate limit preset:',
    choices: [...PRESET_NAMES, 'none'],
    default: 'claude-code',
  });
  return preset === 'none' ? null : preset;
}

/**
 * Ask for working directory (Full mode only).
 * Returns null if left empty.
 *
 * @returns {Promise<string|null>}
 */
export async function askWorkingDir() {
  console.log(chalk.dim(
    '  Directory where commands execute. Leave empty for current directory.',
  ));
  const { workingDir } = await inquirer.prompt({
    type: 'input',
    name: 'workingDir',
    message: 'Working directory (optional):',
  });
  return workingDir.trim() || null;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Run the full wizard flow based on the selected mode.
 *
 * Mode question counts:
 *   simple   — 3 questions (name, schedule, commands)
 *   ai-agent — 5 questions (name, schedule, program, preset + schedule sub-questions)
 *   full     — 8 questions (all of the above + working dir)
 *
 * @returns {Promise<object>} Answers object: { mode, name, schedule, ...mode-specific }
 */
export async function runWizardPrompts() {
  const mode = await askMode();
  const name = await askName();
  const schedule = await askSchedule();

  const answers = { mode, name, schedule };

  if (mode === 'simple') {
    answers.commands = await askCommands();
  }

  if (mode === 'ai-agent') {
    answers.interactiveProgram = await askInteractiveProgram();
    answers.rateLimitPreset = await askRateLimitPreset();
  }

  if (mode === 'full') {
    answers.commands = await askCommands();
    answers.interactiveProgram = await askInteractiveProgram();
    answers.rateLimitPreset = await askRateLimitPreset();
    answers.workingDir = await askWorkingDir();
    // env, notifications, logging, terminal appear as commented sections in the YAML output
  }

  return answers;
}
