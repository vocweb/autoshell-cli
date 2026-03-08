/**
 * Log rotation for AutoShell.
 *
 * Deletes old log files based on retention (days) and max total size.
 * Triggered after each task run completes.
 */

import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { paths } from '../utils/paths.js';

/**
 * Rotate logs for a specific task.
 *
 * @param {string} taskId - Task identifier.
 * @param {object} config - Rotation config.
 * @param {string} [config.max_size='10MB'] - Max total log size (e.g., "10MB", "500KB", "1GB").
 * @param {number} [config.retention=7] - Days to keep logs.
 */
export async function rotateTaskLogs(taskId, config = {}) {
  const logDir = join(paths.logs, taskId);
  const maxBytes = parseSize(config.max_size || '10MB');
  const retentionDays = config.retention || 7;

  let logFiles;
  try {
    const files = await readdir(logDir);
    logFiles = files.filter((f) => f.endsWith('.log'));
  } catch {
    return; // No log directory
  }

  if (logFiles.length === 0) return;

  // Get file stats
  const fileStats = await Promise.all(
    logFiles.map(async (file) => {
      const filePath = join(logDir, file);
      try {
        const s = await stat(filePath);
        return { file, path: filePath, size: s.size, mtime: s.mtime };
      } catch {
        return null;
      }
    }),
  );

  const validFiles = fileStats.filter(Boolean).sort((a, b) => a.mtime - b.mtime);

  // 1. Delete logs older than retention days
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const remaining = [];

  for (const f of validFiles) {
    if (f.mtime.getTime() < cutoff) {
      await safeUnlink(f.path);
    } else {
      remaining.push(f);
    }
  }

  // 2. Delete oldest logs until total size is under max_size
  let totalSize = remaining.reduce((sum, f) => sum + f.size, 0);

  for (const f of remaining) {
    if (totalSize <= maxBytes) break;
    await safeUnlink(f.path);
    totalSize -= f.size;
  }
}

/**
 * Parse a human-readable size string to bytes.
 *
 * @param {string} sizeStr - Size string like "10MB", "500KB", "1GB".
 * @returns {number} Size in bytes.
 *
 * @example
 * parseSize("10MB")  // → 10485760
 * parseSize("500KB") // → 512000
 * parseSize("1GB")   // → 1073741824
 */
export function parseSize(sizeStr) {
  const match = String(sizeStr).match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB)$/i);
  if (!match) return 10 * 1024 * 1024; // Default 10MB

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  switch (unit) {
    case 'KB': return Math.round(value * 1024);
    case 'MB': return Math.round(value * 1024 * 1024);
    case 'GB': return Math.round(value * 1024 * 1024 * 1024);
    default: return Math.round(value);
  }
}

/**
 * Delete a file, ignoring errors if it doesn't exist.
 */
async function safeUnlink(filePath) {
  try {
    await unlink(filePath);
  } catch {
    // File may already be deleted
  }
}
