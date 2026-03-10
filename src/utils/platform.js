/**
 * OS detection utilities for AutoShell.
 *
 * Provides simple helpers to determine the current platform
 * and select platform-specific behavior.
 */

import { platform } from 'node:os';

/**
 * Get the current OS platform identifier.
 * @returns {'darwin'|'linux'|'win32'} Platform string.
 */
export function getPlatform() {
  return platform();
}

/**
 * Check if the current OS is Windows.
 * @returns {boolean}
 */
export function isWindows() {
  return platform() === 'win32';
}

/**
 * Check if the current OS is macOS.
 * @returns {boolean}
 */
export function isMacOS() {
  return platform() === 'darwin';
}

/**
 * Check if the current OS is Linux.
 * @returns {boolean}
 */
export function isLinux() {
  return platform() === 'linux';
}
