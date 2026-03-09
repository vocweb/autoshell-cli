/**
 * Config parser for AutoShell.
 *
 * Loads config from local file (YAML/JSON) or URL, applies defaults,
 * validates against schema, and returns a normalized config object.
 */

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import YAML from 'yaml';
import { validateConfig } from './validator.js';

/**
 * Parse a config from a file path or URL string.
 *
 * @param {string} source - Local file path or URL to config.
 * @returns {Promise<{ settings: object, records: object[] }>} Normalized config.
 * @throws {Error} If parsing or validation fails.
 */
export async function parseConfig(source) {
  const content = await loadSource(source);
  const ext = detectFormat(source);
  const raw = parseContent(content, ext);
  const config = normalizeConfig(raw);

  applyDefaults(config);

  const { valid, errors } = validateConfig(config);
  if (!valid) {
    const msg = errors.map((e) => `  - ${e}`).join('\n');
    throw new Error(`Config validation failed:\n${msg}`);
  }

  return config;
}

/**
 * Parse raw content string without loading from file/URL.
 * Useful for testing or when content is already available.
 *
 * @param {string} content - Raw YAML or JSON string.
 * @param {string} format - Either 'yaml' or 'json'.
 * @returns {{ settings: object, records: object[] }} Normalized config.
 * @throws {Error} If parsing or validation fails.
 */
export function parseConfigString(content, format = 'yaml') {
  const ext = format === 'json' ? '.json' : '.yaml';
  const raw = parseContent(content, ext);
  const config = normalizeConfig(raw);

  applyDefaults(config);

  const { valid, errors } = validateConfig(config);
  if (!valid) {
    const msg = errors.map((e) => `  - ${e}`).join('\n');
    throw new Error(`Config validation failed:\n${msg}`);
  }

  return config;
}

/**
 * Load content from a local file or URL.
 */
async function loadSource(source) {
  if (isUrl(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch config from URL: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  try {
    return await readFile(source, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read config file "${source}": ${err.message}`);
  }
}

/**
 * Detect config format from source path/URL extension.
 * Defaults to .yaml if extension is ambiguous.
 */
function detectFormat(source) {
  // Strip query params for URL
  const cleanPath = source.split('?')[0];
  const ext = extname(cleanPath).toLowerCase();

  if (ext === '.json') return '.json';
  if (ext === '.yaml' || ext === '.yml') return '.yaml';

  // Default to YAML for unknown extensions
  return '.yaml';
}

/**
 * Parse content string based on detected format.
 */
function parseContent(content, ext) {
  try {
    if (ext === '.json') {
      return JSON.parse(content);
    }
    return YAML.parse(content);
  } catch (err) {
    const format = ext === '.json' ? 'JSON' : 'YAML';
    throw new Error(`Failed to parse ${format}: ${err.message}`);
  }
}

/**
 * Normalize raw parsed config into the standard shape.
 *
 * Handles two formats:
 * - Multi-record: `{ records: [...], settings: {...} }`
 * - Single-record: `{ name: "...", schedule: {...}, ... }` → wrapped in records array
 */
function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Config must be a non-null object');
  }

  // Multi-record format (has records array)
  if (Array.isArray(raw.records)) {
    return {
      settings: raw.settings || {},
      records: raw.records,
    };
  }

  // Single-record format (has name + schedule → wrap into records)
  if (raw.name && raw.schedule) {
    return {
      settings: {},
      records: [raw],
    };
  }

  // Ambiguous — treat as multi-record with missing records
  return {
    settings: raw.settings || {},
    records: raw.records || [],
  };
}

/**
 * Apply default values to all records in the config.
 */
function applyDefaults(config) {
  if (!config.settings) {
    config.settings = {};
  }

  // Terminal defaults
  if (config.settings.terminal) {
    config.settings.terminal.new_window ??= true;
  }

  for (const record of config.records) {
    // enabled defaults to true
    record.enabled ??= true;

    // logging defaults
    if (record.logging) {
      record.logging.enabled ??= true;
      record.logging.max_size ??= '10MB';
      record.logging.retention ??= 7;
    }

    // Normalize interactive: object → single-element array
    if (record.interactive && !Array.isArray(record.interactive)) {
      record.interactive = [record.interactive];
    }

    // Move record-level rate_limit into interactive items (shorthand support)
    if (record.rate_limit && Array.isArray(record.interactive)) {
      for (const item of record.interactive) {
        item.rate_limit ??= record.rate_limit;
      }
      delete record.rate_limit;
    }

    // interactive rate_limit defaults
    if (record.interactive) {
      for (const item of record.interactive) {
        if (item.rate_limit) {
          item.rate_limit.max_wait_minutes ??= 180;
        }
      }
    }

    // notification defaults
    if (record.notifications) {
      record.notifications.on_success ??= false;
      record.notifications.on_failure ??= true;
    }
  }
}

/**
 * Check if a source string looks like a URL.
 */
function isUrl(source) {
  return source.startsWith('http://') || source.startsWith('https://');
}
