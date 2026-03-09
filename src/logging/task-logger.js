/**
 * Task logger for AutoShell.
 *
 * Logs stdout/stderr from task runs to timestamped files.
 * Supports realtime tee mode (terminal + file simultaneously).
 * Format: [HH:MM:SS] [stdout|stderr] <line>
 */

import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../utils/paths.js';

export class TaskLogger {
  /**
   * Create a new task logger.
   *
   * @param {string} taskId - URL-safe task identifier.
   * @param {object} [loggingConfig] - Logging configuration.
   * @param {boolean} [loggingConfig.enabled=true] - Whether logging is enabled.
   * @param {string} [loggingConfig.dir] - Custom log directory (default: ~/.autoshell/logs).
   */
  constructor(taskId, loggingConfig = {}) {
    this.taskId = taskId;
    this.enabled = loggingConfig.enabled !== false;
    this.stream = null;
    this.logPath = null;

    if (!this.enabled) return;

    // Create log directory for this task
    const logDir = join(loggingConfig.dir || paths.logs, taskId);
    mkdirSync(logDir, { recursive: true });

    // Create timestamped log file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    this.logPath = join(logDir, `${timestamp}.log`);
    this.stream = createWriteStream(this.logPath, { flags: 'a' });
  }

  /**
   * Log a stdout line.
   * @param {string} line - Output line to log.
   */
  writeStdout(line) {
    this._write('stdout', line);
  }

  /**
   * Log a stderr line.
   * @param {string} line - Error line to log.
   */
  writeStderr(line) {
    this._write('stderr', line);
  }

  /**
   * Get the path to the current log file.
   * @returns {string|null}
   */
  getLogPath() {
    return this.logPath;
  }

  /**
   * Close the log file handle.
   * @returns {Promise<void>} Resolves when the stream is fully flushed.
   */
  close() {
    return new Promise((resolve) => {
      if (this.stream) {
        this.stream.end(() => {
          this.stream = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Write a formatted log line.
   */
  _write(channel, line) {
    if (!this.enabled || !this.stream) return;

    const now = new Date();
    const time = [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join(':');

    this.stream.write(`[${time}] [${channel}] ${line}\n`);
  }
}
