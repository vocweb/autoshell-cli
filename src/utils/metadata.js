/**
 * Task metadata persistence for AutoShell.
 *
 * Saves and loads task metadata JSON files in ~/.autoshell/meta/.
 * Metadata enables list/status/export without needing the original config file.
 */

import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { paths, ensureDirs } from './paths.js';

/**
 * Save task metadata to ~/.autoshell/meta/<taskId>.json.
 *
 * @param {string} taskId - URL-safe task identifier.
 * @param {object} data - Metadata object to persist.
 */
export async function saveMeta(taskId, data) {
  ensureDirs();
  const filePath = join(paths.meta, `${taskId}.json`);
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Load task metadata by task ID.
 *
 * @param {string} taskId - URL-safe task identifier.
 * @returns {Promise<object|null>} Metadata object or null if not found.
 */
export async function loadMeta(taskId) {
  const filePath = join(paths.meta, `${taskId}.json`);
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Load all task metadata files.
 *
 * @returns {Promise<object[]>} Array of metadata objects.
 */
export async function loadAllMeta() {
  try {
    const files = await readdir(paths.meta);
    const results = [];

    for (const file of files) {
      if (!file.endsWith('.json') || file.endsWith('.rate-limit.json')) continue;
      try {
        const content = await readFile(join(paths.meta, file), 'utf-8');
        results.push(JSON.parse(content));
      } catch {
        // Skip corrupted files
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Delete task metadata file.
 *
 * @param {string} taskId - URL-safe task identifier.
 */
export async function deleteMeta(taskId) {
  const filePath = join(paths.meta, `${taskId}.json`);
  try {
    await unlink(filePath);
  } catch {
    // File may not exist
  }
}

/**
 * Find task metadata by human-readable name.
 *
 * @param {string} name - Task name to search for.
 * @returns {Promise<object|null>} Metadata or null.
 */
export async function findMetaByName(name) {
  const allMeta = await loadAllMeta();
  return allMeta.find((m) => m.name === name) || null;
}
