/**
 * PTY-based interactive program runner for AutoShell.
 *
 * Spawns interactive programs (claude, aider, etc.) in a pseudo-terminal
 * so they behave as if running in a real terminal. Monitors output for
 * auto-responses and rate limit detection.
 *
 * Uses node-pty when available, falls back to child_process spawn.
 */

import { spawn } from 'node:child_process';
import { createAutoResponder } from './auto-responder.js';

// Attempt to load node-pty (optional dependency)
let nodePty = null;
try {
  nodePty = await import('node-pty');
} catch {
  // node-pty not available — will use fallback
}

/**
 * Run an interactive program block.
 *
 * @param {object} config - Interactive config block.
 * @param {string} config.program - Program to spawn.
 * @param {string[]} config.inputs - Inputs to send sequentially.
 * @param {Array} [config.auto_responses] - Auto-response rules.
 * @param {object} options - Runtime options.
 * @param {string} [options.workingDir] - Working directory.
 * @param {object} [options.env] - Environment variables.
 * @param {Function} [options.onOutput] - Callback for each output line.
 * @param {Function} [options.onRateLimit] - Callback when rate limit detected.
 * @returns {Promise<{ exitCode: number, output: string }>}
 */
export async function runInteractive(config, options = {}) {
  if (nodePty) {
    return runWithPty(config, options);
  }
  return runWithSpawn(config, options);
}

/**
 * Run using node-pty (preferred — full PTY emulation).
 */
async function runWithPty(config, options) {
  const responder = createAutoResponder(config.auto_responses);
  const output = [];
  let inputIndex = 0;

  return new Promise((resolve) => {
    const ptyProcess = nodePty.spawn(config.program, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: options.workingDir || process.cwd(),
      env: { ...process.env, ...options.env },
    });

    // Buffer for line assembly from PTY chunks
    let lineBuffer = '';

    ptyProcess.onData((data) => {
      output.push(data);
      process.stdout.write(data);

      // Process line by line for auto-responder
      lineBuffer += data;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop(); // Keep incomplete last line in buffer

      for (const line of lines) {
        processOutputLine(line, responder, ptyProcess, config, options);
      }

      // Also check the buffered partial line (some prompts don't end with newline)
      if (lineBuffer.length > 0) {
        const response = responder(lineBuffer);
        if (response) {
          setTimeout(() => {
            ptyProcess.write(response + '\r');
          }, 500);
          lineBuffer = '';
        }
      }
    });

    // Send inputs with delays
    sendInputsSequentially(config.inputs, ptyProcess, 2000);

    ptyProcess.onExit(({ exitCode }) => {
      resolve({ exitCode: exitCode || 0, output: output.join('') });
    });
  });
}

/**
 * Fallback: run with child_process spawn (no PTY).
 * Interactive features are limited without PTY.
 */
async function runWithSpawn(config, options) {
  if (!nodePty) {
    console.warn('Warning: node-pty not available, interactive features may be limited');
  }

  const output = [];

  return new Promise((resolve, reject) => {
    const child = spawn(config.program, [], {
      cwd: options.workingDir || process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const responder = createAutoResponder(config.auto_responses);

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output.push(text);
      process.stdout.write(text);

      // Check for auto-responses
      for (const line of text.split('\n')) {
        const response = responder(line);
        if (response) {
          setTimeout(() => {
            child.stdin.write(response + '\n');
          }, 500);
        }
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      output.push(text);
      process.stderr.write(text);
    });

    // Send inputs sequentially via stdin
    sendInputsToStdin(config.inputs, child.stdin, 2000);

    child.on('close', (code) => {
      resolve({ exitCode: code || 0, output: output.join('') });
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start "${config.program}": ${err.message}`));
    });
  });
}

/**
 * Process an output line through the auto-responder.
 */
function processOutputLine(line, responder, ptyProcess, config, options) {
  if (options.onOutput) {
    options.onOutput(line);
  }

  const response = responder(line);
  if (response) {
    setTimeout(() => {
      ptyProcess.write(response + '\r');
    }, 500);
  }
}

/**
 * Send inputs sequentially to PTY with delays between each.
 */
function sendInputsSequentially(inputs, ptyProcess, delayMs) {
  if (!inputs || inputs.length === 0) return;

  let index = 0;
  const sendNext = () => {
    if (index >= inputs.length) return;
    const input = inputs[index];
    ptyProcess.write(input + '\r');
    index++;
    if (index < inputs.length) {
      setTimeout(sendNext, delayMs);
    }
  };

  // Wait a bit for program to start before sending first input
  setTimeout(sendNext, 3000);
}

/**
 * Send inputs sequentially to child process stdin.
 */
function sendInputsToStdin(inputs, stdin, delayMs) {
  if (!inputs || inputs.length === 0) return;

  let index = 0;
  const sendNext = () => {
    if (index >= inputs.length) {
      stdin.end();
      return;
    }
    stdin.write(inputs[index] + '\n');
    index++;
    setTimeout(sendNext, delayMs);
  };

  setTimeout(sendNext, 3000);
}
