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
 */
function resolvePreset(name, platform) {
  const platformPresets = PRESETS[platform];
  if (!platformPresets) return null;
  return platformPresets[name] || null;
}

/**
 * Launch using a resolved preset configuration.
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
 * Launch with a custom executable path.
 */
async function launchCustom(scriptPath, config) {
  await validateExecutable(config.program);

  const args = [...config.args, scriptPath];
  return spawnDetached(config.program, args);
}

/**
 * Run script inline in the current terminal (no new window).
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
 * Spawn a detached process (for new terminal windows).
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
 * Validate that an executable exists on the system.
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
 * Find the first available executable from a list (Linux fallback chain).
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
