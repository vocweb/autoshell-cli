/**
 * Template publisher for AutoShell Command Hub.
 *
 * Validates local command config files and uploads them to the Hub
 * as shareable templates. Requires authentication.
 */

import { readFile } from 'node:fs/promises';
import chalk from 'chalk';
import YAML from 'yaml';
import { parseConfig } from '../config/parser.js';

/**
 * Validate and publish a local config file to the Hub.
 * @param {import('./hub-client.js').HubClient} client - Authenticated Hub client.
 * @param {string} filePath - Path to the YAML config file.
 * @param {object} [options] - Publish options.
 * @param {string} [options.description] - Template description override.
 * @param {string} [options.category] - Template category.
 * @param {string[]} [options.tags] - Template tags.
 * @returns {Promise<object>} Publish result from the Hub API.
 * @throws {Error} If validation fails or publish request fails.
 */
export async function publishTemplate(client, filePath, options = {}) {
  // Validate the config file before publishing
  await parseConfig(filePath);

  const yamlContent = await readFile(filePath, 'utf-8');
  const parsed = YAML.parse(yamlContent);

  // Build metadata from config and options
  const metadata = {
    title: parsed.name || parsed.records?.[0]?.name || 'Untitled',
    description: options.description || parsed.description || '',
    category: options.category || '',
    tags: options.tags || [],
  };

  console.log(chalk.cyan(`Publishing "${metadata.title}" to Hub...`));

  const result = await client.publishTemplate(yamlContent, metadata);

  console.log(chalk.green(`✓ Published "${metadata.title}" to Hub`));
  if (result.slug) {
    console.log(chalk.gray(`  slug: ${result.slug}`));
  }

  return result;
}
