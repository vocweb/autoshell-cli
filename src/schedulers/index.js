/**
 * Scheduler factory for AutoShell.
 *
 * Auto-detects the current OS and returns the appropriate scheduler module.
 * Each scheduler implements: install, uninstall, list, isInstalled.
 */

import { getPlatform } from '../utils/platform.js';

/**
 * Get the scheduler module for the current platform.
 *
 * @returns {Promise<object>} Scheduler module with install/uninstall/list/isInstalled.
 * @throws {Error} If the current platform is not supported.
 */
export async function getScheduler() {
  const platform = getPlatform();

  switch (platform) {
    case 'darwin':
      return import('./launchd.js');
    case 'linux':
      return import('./systemd.js');
    case 'win32':
      return import('./task-scheduler.js');
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}
