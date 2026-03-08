#!/usr/bin/env node

/**
 * AutoShell CLI — Entry point
 *
 * Cross-platform CLI for managing scheduled shell command sets.
 * Supports macOS (launchd), Linux (systemd), and Windows (schtasks).
 *
 * @see https://github.com/vocweb/autoshell-cli
 */

import { Command } from 'commander';

const program = new Command();

program
  .name('autoshell')
  .description('Cross-platform CLI for managing scheduled shell command sets')
  .version('0.1.0');

// Commands will be registered in subsequent phases:
// Phase 05: install, uninstall, list, status, run, logs
// Phase 12: create, export, validate, add, remove, migrate
// Phase 13: hub search, hub install, hub publish, hub update

program.parse();
