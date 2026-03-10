/**
 * Task ID generator for AutoShell.
 *
 * Converts human-readable task names into URL-safe identifiers.
 * Non-ASCII characters are stripped (known limitation — see brainstorm Section 11.4).
 */

/**
 * Generate a URL-safe task ID from a task name.
 *
 * Rules:
 * - Lowercase
 * - Replace non-alphanumeric chars with hyphens
 * - Collapse consecutive hyphens
 * - Strip leading/trailing hyphens
 * - Fallback to 'unnamed' for empty results
 *
 * @param {string} name - Human-readable task name.
 * @returns {string} URL-safe identifier.
 *
 * @example
 * taskId("Brainstorm Frontend") // → "brainstorm-frontend"
 * taskId("Test! @#$ Name")      // → "test-name"
 * taskId("  --edge-- ")         // → "edge"
 */
export function taskId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unnamed';
}
