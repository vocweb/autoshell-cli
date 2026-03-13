/**
 * macOS launchd scheduler for AutoShell.
 *
 * Generates plist XML files and uses launchctl to register/unregister
 * scheduled tasks in ~/Library/LaunchAgents/.
 */

import { writeFile, unlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { paths } from '../utils/paths.js';

const exec = promisify(execFile);
const LAUNCH_AGENTS_DIR = join(homedir(), 'Library', 'LaunchAgents');
const LABEL_PREFIX = 'com.autoshell.';

/**
 * Install a task by generating a plist and loading it via launchctl.
 *
 * @param {string} taskId - URL-safe task identifier.
 * @param {object} record - Parsed config record.
 * @param {string} scriptPath - Absolute path to the generated script.
 */
export async function install(taskId, record, scriptPath) {
  const label = `${LABEL_PREFIX}${taskId}`;
  const plistPath = join(LAUNCH_AGENTS_DIR, `${label}.plist`);
  const logDir = join(paths.logs, taskId);

  // Unload existing plist (ignore errors if not loaded)
  await unloadQuietly(plistPath);

  // Generate and write plist
  const plist = generatePlist(label, record, scriptPath, logDir);
  await writeFile(plistPath, plist, 'utf-8');

  // Load the plist
  await exec('launchctl', ['load', plistPath]);
}

/**
 * Uninstall a task by unloading and removing its plist file.
 *
 * @param {string} taskId - URL-safe task identifier.
 */
export async function uninstall(taskId) {
  const label = `${LABEL_PREFIX}${taskId}`;
  const plistPath = join(LAUNCH_AGENTS_DIR, `${label}.plist`);

  await unloadQuietly(plistPath);

  try {
    await unlink(plistPath);
  } catch {
    // File may not exist — safe to ignore
  }
}

/**
 * List all AutoShell tasks registered in LaunchAgents.
 *
 * @returns {Promise<Array<{ id: string, label: string, path: string }>>}
 */
export async function list() {
  const results = [];
  try {
    const files = await readdir(LAUNCH_AGENTS_DIR);
    for (const file of files) {
      if (file.startsWith(LABEL_PREFIX) && file.endsWith('.plist')) {
        const label = file.replace('.plist', '');
        const id = label.replace(LABEL_PREFIX, '');
        results.push({ id, label, path: join(LAUNCH_AGENTS_DIR, file) });
      }
    }
  } catch {
    // Directory may not exist
  }
  return results;
}

/**
 * Check if a task is installed (plist exists in LaunchAgents).
 *
 * @param {string} taskId - URL-safe task identifier.
 * @returns {Promise<boolean>}
 */
export async function isInstalled(taskId) {
  const label = `${LABEL_PREFIX}${taskId}`;
  const items = await list();
  return items.some((item) => item.label === label);
}

/**
 * Generate a launchd plist XML string for a scheduled task.
 * Handles terminal launch mode, schedule, env vars, and log paths.
 *
 * @param {string} label - Full launchd label (e.g. "com.autoshell.my-task").
 * @param {object} record - Parsed config record with schedule, env, terminal, etc.
 * @param {string} scriptPath - Absolute path to the generated shell script.
 * @param {string} logDir - Directory for stdout/stderr log files.
 * @returns {string} Complete plist XML string.
 */
function generatePlist(label, record, scriptPath, logDir) {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"');
  lines.push('  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">');
  lines.push('<plist version="1.0">');
  lines.push('<dict>');

  // Label
  addKeyString(lines, 'Label', label);

  // Program arguments — headless, terminal, or direct
  lines.push('  <key>ProgramArguments</key>');
  lines.push('  <array>');

  const isHeadless = record.terminal?.headless === true;
  const hasTerminal = record.terminal && record.terminal.new_window !== false;

  if (isHeadless || !hasTerminal) {
    // Headless: launchd runs script directly — captures stdout/stderr/exit code
    lines.push('    <string>/bin/bash</string>');
    lines.push(`    <string>${escapeXml(scriptPath)}</string>`);
  } else {
    // Terminal: open in configured terminal app with --args for reliable execution
    const app = resolveTerminalApp(record.terminal.program);
    lines.push('    <string>/usr/bin/open</string>');
    lines.push('    <string>-a</string>');
    lines.push(`    <string>${escapeXml(app)}</string>`);
    lines.push('    <string>-n</string>');
    lines.push('    <string>--args</string>');
    lines.push(`    <string>${escapeXml(scriptPath)}</string>`);
  }

  lines.push('  </array>');

  // Schedule
  const calendar = buildCalendarInterval(record.schedule);
  if (calendar) {
    lines.push('  <key>StartCalendarInterval</key>');
    lines.push(calendar);
  }

  // Environment variables
  if (record.env && Object.keys(record.env).length > 0) {
    lines.push('  <key>EnvironmentVariables</key>');
    lines.push('  <dict>');
    for (const [key, value] of Object.entries(record.env)) {
      addKeyString(lines, key, String(value), '    ');
    }
    lines.push('  </dict>');
  }

  // Working directory — always use HOME as plist CWD to avoid macOS TCC
  // permission errors with protected directories (~/Documents, ~/Desktop).
  // The generated script handles cd to the actual working_dir.
  addKeyString(lines, 'WorkingDirectory', homedir());

  // Logging
  addKeyString(lines, 'StandardOutPath', join(logDir, 'stdout.log'));
  addKeyString(lines, 'StandardErrorPath', join(logDir, 'stderr.log'));

  // RunAtLoad: false
  lines.push('  <key>RunAtLoad</key>');
  lines.push('  <false/>');

  lines.push('</dict>');
  lines.push('</plist>');
  lines.push('');

  return lines.join('\n');
}

/**
 * Build a launchd StartCalendarInterval plist XML fragment from a schedule config.
 * Weekly and multi-weekday schedules produce an <array> of <dict> entries.
 *
 * @param {object} schedule - Schedule config object (type, time, date, weekdays, cron).
 * @returns {string|null} Plist XML fragment string, or null for unsupported schedule types.
 */
function buildCalendarInterval(schedule) {
  const [hour, minute] = (schedule.time || '00:00').split(':').map(Number);

  switch (schedule.type) {
    case 'daily':
      return dictXml({ Hour: hour, Minute: minute });

    case 'once': {
      const [, month, day] = schedule.date.split('-').map(Number);
      return dictXml({ Month: month, Day: day, Hour: hour, Minute: minute });
    }

    case 'weekly': {
      // Map weekday names to launchd day numbers (0=Sun, 1=Mon, ..., 6=Sat)
      const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const entries = schedule.weekdays.map((d) => dictXml({
        Weekday: dayMap[d],
        Hour: hour,
        Minute: minute,
      }));

      if (entries.length === 1) return entries[0];

      // Multiple weekdays → array of dicts
      return `  <array>\n${entries.map((e) => `  ${e}`).join('\n')}\n  </array>`;
    }

    case 'cron':
      // Basic cron support — parse simple patterns
      return parseCronToCalendar(schedule.cron);

    default:
      return null;
  }
}

/**
 * Parse a simple 5-field cron expression into a launchd StartCalendarInterval XML fragment.
 * Supports basic patterns: "0 9 * * *" (daily), "0 9 * * 1-5" (weekday range).
 * Returns null for unsupported patterns (e.g. non-5-field expressions).
 *
 * @param {string} cron - Standard 5-field cron expression.
 * @returns {string|null} Plist XML fragment string, or null if parsing fails.
 */
function parseCronToCalendar(cron) {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [min, hour, , , dayOfWeek] = parts;
  const dict = {};

  if (min !== '*') dict.Minute = parseInt(min, 10);
  if (hour !== '*') dict.Hour = parseInt(hour, 10);

  // Day of week: 0-6 or ranges like 1-5
  if (dayOfWeek !== '*') {
    const rangeMatch = dayOfWeek.match(/^(\d)-(\d)$/);
    if (rangeMatch) {
      // Range → array of dicts
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      const entries = [];
      for (let d = start; d <= end; d++) {
        entries.push(dictXml({ ...dict, Weekday: d }));
      }
      return `  <array>\n${entries.map((e) => `  ${e}`).join('\n')}\n  </array>`;
    }
    dict.Weekday = parseInt(dayOfWeek, 10);
  }

  return dictXml(dict);
}

/**
 * Build a plist <dict> XML fragment from an object of key-integer pairs.
 * Used to construct calendar interval dicts for Hour, Minute, Weekday, etc.
 *
 * @param {Record<string, number>} obj - Key-integer mapping.
 * @returns {string} Indented plist <dict>...</dict> XML string.
 */
function dictXml(obj) {
  const lines = ['  <dict>'];
  for (const [key, value] of Object.entries(obj)) {
    lines.push(`    <key>${key}</key>`);
    lines.push(`    <integer>${value}</integer>`);
  }
  lines.push('  </dict>');
  return lines.join('\n');
}

/**
 * Append a plist <key><string> element pair to an array of lines.
 *
 * @param {string[]} lines - Lines array to append to.
 * @param {string} key - Plist key name.
 * @param {string} value - String value (will be XML-escaped).
 * @param {string} [indent='  '] - Indentation prefix.
 */
function addKeyString(lines, key, value, indent = '  ') {
  lines.push(`${indent}<key>${escapeXml(key)}</key>`);
  lines.push(`${indent}<string>${escapeXml(value)}</string>`);
}

/**
 * Resolve terminal preset name to macOS application name.
 * Falls back to Terminal.app for unknown presets.
 *
 * @param {string} [program='default'] - Preset name or custom app name.
 * @returns {string} macOS application name.
 */
function resolveTerminalApp(program = 'default') {
  const presets = {
    default: 'Terminal',
    iterm: 'iTerm',
    iterm2: 'iTerm',
    warp: 'Warp',
    alacritty: 'Alacritty',
    kitty: 'kitty',
    hyper: 'Hyper',
  };
  return presets[program.toLowerCase()] || program;
}

/**
 * Escape special XML characters for safe embedding in plist attribute values and text nodes.
 * Replaces: & → &amp;, < → &lt;, > → &gt;, " → &quot;
 *
 * @param {string} str - Raw string to escape.
 * @returns {string} XML-safe string.
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Silently unload a plist from launchd via launchctl.
 * Errors are suppressed — the plist may not be loaded or may not exist,
 * which is a normal state during the install-overwrite flow.
 *
 * @param {string} plistPath - Absolute path to the plist file.
 * @returns {Promise<void>}
 */
async function unloadQuietly(plistPath) {
  try {
    await exec('launchctl', ['unload', plistPath]);
  } catch {
    // Not loaded or doesn't exist — safe to ignore
  }
}
