/**
 * Remove macOS quarantine extended attribute from generated scripts.
 * Prevents Gatekeeper permission popup when running AutoShell-generated scripts.
 * No-op on non-macOS platforms.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getPlatform } from './platform.js';

const exec = promisify(execFile);

/**
 * Remove com.apple.quarantine xattr from a file.
 * Safe to call on any platform — silently skips non-macOS.
 *
 * @param {string} filePath - Absolute path to the file.
 */
export async function removeQuarantine(filePath) {
  if (getPlatform() !== 'darwin') return;
  try {
    await exec('xattr', ['-d', 'com.apple.quarantine', filePath]);
  } catch {
    // File may not have quarantine attribute — safe to ignore
  }
}
