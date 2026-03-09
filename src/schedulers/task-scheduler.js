/**
 * Windows Task Scheduler for AutoShell.
 *
 * Uses schtasks CLI to create, delete, and query scheduled tasks.
 * Task names follow the format: AutoShell_<task-id>
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const TASK_PREFIX = 'AutoShell_';

// Weekday short names to schtasks day format
const WEEKDAY_MAP = {
  Mon: 'MON', Tue: 'TUE', Wed: 'WED', Thu: 'THU',
  Fri: 'FRI', Sat: 'SAT', Sun: 'SUN',
};

/**
 * Install a task via schtasks /create.
 *
 * @param {string} taskId - URL-safe task identifier.
 * @param {object} record - Parsed config record.
 * @param {string} scriptPath - Absolute path to the generated .bat script.
 */
export async function install(taskId, record, scriptPath) {
  const taskName = `${TASK_PREFIX}${taskId}`;
  const args = buildCreateArgs(taskName, record.schedule, scriptPath);

  await exec('schtasks', args);
}

/**
 * Uninstall a task via schtasks /delete.
 *
 * @param {string} taskId - URL-safe task identifier.
 */
export async function uninstall(taskId) {
  const taskName = `${TASK_PREFIX}${taskId}`;
  try {
    await exec('schtasks', ['/delete', '/tn', taskName, '/f']);
  } catch {
    // Task may not exist
  }
}

/**
 * List all AutoShell tasks registered in Task Scheduler.
 *
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
export async function list() {
  try {
    const { stdout } = await exec('schtasks', [
      '/query', '/fo', 'CSV', '/nh',
    ]);

    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes(TASK_PREFIX))
      .map((line) => {
        // CSV format: "\\TaskName","Next Run Time","Status"
        const name = line.split(',')[0].replace(/"/g, '').replace(/^\\/, '');
        const id = name.replace(TASK_PREFIX, '');
        return { id, name };
      });
  } catch {
    return [];
  }
}

/**
 * Check if a task is registered in Task Scheduler.
 *
 * @param {string} taskId - URL-safe task identifier.
 * @returns {Promise<boolean>}
 */
export async function isInstalled(taskId) {
  const taskName = `${TASK_PREFIX}${taskId}`;
  try {
    await exec('schtasks', ['/query', '/tn', taskName]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build schtasks /create arguments from schedule config.
 */
function buildCreateArgs(taskName, schedule, scriptPath) {
  const args = ['/create', '/tn', taskName, '/tr', scriptPath, '/f'];

  switch (schedule.type) {
    case 'daily':
      args.push('/sc', 'DAILY', '/st', schedule.time);
      break;

    case 'once':
      args.push('/sc', 'ONCE', '/st', schedule.time, '/sd', toWindowsDate(schedule.date));
      break;

    case 'weekly': {
      const days = schedule.weekdays.map((d) => WEEKDAY_MAP[d] || d).join(',');
      args.push('/sc', 'WEEKLY', '/d', days, '/st', schedule.time);
      break;
    }

    case 'cron':
      // Limited cron support: fall back to DAILY for complex patterns
      args.push('/sc', 'DAILY', '/st', parseCronTime(schedule.cron));
      break;

    default:
      args.push('/sc', 'DAILY', '/st', schedule.time || '00:00');
  }

  return args;
}

/**
 * Convert YYYY-MM-DD to MM/DD/YYYY for schtasks.
 *
 * @param {string} date - ISO date string.
 * @returns {string} Windows date format.
 */
function toWindowsDate(date) {
  const [year, month, day] = date.split('-');
  return `${month}/${day}/${year}`;
}

/**
 * Extract time from a cron expression (basic support).
 * Returns HH:MM from minute and hour fields.
 *
 * @param {string} cron - Cron expression.
 * @returns {string} Time in HH:MM format.
 */
function parseCronTime(cron) {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 2) return '00:00';

  const min = parts[0] === '*' ? '00' : parts[0].padStart(2, '0');
  const hour = parts[1] === '*' ? '00' : parts[1].padStart(2, '0');
  return `${hour}:${min}`;
}
