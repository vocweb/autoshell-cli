/**
 * Template installer for AutoShell Command Hub.
 *
 * Downloads templates from the Hub, resolves template variables
 * ({{var}} placeholders), and saves resolved configs to the
 * commands directory with source tracking headers.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import { paths, ensureDirs } from '../utils/paths.js';

/**
 * Regex to match template variable placeholders like {{variable_name}}.
 */
const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Extract all unique variable names from a template string.
 * @param {string} content - YAML template content.
 * @returns {string[]} Array of unique variable names.
 */
export function extractVariables(content) {
  const vars = new Set();
  let match;
  while ((match = VARIABLE_PATTERN.exec(content)) !== null) {
    vars.add(match[1]);
  }
  return [...vars];
}

/**
 * Resolve template variables by replacing {{var}} placeholders with values.
 * @param {string} content - Template content with placeholders.
 * @param {Record<string, string>} values - Variable name-value map.
 * @returns {string} Resolved content.
 */
export function resolveVariables(content, values) {
  return content.replace(VARIABLE_PATTERN, (fullMatch, varName) => {
    if (varName in values) return values[varName];
    return fullMatch; // Keep unresolved placeholders
  });
}

/**
 * Build variable values from schema defaults and user-provided overrides.
 * Warns about required variables that have no value.
 * @param {Array<{name: string, required?: boolean, default?: string}>} schema - Variable schema.
 * @param {Record<string, string>} userValues - User-provided values.
 * @returns {{values: Record<string, string>, warnings: string[]}} Resolved values and warnings.
 */
export function buildVariableValues(schema, userValues = {}) {
  const values = {};
  const warnings = [];

  for (const variable of schema) {
    const { name } = variable;
    if (name in userValues) {
      values[name] = userValues[name];
    } else if (variable.default !== undefined) {
      values[name] = String(variable.default);
    } else if (variable.required) {
      warnings.push(`Required variable "${name}" has no value or default`);
    }
  }

  return { values, warnings };
}

/**
 * Generate a source tracking comment header for installed templates.
 * @param {string} slug - Template slug (e.g. "ai/claude-review").
 * @param {string} [version] - Template version.
 * @param {string} [author] - Template author.
 * @param {string[]} [tags] - Template tags.
 * @param {boolean} [autoUpdate] - Whether auto-update is enabled.
 * @returns {string} Comment header string.
 */
export function buildSourceHeader(slug, version, author, tags, autoUpdate = true) {
  const lines = [`# source: hub:${slug}${version ? `@${version}` : ''}`];
  if (author) lines.push(`# author: ${author}`);
  if (tags && tags.length > 0) lines.push(`# tags: [${tags.join(', ')}]`);
  lines.push(`# auto_update: ${autoUpdate}`);
  lines.push('');
  return lines.join('\n');
}

/**
 * Install a template from the Hub to the local commands directory.
 * @param {object} options - Install options.
 * @param {string} options.slug - Template slug.
 * @param {string} options.content - Raw YAML template content.
 * @param {Record<string, string>} [options.variables] - Resolved variable values.
 * @param {object} [options.metadata] - Template metadata (version, author, tags).
 * @returns {Promise<string>} Path to the saved command file.
 */
export async function installTemplate({ slug, content, variables = {}, metadata = {} }) {
  ensureDirs();

  // Resolve template variables
  let resolved = content;
  if (Object.keys(variables).length > 0) {
    resolved = resolveVariables(content, variables);
  }

  // Add source tracking header
  const header = buildSourceHeader(
    slug,
    metadata.version,
    metadata.author,
    metadata.tags,
    metadata.autoUpdate !== false,
  );

  const finalContent = header + resolved;

  // Save to commands directory using slug filename
  const fileName = slug.replace(/\//g, '-') + '.yaml';
  const filePath = join(paths.commands, fileName);
  await writeFile(filePath, finalContent, 'utf-8');

  console.log(chalk.green(`✓ Installed "${slug}" → ${filePath}`));
  return filePath;
}
