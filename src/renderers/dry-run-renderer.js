/**
 * Dry-run renderer for AutoShell install and run preview.
 *
 * Produces rich colored text output or structured JSON showing what
 * would happen without actually executing: config summary, generated
 * script, next scheduled runs, files to create, and validation warnings.
 */

import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { generateScript } from '../generators/script.js';
import { taskId } from '../utils/task-id.js';
import { paths } from '../utils/paths.js';
import { getPlatform } from '../utils/platform.js';
import { getNextRuns, formatRunDate } from '../utils/schedule-calculator.js';

const HEADER_WIDTH = 48;
const BOX_TOP = `╔${'═'.repeat(HEADER_WIDTH)}╗`;
const BOX_BOT = `╚${'═'.repeat(HEADER_WIDTH)}╝`;
const boxLine = (text) => `║  ${text.padEnd(HEADER_WIDTH - 2)}║`;

/**
 * Render a preview of what `autoshell install` would do for each config record.
 * Shows: task name, schedule, next 5 runs, script path, generated script snippet,
 * working dir, env vars, interactive config, notifications, validation status.
 *
 * @param {object[]} configs - Array of parsed config objects (from parseConfig).
 * @param {string} platform - Target platform ('darwin', 'linux', 'win32').
 * @param {object|string} options - Options object or format string (back-compat).
 * @param {string} [options.format] - Output format: 'text' (default) or 'json'.
 */
export async function renderInstallPreview(configs, platform, options = {}) {
  // Accept bare format string for back-compat with install.js callers
  const format = typeof options === 'string' ? options : (options.format || 'text');
  const tasks = [];
  let wouldInstall = 0;
  let skipped = 0;

  for (const config of configs) {
    for (const record of config.records) {
      if (!record.enabled) {
        skipped++;
        if (format === 'text') {
          console.log(chalk.dim(`  ○ Skipped (disabled): "${record.name}"`));
        }
        continue;
      }
      const id = taskId(record.name);
      const data = await buildRecordData(record, id, platform);
      tasks.push(data);
      wouldInstall++;
      if (format === 'text') renderRecordText(data);
    }
  }

  if (format === 'json') {
    renderJson({ dryRun: true, tasks, summary: { wouldInstall, skipped } });
  } else {
    console.log(chalk.bold(`\n${wouldInstall} task(s) would be installed, ${skipped} skipped`));
  }
}

/**
 * Render a preview of what `autoshell run` would do for a task.
 * Shows: task name, script path, working dir, env vars, commands.
 *
 * @param {object} meta - Task metadata (from loadMeta).
 * @param {string} [format='text'] - Output format: 'text' or 'json'.
 */
export async function renderRunPreview(meta, format = 'text') {
  const nextRuns = meta.schedule ? getNextRuns(meta.schedule, 5) : [];
  const warnings = await collectWarnings({ working_dir: meta.working_dir });
  let scriptContent = '';
  try {
    scriptContent = await readFile(meta.scriptPath, 'utf-8');
  } catch {
    warnings.push(`Script file not found: ${meta.scriptPath}`);
  }

  const data = {
    name: meta.name, taskId: meta.taskId, schedule: meta.schedule,
    workingDir: meta.working_dir || null,
    scriptPath: meta.scriptPath,
    commands: meta.commands || [],
    nextRuns: nextRuns.map((d) => d.toISOString()),
    script: scriptContent, warnings,
  };

  if (format === 'json') {
    renderJson({ dryRun: true, task: data });
  } else {
    console.log('');
    console.log(chalk.cyan(BOX_TOP));
    console.log(chalk.cyan(boxLine('DRY RUN — Run Preview')));
    console.log(chalk.cyan(BOX_BOT));
    console.log('');
    console.log(`  ${chalk.cyan('Task:')}         "${meta.name}"`);
    console.log(`  ${chalk.cyan('Script:')}       ${meta.scriptPath}`);
    const cmds = meta.commands || [];
    console.log(`  ${chalk.cyan('Commands:')}     ${cmds.length} command(s)`);
    for (let i = 0; i < cmds.length; i++) {
      console.log(`                 ${i + 1}. ${cmds[i]}`);
    }
    if (meta.working_dir) {
      console.log(`  ${chalk.cyan('Working dir:')}  ${meta.working_dir}`);
    }
    renderNextRunsInline(nextRuns);
    renderWarningsText(warnings);
    console.log('');
    console.log(chalk.dim('Would execute script immediately (bypassing schedule).'));
    console.log(chalk.dim('(run preview)'));
  }
}

/**
 * Render structured data as JSON to stdout.
 *
 * @param {object} data - Data to render.
 */
export function renderJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

// ── Internal helpers ──────────────────────────────────────────────

/** Build structured data for one record (used by both text and JSON output). */
async function buildRecordData(record, id, platform) {
  const ext = platform === 'win32' ? '.bat' : '.sh';
  const script = generateScript(record, platform);
  const nextRuns = getNextRuns(record.schedule, 5);
  const filePaths = buildFilePaths(id, platform, ext);
  const warnings = await collectWarnings(record);
  const interactive = (record.interactive || []).map((b) => ({
    program: b.program, inputs: (b.inputs || []).length,
    rateLimited: !!(b.rate_limit),
  }));
  const notifications = record.notifications ? {
    channels: (record.notifications.channels || []).map((c) => c.type),
    onSuccess: !!record.notifications.on_success,
    onFailure: record.notifications.on_failure !== false,
  } : null;

  return {
    name: record.name, taskId: id, enabled: record.enabled,
    schedule: record.schedule,
    workingDir: record.working_dir || null,
    env: record.env || null,
    envVars: record.env ? Object.keys(record.env).length : 0,
    commands: record.commands || [],
    commandCount: (record.commands || []).length,
    interactive, notifications,
    files: filePaths,
    nextRuns: nextRuns.map((d) => d.toISOString()),
    script, warnings,
  };
}

/** Build expected file paths for a task by platform. */
function buildFilePaths(id, platform, ext) {
  const scriptPath = join(paths.scripts, `${id}${ext}`);
  const metaPath = join(paths.meta, `${id}.json`);
  const logsDir = join(paths.logs, id);
  let schedulerPath;
  if (platform === 'darwin') {
    schedulerPath = join(homedir(), 'Library', 'LaunchAgents', `com.autoshell.${id}.plist`);
  } else if (platform === 'linux') {
    schedulerPath = join(homedir(), '.config', 'systemd', 'user', `autoshell-${id}.timer`);
  } else {
    schedulerPath = `Task Scheduler: AutoShell_${id}`;
  }
  return { script: scriptPath, scheduler: schedulerPath, metadata: metaPath, logs: logsDir };
}

/**
 * Collect soft warnings (path existence, program availability).
 *
 * @param {object} record - Partial record with optional working_dir and interactive.
 * @returns {Promise<string[]>} Array of warning messages.
 */
export async function collectWarnings(record) {
  const warnings = [];
  if (record.working_dir) {
    const expanded = record.working_dir.replace(/^~/, homedir());
    try { await access(expanded); } catch {
      warnings.push(`working_dir "${record.working_dir}" does not exist`);
    }
  }
  for (const block of (record.interactive || [])) {
    try { execSync(`which ${block.program}`, { stdio: 'ignore' }); } catch {
      warnings.push(`program "${block.program}" not found in PATH`);
    }
  }
  return warnings;
}

/** Format schedule object for display. */
function formatSchedule(schedule) {
  if (!schedule) return 'unknown';
  switch (schedule.type) {
    case 'once': return `once on ${schedule.date} at ${schedule.time}`;
    case 'daily': return `daily at ${schedule.time}`;
    case 'weekly': return `weekly on ${(schedule.weekdays || []).join(', ')} at ${schedule.time}`;
    case 'cron': return `cron: ${schedule.cron}`;
    default: return schedule.type;
  }
}

/** Render a single record as a colored text block. */
function renderRecordText(data) {
  const divider = `─── Task: "${data.name}" ${'─'.repeat(Math.max(2, 40 - data.name.length))}`;
  console.log('');
  console.log(chalk.bold.cyan(divider));
  console.log('');
  console.log(`  ${chalk.cyan('Schedule:')}     ${formatSchedule(data.schedule)}`);

  // Next 5 runs on one line
  if (data.nextRuns.length > 0) {
    const runs = data.nextRuns.map((s) => formatRunDate(new Date(s))).join(', ');
    console.log(`  ${chalk.cyan('Next 5 runs:')}  ${runs}`);
  }

  console.log(`  ${chalk.cyan('Script:')}       ${data.files.script}`);
  console.log(`  ${chalk.cyan('Scheduler:')}    ${data.files.scheduler}`);
  console.log(`  ${chalk.cyan('Metadata:')}     ${data.files.metadata}`);

  if (data.workingDir) {
    console.log(`  ${chalk.cyan('Working dir:')}  ${data.workingDir}`);
  }

  if (data.env && Object.keys(data.env).length > 0) {
    const envStr = Object.entries(data.env).map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(`  ${chalk.cyan('Env vars:')}     ${envStr}`);
  }

  const cmds = data.commands;
  console.log(`  ${chalk.cyan('Commands:')}     ${cmds.length} command(s)`);
  for (let i = 0; i < cmds.length; i++) {
    console.log(`                 ${i + 1}. ${cmds[i]}`);
  }

  if (data.interactive.length > 0) {
    for (const blk of data.interactive) {
      const inputs = blk.inputs > 0 ? `, inputs: ${blk.inputs}` : '';
      console.log(`  ${chalk.cyan('Interactive:')}  ${blk.program}${inputs}`);
    }
  }

  if (data.notifications) {
    const ch = data.notifications.channels.join(', ');
    const when = data.notifications.onFailure ? 'on_failure' : 'on_success';
    console.log(`  ${chalk.cyan('Notifications:')} ${ch} (${when})`);
  }

  renderScriptText(data.script);

  if (data.warnings.length > 0) {
    renderWarningsText(data.warnings);
  } else {
    console.log(`  ${chalk.green('Status:')}       ${chalk.green('✓ Valid')}`);
  }
}

/** Show next runs inline (for run preview). */
function renderNextRunsInline(runs) {
  if (runs.length === 0) return;
  const str = runs.map((d) => formatRunDate(d)).join(', ');
  console.log(`  ${chalk.cyan('Next runs:')}    ${str}`);
}

/** Show first 20 lines of generated script with truncation. */
function renderScriptText(script) {
  if (!script) return;
  const lines = script.split('\n');
  const preview = lines.slice(0, 20);
  console.log('');
  for (const line of preview) {
    console.log(chalk.dim(`    ${line}`));
  }
  if (lines.length > 20) {
    console.log(chalk.dim(`    ... (${lines.length - 20} more lines)`));
  }
}

/** Print warnings in yellow. */
function renderWarningsText(warnings) {
  if (warnings.length === 0) return;
  console.log('');
  for (const w of warnings) {
    console.log(chalk.yellow(`  ⚠ ${w}`));
  }
}
