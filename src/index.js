#!/usr/bin/env node

/**
 * AutoShell CLI — Entry point
 *
 * Cross-platform CLI for managing scheduled shell command sets.
 * Supports macOS (launchd), Linux (systemd), and Windows (schtasks).
 *
 * @see https://github.com/vocweb/autoshell-cli
 */

import { readFileSync } from 'node:fs';
import { Command } from 'commander';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
import { registerInstallCommand } from './cli-commands/install.js';
import { registerUninstallCommand } from './cli-commands/uninstall.js';
import { registerListCommand } from './cli-commands/list.js';
import { registerStatusCommand } from './cli-commands/status.js';
import { registerRunCommand } from './cli-commands/run.js';
import { registerLogsCommand } from './cli-commands/logs.js';
import { registerCreateCommand } from './cli-commands/create/index.js';
import { registerExportCommand } from './cli-commands/export.js';
import { registerValidateCommand } from './cli-commands/validate.js';
import { registerAddCommand } from './cli-commands/add.js';
import { registerRemoveCommand } from './cli-commands/remove.js';
import { registerMigrateCommand } from './cli-commands/migrate.js';
import { registerEditCommand } from './cli-commands/edit.js';
import { registerHubCommand } from './cli-commands/hub.js';

const program = new Command();

program
  .name('autoshell')
  .description('Cross-platform CLI for managing scheduled shell command sets')
  .version(pkg.version);

// Core commands (Phase 05)
registerInstallCommand(program);
registerUninstallCommand(program);
registerListCommand(program);
registerStatusCommand(program);
registerRunCommand(program);
registerLogsCommand(program);

// Advanced commands (Phase 12)
registerCreateCommand(program);
registerExportCommand(program);
registerValidateCommand(program);
registerAddCommand(program);
registerRemoveCommand(program);
registerMigrateCommand(program);
registerEditCommand(program);

// Hub commands (Phase 13)
registerHubCommand(program);

program.parse();
