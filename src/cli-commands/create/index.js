/**
 * CLI command: autoshell create
 *
 * Interactive wizard that creates an annotated YAML config file.
 * Three modes: simple (shell commands), ai-agent (interactive + rate limit),
 * and full (all options). Output includes commented explanations for
 * optional fields the user did not configure.
 *
 * Flags:
 *   -o, --output <file>  Override output file path
 *   -e, --edit           Open the generated file in the user's editor after creation
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import { paths, ensureDirs } from '../../utils/paths.js';
import { taskId } from '../../utils/task-id.js';
import { runWizardPrompts } from './wizard-prompts.js';
import { buildSkeleton } from './yaml-skeleton-builder.js';
import { openInEditor } from '../../utils/open-editor.js';

/**
 * Register the create command with the commander program.
 *
 * @param {import('commander').Command} program - Commander program instance.
 */
export function registerCreateCommand(program) {
  program
    .command('create')
    .description('Interactive wizard to create a command config')
    .option('-o, --output <file>', 'Output file path (default: ~/.autoshell/commands/<slug>.yaml)')
    .option('-e, --edit', 'Open the generated file in your editor after creation')
    .action(async (options) => {
      try {
        await runCreate(options);
      } catch (err) {
        if (err.name === 'ExitPromptError') {
          // User pressed Ctrl+C during prompts — exit cleanly
          console.log(chalk.dim('\nCancelled.'));
          return;
        }
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });
}

/**
 * Run the create wizard, build the annotated YAML skeleton, and write to file.
 *
 * @param {{ output?: string, edit?: boolean }} options - Commander options.
 */
async function runCreate(options) {
  console.log(chalk.bold('AutoShell - Create New Task\n'));

  // Collect answers interactively based on the selected mode
  const answers = await runWizardPrompts();

  // Build the annotated YAML string (raw template, NOT YAML.stringify)
  const yamlContent = buildSkeleton(answers);

  // Determine output path
  const slug = taskId(answers.name);
  const outputPath = options.output || join(paths.commands, `${slug}.yaml`);

  // Ensure ~/.autoshell/commands/ exists, then write file
  ensureDirs();
  await writeFile(outputPath, yamlContent, 'utf-8');

  console.log(chalk.green(`\n✓ Saved to: ${outputPath}`));

  if (options.edit) {
    // Open in editor immediately; CLI returns without waiting for editor to close
    openInEditor(outputPath);
    console.log(chalk.dim('\nOpened in editor. Edit the commented sections, then:'));
    console.log(chalk.dim(`  autoshell validate ${outputPath}`));
    console.log(chalk.dim(`  autoshell install ${outputPath}`));
  } else {
    console.log(chalk.dim('\nNext steps:'));
    console.log(chalk.dim(`  1. Edit the config:  $EDITOR ${outputPath}`));
    console.log(chalk.dim(`  2. Validate:         autoshell validate ${outputPath}`));
    console.log(chalk.dim(`  3. Install:          autoshell install ${outputPath}`));
  }
}
