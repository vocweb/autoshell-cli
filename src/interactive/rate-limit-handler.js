/**
 * Rate limit handler for AutoShell.
 *
 * Monitors PTY output for rate limit patterns, parses wait times,
 * and manages pause/resume cycles. Supports 5 time formats and
 * persistent state for crash recovery.
 */

import { writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { paths } from '../utils/paths.js';
import { resolveRateLimitConfig } from './rate-limit-presets.js';

/**
 * Create a rate limit monitor for a specific task.
 *
 * @param {string} taskId - Task identifier for state persistence.
 * @param {object} rateLimitConfig - Rate limit config (raw, may have preset).
 * @param {object} callbacks - Event callbacks.
 * @param {Function} [callbacks.onRateLimited] - Called when rate limit detected.
 * @param {Function} [callbacks.onResume] - Called when resuming after wait.
 * @param {Function} [callbacks.sendCommand] - Send command to PTY.
 * @returns {object} Monitor with checkLine() and cleanup() methods.
 */
export function createRateLimitMonitor(taskId, rateLimitConfig, callbacks = {}) {
  const config = resolveRateLimitConfig(rateLimitConfig);
  if (!config) return createNoop();

  let detectRegex;
  try {
    detectRegex = new RegExp(config.detect_pattern, 'i');
  } catch {
    return createNoop();
  }

  let isPaused = false;
  let resumeTimer = null;
  let pollingTimer = null;

  /**
   * Check a line of output for rate limit patterns.
   * @param {string} line - Output line to check.
   * @returns {boolean} True if rate limit was detected.
   */
  function checkLine(line) {
    if (isPaused) return false;
    if (!detectRegex.test(line)) return false;

    // Rate limit detected
    isPaused = true;
    const action = config.action || 'pause_and_resume';

    if (callbacks.onRateLimited) {
      callbacks.onRateLimited({ line, action, config });
    }

    switch (action) {
      case 'pause_and_resume':
        handlePauseAndResume(line, config, taskId, callbacks);
        break;
      case 'exit':
        handleExit(callbacks);
        break;
      case 'notify_only':
        // Notification already sent via onRateLimited callback
        isPaused = false;
        break;
    }

    return true;
  }

  function cleanup() {
    if (resumeTimer) clearTimeout(resumeTimer);
    if (pollingTimer) clearInterval(pollingTimer);
    clearState(taskId);
  }

  /**
   * Handle pause_and_resume action.
   */
  function handlePauseAndResume(line, cfg, tid, cbs) {
    let waitMs = null;

    // Try to parse wait time from output
    if (cfg.extract_wait_time) {
      waitMs = parseWaitTime(line, cfg.extract_wait_time);
    }

    // Save state for crash recovery
    const resumeAt = waitMs ? new Date(Date.now() + waitMs).toISOString() : null;
    saveState(tid, { paused_at: new Date().toISOString(), resume_at: resumeAt, attempt: 1 });

    if (waitMs) {
      // Known wait time — schedule resume
      resumeTimer = setTimeout(() => {
        resume(cfg, cbs);
      }, waitMs);
    } else {
      // Unknown wait time — polling mode
      const intervalMs = (cfg.polling_interval_minutes || 5) * 60 * 1000;
      const maxMs = (cfg.max_wait_minutes || 180) * 60 * 1000;
      const startTime = Date.now();

      pollingTimer = setInterval(() => {
        if (Date.now() - startTime > maxMs) {
          clearInterval(pollingTimer);
          isPaused = false;
          return;
        }
        resume(cfg, cbs);
      }, intervalMs);
    }
  }

  /**
   * Send resume command to PTY.
   */
  function resume(cfg, cbs) {
    isPaused = false;
    if (cbs.onResume) cbs.onResume();

    if (cfg.resume_command && cbs.sendCommand) {
      cbs.sendCommand(cfg.resume_command);
    } else if (cbs.sendCommand) {
      cbs.sendCommand('\r'); // Send Enter as default resume
    }

    clearState(taskId);
  }

  /**
   * Handle exit action — send Ctrl+C.
   */
  function handleExit(cbs) {
    if (cbs.sendCommand) {
      cbs.sendCommand('\x03'); // Ctrl+C
    }
    isPaused = false;
  }

  return { checkLine, cleanup, isPaused: () => isPaused };
}

/**
 * Parse wait time from output line using configured pattern and format.
 *
 * @param {string} line - Output line containing wait time info.
 * @param {object} extractConfig - { pattern, format }
 * @returns {number|null} Wait time in milliseconds, or null if parsing fails.
 */
export function parseWaitTime(line, extractConfig) {
  if (!extractConfig || !extractConfig.pattern) return null;

  let match;
  try {
    const regex = new RegExp(extractConfig.pattern);
    match = line.match(regex);
  } catch {
    return null;
  }

  if (!match) return null;

  switch (extractConfig.format) {
    case 'hours_minutes': {
      const hours = parseInt(match[1], 10) || 0;
      const minutes = parseInt(match[2], 10) || 0;
      return (hours * 60 + minutes) * 60 * 1000;
    }

    case 'minutes': {
      const mins = parseInt(match[1], 10) || 0;
      return mins * 60 * 1000;
    }

    case 'seconds': {
      const secs = parseFloat(match[1]) || 0;
      return secs * 1000;
    }

    case 'iso8601': {
      const date = new Date(match[1]);
      if (isNaN(date.getTime())) return null;
      return Math.max(0, date.getTime() - Date.now());
    }

    case 'unix_timestamp': {
      const ts = parseInt(match[1], 10) * 1000;
      return Math.max(0, ts - Date.now());
    }

    default:
      return null;
  }
}

/**
 * Save rate limit state for crash recovery.
 */
async function saveState(taskId, state) {
  try {
    const filePath = join(paths.meta, `${taskId}.rate-limit.json`);
    await writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Non-critical — state persistence is best-effort
  }
}

/**
 * Clear rate limit state file.
 */
async function clearState(taskId) {
  try {
    const filePath = join(paths.meta, `${taskId}.rate-limit.json`);
    await unlink(filePath);
  } catch {
    // File may not exist
  }
}

/**
 * Load persisted rate limit state (for crash recovery).
 *
 * @param {string} taskId - Task identifier.
 * @returns {Promise<object|null>} Saved state or null.
 */
export async function loadRateLimitState(taskId) {
  try {
    const filePath = join(paths.meta, `${taskId}.rate-limit.json`);
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Create a no-op monitor (when no rate limit config provided).
 */
function createNoop() {
  return {
    checkLine: () => false,
    cleanup: () => {},
    isPaused: () => false,
  };
}
