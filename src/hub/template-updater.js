/**
 * Template updater for AutoShell Command Hub.
 *
 * Scans installed templates for Hub source tracking headers,
 * checks for available updates, and downloads newer versions.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import { paths } from '../utils/paths.js';
import { installTemplate } from './template-installer.js';

/**
 * Regex to parse source tracking header from installed templates.
 * Matches: # source: hub:slug@version
 */
const SOURCE_PATTERN = /^#\s*source:\s*hub:(.+?)(?:@(.+))?$/m;

/**
 * Regex to parse auto_update flag from template header.
 */
const AUTO_UPDATE_PATTERN = /^#\s*auto_update:\s*(true|false)$/m;

/**
 * Scan installed command files and extract Hub source information.
 * @returns {Promise<Array<{file: string, slug: string, version: string, autoUpdate: boolean}>>}
 */
export async function scanInstalledTemplates() {
  const installed = [];

  let files;
  try {
    files = await readdir(paths.commands);
  } catch {
    return installed; // Commands dir may not exist
  }

  for (const file of files) {
    if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;

    const filePath = join(paths.commands, file);
    try {
      const content = await readFile(filePath, 'utf-8');
      const sourceMatch = content.match(SOURCE_PATTERN);

      if (sourceMatch) {
        const autoUpdateMatch = content.match(AUTO_UPDATE_PATTERN);
        installed.push({
          file: filePath,
          slug: sourceMatch[1],
          version: sourceMatch[2] || '0.0.0',
          autoUpdate: autoUpdateMatch ? autoUpdateMatch[1] === 'true' : true,
        });
      }
    } catch { /* Skip unreadable files */ }
  }

  return installed;
}

/**
 * Check for and optionally apply updates to installed Hub templates.
 * @param {import('./hub-client.js').HubClient} client - Hub client instance.
 * @param {object} [options] - Update options.
 * @param {string} [options.name] - Only check/update a specific template by slug.
 * @param {boolean} [options.dryRun] - If true, only report available updates.
 * @returns {Promise<{checked: number, updated: number, updates: Array}>} Update results.
 */
export async function checkAndUpdate(client, options = {}) {
  let installed = await scanInstalledTemplates();

  // Filter to specific template if name provided
  if (options.name) {
    installed = installed.filter((t) => t.slug.includes(options.name));
  }

  // Filter to auto-update enabled templates (unless specific name given)
  if (!options.name) {
    installed = installed.filter((t) => t.autoUpdate);
  }

  if (installed.length === 0) {
    console.log(chalk.yellow('No Hub templates found to update.'));
    return { checked: 0, updated: 0, updates: [] };
  }

  // Check for updates via Hub API
  const updatePayload = installed.map((t) => ({ slug: t.slug, version: t.version }));

  let availableUpdates;
  try {
    availableUpdates = await client.checkUpdates(updatePayload);
  } catch (err) {
    throw new Error(`Failed to check for updates: ${err.message}`);
  }

  if (!Array.isArray(availableUpdates) || availableUpdates.length === 0) {
    console.log(chalk.green('All templates are up to date.'));
    return { checked: installed.length, updated: 0, updates: [] };
  }

  console.log(chalk.cyan(`Found ${availableUpdates.length} update(s) available:`));
  for (const update of availableUpdates) {
    const current = installed.find((t) => t.slug === update.slug);
    console.log(chalk.gray(`  ${update.slug}: ${current?.version || '?'} → ${update.version}`));
  }

  if (options.dryRun) {
    return { checked: installed.length, updated: 0, updates: availableUpdates };
  }

  // Apply updates
  let updated = 0;
  for (const update of availableUpdates) {
    try {
      const content = await client.downloadTemplate(update.slug);
      await installTemplate({
        slug: update.slug,
        content,
        metadata: {
          version: update.version,
          author: update.author,
          tags: update.tags,
        },
      });
      updated++;
    } catch (err) {
      console.error(chalk.red(`  Failed to update "${update.slug}": ${err.message}`));
    }
  }

  console.log(chalk.bold(`\nUpdated ${updated} of ${availableUpdates.length} template(s).`));
  return { checked: installed.length, updated, updates: availableUpdates };
}
