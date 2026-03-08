/**
 * HTTP client for AutoShell Command Hub API.
 *
 * Handles authentication, search, download, publish, and update
 * operations against the Hub backend. Base URL is configurable
 * via AUTOSHELL_HUB_URL environment variable.
 */

import { readFile, writeFile } from 'node:fs/promises';
import YAML from 'yaml';
import { paths, ensureDirs } from '../utils/paths.js';

/** Default Hub API base URL (overridable via env) */
const DEFAULT_HUB_URL = 'https://hub.autoshell.dev/api';

/**
 * Get the configured Hub API base URL.
 * @returns {string} Hub API base URL without trailing slash.
 */
export function getHubUrl() {
  const url = process.env.AUTOSHELL_HUB_URL || DEFAULT_HUB_URL;
  return url.replace(/\/+$/, '');
}

/**
 * HTTP client for the AutoShell Command Hub.
 */
export class HubClient {
  /**
   * @param {string} [authToken] - Optional Bearer token for authenticated requests.
   */
  constructor(authToken = null) {
    this.baseUrl = getHubUrl();
    this.authToken = authToken;
  }

  /**
   * Build HTTP headers for requests.
   * @returns {Record<string, string>} Request headers.
   */
  _headers() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  /**
   * Perform an HTTP request and parse JSON response.
   * @param {string} path - API path (e.g. /templates).
   * @param {RequestInit} [options] - Fetch options.
   * @returns {Promise<any>} Parsed JSON response.
   * @throws {Error} If request fails or returns non-OK status.
   */
  async _request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: { ...this._headers(), ...options.headers },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Hub API error ${response.status}: ${body || response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  /**
   * Search templates on the Hub.
   * @param {string} query - Search query string.
   * @param {object} [filters] - Optional filters.
   * @param {string} [filters.category] - Filter by category.
   * @param {string} [filters.agent] - Filter by AI agent name.
   * @param {string} [filters.os] - Filter by OS.
   * @returns {Promise<Array>} Array of template result objects.
   */
  async search(query, filters = {}) {
    const params = new URLSearchParams({ q: query });
    if (filters.category) params.set('category', filters.category);
    if (filters.agent) params.set('agent', filters.agent);
    if (filters.os) params.set('os', filters.os);
    return this._request(`/templates?${params}`);
  }

  /**
   * Get template metadata by slug.
   * @param {string} slug - Template slug (e.g. "ai/claude-review").
   * @returns {Promise<object>} Template metadata.
   */
  async getTemplate(slug) {
    return this._request(`/templates/${encodeURIComponent(slug)}`);
  }

  /**
   * Download template YAML content by slug.
   * @param {string} slug - Template slug.
   * @returns {Promise<string>} Raw YAML content.
   */
  async downloadTemplate(slug) {
    return this._request(`/templates/${encodeURIComponent(slug)}/download`);
  }

  /**
   * Publish a template to the Hub (requires authentication).
   * @param {string} yamlContent - YAML template content.
   * @param {object} metadata - Template metadata (title, description, tags, etc.).
   * @returns {Promise<object>} Publish result from API.
   */
  async publishTemplate(yamlContent, metadata) {
    return this._request('/templates', {
      method: 'POST',
      body: JSON.stringify({ content: yamlContent, ...metadata }),
    });
  }

  /**
   * Check for updates for installed templates.
   * @param {Array<{slug: string, version: string}>} installed - Installed templates with versions.
   * @returns {Promise<Array>} Array of available updates.
   */
  async checkUpdates(installed) {
    return this._request('/templates/check-updates', {
      method: 'POST',
      body: JSON.stringify({ templates: installed }),
    });
  }

  /**
   * Request a device code for GitHub OAuth login.
   * @returns {Promise<object>} Device code response with user_code and verification_uri.
   */
  async requestDeviceCode() {
    return this._request('/auth/device-code', { method: 'POST' });
  }

  /**
   * Poll for access token after user authorizes the device.
   * @param {string} deviceCode - Device code from requestDeviceCode().
   * @returns {Promise<object>} Token response with access_token.
   */
  async pollForToken(deviceCode) {
    return this._request('/auth/token', {
      method: 'POST',
      body: JSON.stringify({ device_code: deviceCode }),
    });
  }
}

/**
 * Load saved auth token from config file.
 * @returns {Promise<string|null>} Auth token or null if not found.
 */
export async function loadAuthToken() {
  try {
    const content = await readFile(paths.config, 'utf-8');
    const config = YAML.parse(content);
    return config?.hub_auth?.token || null;
  } catch {
    return null;
  }
}

/**
 * Save auth token to config file.
 * @param {string} token - Auth token to save.
 */
export async function saveAuthToken(token) {
  ensureDirs();
  let config = {};
  try {
    const content = await readFile(paths.config, 'utf-8');
    config = YAML.parse(content) || {};
  } catch { /* config file may not exist */ }

  config.hub_auth = { token };
  await writeFile(paths.config, YAML.stringify(config), 'utf-8');
}

/**
 * Remove auth token from config file.
 */
export async function removeAuthToken() {
  try {
    const content = await readFile(paths.config, 'utf-8');
    const config = YAML.parse(content) || {};
    delete config.hub_auth;
    await writeFile(paths.config, YAML.stringify(config), 'utf-8');
  } catch { /* config file may not exist */ }
}

/**
 * Create a HubClient with saved auth token.
 * @returns {Promise<HubClient>} Authenticated HubClient instance.
 */
export async function createAuthenticatedClient() {
  const token = await loadAuthToken();
  return new HubClient(token);
}
