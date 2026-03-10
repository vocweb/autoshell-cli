/**
 * Terminal launcher for AutoShell.
 *
 * Opens configured terminal emulators and runs task scripts inside.
 * Supports preset terminal names per OS, custom executable paths,
 * profiles, extra arguments, and inline execution mode.
 */

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getPlatform } from '../utils/platform.js';

const execFileAsync = promisify(execFile);

// Terminal preset mappings per platform
const PRESETS = {
  darwin: {
    default: { app: 'Terminal', method: 'open' },
    iterm2: { app: 'iTerm', method: 'open' },
    warp: { app: 'Warp', method: 'open' },
    alacritty: { bin: 'alacritty', args: ['-e'] },
    kitty: { bin: 'kitty', args: [] },
    hyper: { app: 'Hyper', method: 'open' },
  },
  win32: {
    default: { bin: 'cmd', args: ['/c', 'start', 'cmd', '/c'] },
    'windows-terminal': { bin: 'wt.exe', args: ['cmd', '/c'] },
    cmder: { bin: 'cmder', args: ['/TASK'] },
    alacritty: { bin: 'alacritty', args: ['-e', 'cmd', '/c'] },
    hyper: { bin: 'hyper', args: [] },
  },
  linux: {
    default: { bin: null, fallbackChain: ['x-terminal-emulator', 'gnome-terminal', 'xterm'] },
    alacritty: { bin: 'alacritty', args: ['-e'] },
    kitty: { bin: 'kitty', args: [] },
    hyper: { bin: 'hyper', args: [] },
    'gnome-terminal': { bin: 'gnome-terminal', args: ['--'] },
    konsole: { bin: 'konsole', args: ['-e'] },
    tilix: { bin: 'tilix', args: ['-e'] },
  },
};

/**
 * Launch a script in a terminal emulator.
 *
 * @param {string} scriptPath - Absolute path to the script to execute.
 * @param {object} terminalConfig - Terminal config from settings.
 * @param {string} [terminalConfig.program='default'] - Preset name or absolute path.
 * @param {boolean} [terminalConfig.new_window=true] - Open in new window or run inline.
 * @param {string} [terminalConfig.profile] - Terminal profile name.
 * @param {string[]} [terminalConfig.args] - Extra CLI arguments.
 */
export async function launchInTerminal(scriptPath, terminalConfig = {}) {
  const config = {
    program: terminalConfig.program || 'default',
    new_window: terminalConfig.new_window !== false,
    profile: terminalConfig.profile || null,
    args: terminalConfig.args || [],
  };

  // Inline execution: run in current terminal
  if (!config.new_window) {
    return runInline(scriptPath);
  }

  const platform = getPlatform();

  // Custom absolute path
  if (config.program.startsWith('/') || config.program.includes('\\')) {
    return launchCustom(scriptPath, config);
  }

  // Resolve preset
  const preset = resolvePreset(config.program, platform);
  if (!preset) {
    throw new Error(`Terminal preset "${config.program}" not available on ${platform}`);
  }

  return launchWithPreset(scriptPath, preset, config, platform);
}

/**
 * Resolve a preset name to its configuration for the current platform.
 *
 * @param {string} name - Preset name (e.g. 'iterm2', 'alacritty').
 * @param {string} platform - OS platform from getPlatform() ('darwin'|'linux'|'win32').
 * @returns {object|null} Preset config object or null if not found.
 */
function resolvePreset(name, platform) {
  const platformPresets = PRESETS[platform];
  if (!platformPresets) return null;
  return platformPresets[name] || null;
}

/**
 * Launch a script using a resolved preset configuration.
 *
 * Handles three distinct launch strategies:
 *   - macOS `open -a <App>` for app-bundle terminals (Terminal.app, iTerm2, Warp)
 *   - Linux fallback chain to find the first available terminal binary
 *   - Standard binary launch for all other presets
 *
 * @param {string} scriptPath - Absolute path to the script to execute.
 * @param {object} preset - Resolved preset config from PRESETS.
 * @param {object} config - Merged terminal config (program, profile, args).
 * @param {string} platform - Current OS platform identifier.
 * @returns {Promise<number>} PID of the spawned terminal process.
 */
async function launchWithPreset(scriptPath, preset, config, platform) {
  // macOS: use `open -a <app>` method
  if (preset.method === 'open' && platform === 'darwin') {
    // Pass script path directly — quarantine removal + shebang handles execution
    // Don't add /bin/bash: only Terminal.app interprets --args as commands, others (iTerm2) don't
    const args = ['open', '-a', preset.app, '-n', '--args', scriptPath, ...config.args];
    return spawnDetached(args[0], args.slice(1));
  }

  // Linux default: try fallback chain
  if (preset.fallbackChain) {
    const bin = await findFirstAvailable(preset.fallbackChain);
    if (!bin) {
      throw new Error(`No terminal emulator found. Tried: ${preset.fallbackChain.join(', ')}`);
    }
    const termArgs = bin === 'gnome-terminal' ? ['--'] : ['-e'];
    return spawnDetached(bin, [...termArgs, scriptPath, ...config.args]);
  }

  // Standard binary launch
  if (!preset.bin) {
    throw new Error('Terminal preset has no binary configured');
  }

  await validateExecutable(preset.bin);

  const args = [...(preset.args || [])];

  // Add profile option if supported
  if (config.profile) {
    args.push('--profile', config.profile);
  }

  args.push(scriptPath, ...config.args);
  return spawnDetached(preset.bin, args);
}

/**
 * Launch a script using a fully-qualified custom executable path.
 * Validates the executable exists before attempting to spawn.
 *
 * @param {string} scriptPath - Absolute path to the script to execute.
 * @param {object} config - Terminal config with program (full path) and args.
 * @returns {Promise<number>} PID of the spawned terminal process.
 */
async function launchCustom(scriptPath, config) {
  await validateExecutable(config.program);

  const args = [...config.args, scriptPath];
  return spawnDetached(config.program, args);
}

/**
 * Run a script inline in the current terminal session (no new window).
 * Used when `new_window: false` is set in terminal config.
 * Inherits stdin/stdout/stderr from the parent process.
 *
 * @param {string} scriptPath - Absolute path to the script to execute.
 * @returns {Promise<number>} Exit code from the script.
 */
function runInline(scriptPath) {
  const platform = getPlatform();
  const shell = platform === 'win32' ? 'cmd' : '/bin/bash';
  const args = platform === 'win32' ? ['/c', scriptPath] : [scriptPath];

  return new Promise((resolve, reject) => {
    const child = spawn(shell, args, { stdio: 'inherit' });
    child.on('close', (code) => resolve(code));
    child.on('error', (err) => reject(err));
  });
}

/**
 * Spawn a process in detached mode so it survives the parent CLI exiting.
 * Used for new terminal window launches where the user continues working
 * independently in the opened terminal.
 *
 * @param {string} bin - Executable name or absolute path.
 * @param {string[]} args - Arguments to pass to the executable.
 * @returns {number} PID of the spawned child process.
 */
function spawnDetached(bin, args) {
  const child = spawn(bin, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return child.pid;
}

/**
 * Validate that an executable is available on the system PATH.
 * Uses `which` on Unix and `where` on Windows.
 *
 * @param {string} name - Executable name to check.
 * @returns {Promise<void>} Resolves if found.
 * @throws {Error} If the executable is not found in PATH.
 */
async function validateExecutable(name) {
  const cmd = getPlatform() === 'win32' ? 'where' : 'which';
  try {
    await execFileAsync(cmd, [name]);
  } catch {
    throw new Error(`Executable not found: "${name}". Ensure it is installed and in PATH.`);
  }
}

/**
 * Find the first available executable from a list of candidates.
 * Used for the Linux default terminal fallback chain where no single
 * terminal emulator is guaranteed to be installed.
 *
 * @param {string[]} candidates - Ordered list of executable names to try.
 * @returns {Promise<string|null>} First found executable name, or null if none available.
 */
async function findFirstAvailable(candidates) {
  for (const candidate of candidates) {
    try {
      await execFileAsync('which', [candidate]);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}
