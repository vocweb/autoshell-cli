/**
 * Path constants and directory management for AutoShell.
 *
 * All data is stored under ~/.autoshell/ with subdirectories for
 * commands, scripts, logs, and metadata.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const AUTOSHELL_DIR = join(homedir(), '.autoshell');

/**
 * Standard path constants for AutoShell data storage.
 */
export const paths = {
  /** Root directory: ~/.autoshell/ */
  root: AUTOSHELL_DIR,

  /** Global config file: ~/.autoshell/config.yaml */
  config: join(AUTOSHELL_DIR, 'config.yaml'),

  /** Command config files: ~/.autoshell/commands/ (one YAML per task) */
  commands: join(AUTOSHELL_DIR, 'commands'),

  /** Generated scripts: ~/.autoshell/scripts/ (.sh or .bat) */
  scripts: join(AUTOSHELL_DIR, 'scripts'),

  /** Task logs: ~/.autoshell/logs/<task-id>/<timestamp>.log */
  logs: join(AUTOSHELL_DIR, 'logs'),

  /** Task metadata: ~/.autoshell/meta/<task-id>.json */
  meta: join(AUTOSHELL_DIR, 'meta'),
};

/**
 * Ensure all required directories exist, creating them recursively if needed.
 */
export function ensureDirs() {
  for (const dir of [paths.commands, paths.scripts, paths.logs, paths.meta]) {
    mkdirSync(dir, { recursive: true });
  }
}
