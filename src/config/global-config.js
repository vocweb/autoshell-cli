/**
 * Global config management for AutoShell.
 *
 * Loads, saves, and merges global settings from ~/.autoshell/config.yaml.
 * Provides defaults for terminal, notifications, logging, and Hub auth.
 * Per-task settings always override global settings.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import YAML from 'yaml';
import { paths, ensureDirs } from '../utils/paths.js';

/**
 * Default global configuration values.
 * Applied when config file is missing or fields are absent.
 */
const DEFAULTS = {
  settings: {
    terminal: {
      program: 'default',
      new_window: true,
      profile: null,
      args: [],
    },
    notifications: {
      on_success: false,
      on_failure: true,
      channels: [],
    },
    logging: {
      enabled: true,
      max_size: '10MB',
      retention: 7,
    },
  },
  hub: {
    auth_token: null,
    hub_url: 'https://hub.autoshell.dev',
  },
};

/**
 * Deep merge two objects. Source values override target values.
 * Arrays are replaced (not concatenated). Null/undefined in source
 * are preserved as explicit values.
 * @param {object} target - Base object with defaults.
 * @param {object} source - Override object with user values.
 * @returns {object} Merged result (new object, inputs not mutated).
 */
export function deepMerge(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return source;
  }
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    return { ...source };
  }

  const result = { ...target };
  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = source[key];

    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

/**
 * Load global config from ~/.autoshell/config.yaml.
 * Returns defaults merged with any saved values.
 * @returns {object} Global configuration object.
 */
export function loadGlobalConfig() {
  if (!existsSync(paths.config)) {
    return deepMerge({}, DEFAULTS);
  }

  try {
    const raw = readFileSync(paths.config, 'utf-8');
    const parsed = YAML.parse(raw);
    return deepMerge(DEFAULTS, parsed || {});
  } catch {
    return deepMerge({}, DEFAULTS);
  }
}

/**
 * Save global config to ~/.autoshell/config.yaml.
 * Creates directories if they don't exist.
 * @param {object} config - Configuration object to save.
 */
export function saveGlobalConfig(config) {
  ensureDirs();
  writeFileSync(paths.config, YAML.stringify(config), 'utf-8');
}

/**
 * Initialize default config file if it doesn't exist.
 * Called on first run to create ~/.autoshell/config.yaml with defaults.
 */
export function initConfigIfMissing() {
  if (!existsSync(paths.config)) {
    saveGlobalConfig(DEFAULTS);
  }
}

/**
 * Get a specific settings section from global config.
 * @param {string} section - Section name (e.g. "terminal", "notifications", "logging").
 * @returns {object} Settings section or empty object.
 */
export function getSettingsSection(section) {
  const config = loadGlobalConfig();
  return config.settings?.[section] || {};
}

/**
 * Merge per-task config with global settings.
 * Task values override global values.
 * @param {string} section - Settings section name.
 * @param {object} taskConfig - Per-task configuration override.
 * @returns {object} Merged configuration.
 */
export function mergeTaskConfig(section, taskConfig) {
  const globalSection = getSettingsSection(section);
  if (!taskConfig || Object.keys(taskConfig).length === 0) {
    return globalSection;
  }
  return deepMerge(globalSection, taskConfig);
}

/**
 * Get Hub auth token from global config.
 * @returns {string|null} Auth token or null.
 */
export function getHubToken() {
  const config = loadGlobalConfig();
  return config.hub?.auth_token || null;
}

/**
 * Save Hub auth token to global config.
 * @param {string} token - Auth token to save.
 */
export function setHubToken(token) {
  const config = loadGlobalConfig();
  config.hub = config.hub || {};
  config.hub.auth_token = token;
  saveGlobalConfig(config);
}

/**
 * Remove Hub auth token from global config.
 */
export function clearHubToken() {
  const config = loadGlobalConfig();
  if (config.hub) {
    config.hub.auth_token = null;
  }
  saveGlobalConfig(config);
}

/**
 * Get Hub API URL from global config.
 * Environment variable AUTOSHELL_HUB_URL takes precedence.
 * @returns {string} Hub API URL.
 */
export function getHubUrl() {
  if (process.env.AUTOSHELL_HUB_URL) {
    return process.env.AUTOSHELL_HUB_URL;
  }
  const config = loadGlobalConfig();
  return config.hub?.hub_url || 'https://hub.autoshell.dev';
}
