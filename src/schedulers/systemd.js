/**
 * Linux systemd scheduler for AutoShell.
 *
 * Generates user-level .service (oneshot) and .timer unit files,
 * and manages them via systemctl --user.
 */

import { writeFile, unlink, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { paths } from '../utils/paths.js';

const exec = promisify(execFile);
const UNIT_PREFIX = 'autoshell-';
const SYSTEMD_USER_DIR = join(homedir(), '.config', 'systemd', 'user');

/**
 * Install a task by writing service + timer units and enabling the timer.
 *
 * @param {string} taskId - URL-safe task identifier.
 * @param {object} record - Parsed config record.
 * @param {string} scriptPath - Absolute path to the generated script.
 */
export async function install(taskId, record, scriptPath) {
  await mkdir(SYSTEMD_USER_DIR, { recursive: true });

  const unitName = `${UNIT_PREFIX}${taskId}`;
  const servicePath = join(SYSTEMD_USER_DIR, `${unitName}.service`);
  const timerPath = join(SYSTEMD_USER_DIR, `${unitName}.timer`);
  const logDir = join(paths.logs, taskId);

  // Generate unit files
  const service = generateService(unitName, record, scriptPath, logDir);
  const timer = generateTimer(unitName, record);

  await writeFile(servicePath, service, 'utf-8');
  await writeFile(timerPath, timer, 'utf-8');

  // Reload and enable
  await exec('systemctl', ['--user', 'daemon-reload']);
  await exec('systemctl', ['--user', 'enable', '--now', `${unitName}.timer`]);
}

/**
 * Uninstall a task by stopping, disabling, and removing unit files.
 *
 * @param {string} taskId - URL-safe task identifier.
 */
export async function uninstall(taskId) {
  const unitName = `${UNIT_PREFIX}${taskId}`;

  // Stop and disable (ignore errors if not active)
  try {
    await exec('systemctl', ['--user', 'disable', '--now', `${unitName}.timer`]);
  } catch {
    // Timer may not be active
  }

  // Remove unit files
  const servicePath = join(SYSTEMD_USER_DIR, `${unitName}.service`);
  const timerPath = join(SYSTEMD_USER_DIR, `${unitName}.timer`);

  for (const path of [servicePath, timerPath]) {
    try { await unlink(path); } catch { /* File may not exist */ }
  }

  // Reload daemon
  try {
    await exec('systemctl', ['--user', 'daemon-reload']);
  } catch {
    // Ignore reload errors
  }
}

/**
 * List all AutoShell timers registered in systemd user directory.
 *
 * @returns {Promise<Array<{ id: string, name: string, path: string }>>}
 */
export async function list() {
  const results = [];
  try {
    const files = await readdir(SYSTEMD_USER_DIR);
    for (const file of files) {
      if (file.startsWith(UNIT_PREFIX) && file.endsWith('.timer')) {
        const name = file.replace('.timer', '');
        const id = name.replace(UNIT_PREFIX, '');
        results.push({ id, name, path: join(SYSTEMD_USER_DIR, file) });
      }
    }
  } catch {
    // Directory may not exist
  }
  return results;
}

/**
 * Check if a task timer is installed.
 *
 * @param {string} taskId - URL-safe task identifier.
 * @returns {Promise<boolean>}
 */
export async function isInstalled(taskId) {
  const items = await list();
  return items.some((item) => item.id === taskId);
}

/**
 * Generate a systemd .service unit file (Type=oneshot) for a task.
 * Sets WorkingDirectory to %h (home) to avoid permission issues;
 * the generated script handles the actual cd to working_dir.
 *
 * @param {string} unitName - Systemd unit name (e.g. "autoshell-my-task").
 * @param {object} record - Parsed config record.
 * @param {string} scriptPath - Absolute path to the generated shell script.
 * @param {string} logDir - Directory for stdout/stderr log files.
 * @returns {string} Systemd service unit file content.
 */
function generateService(unitName, record, scriptPath, logDir) {
  const lines = [];

  lines.push('[Unit]');
  lines.push(`Description=AutoShell: ${record.name}`);
  lines.push('');

  lines.push('[Service]');
  lines.push('Type=oneshot');

  // Launch in terminal if configured, else run directly
  // headless: run script directly — systemd captures stdout/stderr/exit code
  const isHeadless = record.terminal?.headless === true;
  if (isHeadless || !record.terminal?.new_window) {
    lines.push(`ExecStart=/bin/bash ${scriptPath}`);
  } else {
    const bin = resolveLinuxTerminal(record.terminal.program);
    const termArg = bin === 'gnome-terminal' ? '--' : '-e';
    lines.push(`ExecStart=${bin} ${termArg} /bin/bash ${scriptPath}`);
  }

  // Working directory — use HOME to avoid permission issues with protected dirs.
  // The generated script handles cd to the actual working directory.
  lines.push('WorkingDirectory=%h');

  // Environment variables
  if (record.env) {
    for (const [key, value] of Object.entries(record.env)) {
      lines.push(`Environment="${key}=${value}"`);
    }
  }

  // Log output
  lines.push(`StandardOutput=append:${logDir}/stdout.log`);
  lines.push(`StandardError=append:${logDir}/stderr.log`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate a systemd .timer unit file that triggers the corresponding .service.
 * Sets Persistent=true so missed triggers (e.g. system was off) run at next boot.
 *
 * @param {string} unitName - Systemd unit name (e.g. "autoshell-my-task").
 * @param {object} record - Parsed config record (used for description and schedule).
 * @returns {string} Systemd timer unit file content.
 */
function generateTimer(unitName, record) {
  const lines = [];

  lines.push('[Unit]');
  lines.push(`Description=Timer for AutoShell: ${record.name}`);
  lines.push('');

  lines.push('[Timer]');
  lines.push(`OnCalendar=${scheduleToCalendar(record.schedule)}`);
  lines.push('Persistent=true');
  lines.push('');

  lines.push('[Install]');
  lines.push('WantedBy=timers.target');
  lines.push('');

  return lines.join('\n');
}

/**
 * Convert schedule config to systemd OnCalendar expression.
 *
 * @param {object} schedule - Schedule config object.
 * @returns {string} systemd calendar expression.
 */
export function scheduleToCalendar(schedule) {
  const time = schedule.time || '00:00';
  const [hour, minute] = time.split(':');
  const timeStr = `${hour}:${minute}:00`;

  switch (schedule.type) {
    case 'daily':
      return `*-*-* ${timeStr}`;

    case 'once': {
      const [year, month, day] = schedule.date.split('-');
      return `${year}-${month}-${day} ${timeStr}`;
    }

    case 'weekly': {
      const days = schedule.weekdays.join(',');
      return `${days} *-*-* ${timeStr}`;
    }

    case 'cron':
      return cronToCalendar(schedule.cron);

    default:
      return `*-*-* ${timeStr}`;
  }
}

/**
 * Convert a cron expression to systemd OnCalendar format.
 *
 * Supports common patterns:
 * - "0 9 * * 1-5"  → "Mon..Fri *-*-* 09:00:00"
 * - "30 14 * * *"  → "*-*-* 14:30:00"
 * - "0 0 1 * *"    → "*-*-01 00:00:00"
 */
export function cronToCalendar(cron) {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;

  const [min, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Day of week mapping: cron uses 0=Sun, 1=Mon, ..., 6=Sat
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let dowPart = '';

  if (dayOfWeek !== '*') {
    // Handle ranges like "1-5"
    const rangeMatch = dayOfWeek.match(/^(\d)-(\d)$/);
    if (rangeMatch) {
      const start = dayNames[parseInt(rangeMatch[1], 10)];
      const end = dayNames[parseInt(rangeMatch[2], 10)];
      dowPart = `${start}..${end} `;
    } else if (dayOfWeek.includes(',')) {
      // Handle lists like "1,3,5"
      dowPart = dayOfWeek.split(',')
        .map((d) => dayNames[parseInt(d, 10)] || d)
        .join(',') + ' ';
    } else {
      const idx = parseInt(dayOfWeek, 10);
      dowPart = (dayNames[idx] || dayOfWeek) + ' ';
    }
  }

  // Date part
  const monthPart = month === '*' ? '*' : month.padStart(2, '0');
  const domPart = dayOfMonth === '*' ? '*' : dayOfMonth.padStart(2, '0');

  // Time part
  const hourPart = hour === '*' ? '*' : hour.padStart(2, '0');
  const minPart = min === '*' ? '*' : min.padStart(2, '0');

  return `${dowPart}*-${monthPart}-${domPart} ${hourPart}:${minPart}:00`;
}

/**
 * Resolve a terminal preset name to a Linux terminal emulator executable.
 * Falls back to x-terminal-emulator (Debian/Ubuntu alternative system) for unknowns.
 * gnome-terminal uses '--' as its exec separator instead of '-e'.
 *
 * @param {string} [program='default'] - Preset name or binary path.
 * @returns {string} Terminal binary name.
 */
function resolveLinuxTerminal(program = 'default') {
  const presets = {
    default: 'x-terminal-emulator',
    alacritty: 'alacritty',
    kitty: 'kitty',
    hyper: 'hyper',
    'gnome-terminal': 'gnome-terminal',
    konsole: 'konsole',
    tilix: 'tilix',
  };
  return presets[program.toLowerCase()] || program;
}
