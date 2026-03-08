/**
 * Built-in rate limit presets for popular AI agents.
 *
 * Users can reference these by name in config instead of writing
 * custom detect_pattern/extract_wait_time rules.
 * Any field specified by the user overrides the preset default.
 */

export const PRESETS = {
  // Claude Code — no reset time shown, uses polling
  'claude-code': {
    detect_pattern: 'rate limit|usage limit|API Error.*[Rr]ate',
    extract_wait_time: null,
    polling_interval_minutes: 5,
    resume_command: null,
    max_wait_minutes: 180,
  },

  // aider — shows retry time in seconds
  'aider': {
    detect_pattern: 'Rate limit reached|Retry in',
    extract_wait_time: {
      pattern: 'Retry in ([\\d.]+)\\s*(seconds|ms|s)',
      format: 'seconds',
    },
    resume_command: null,
    max_wait_minutes: 60,
  },

  // Cursor CLI
  'cursor-cli': {
    detect_pattern: 'rate limit|resource_exhausted',
    extract_wait_time: null,
    polling_interval_minutes: 3,
    resume_command: null,
    max_wait_minutes: 30,
  },

  // GitHub Copilot CLI
  'github-copilot': {
    detect_pattern: 'rate-limited|Please wait a moment',
    extract_wait_time: null,
    polling_interval_minutes: 2,
    resume_command: null,
    max_wait_minutes: 30,
  },

  // Plandex — shows reset time clearly
  'plandex': {
    detect_pattern: 'try again in|rate limit',
    extract_wait_time: {
      pattern: 'try again in ([\\d.]+)s',
      format: 'seconds',
    },
    resume_command: 'plandex c',
    max_wait_minutes: 60,
  },

  // Continue CLI
  'continue-cli': {
    detect_pattern: 'usage limit exceeded|retrying after',
    extract_wait_time: {
      pattern: 'retrying after (\\d+)',
      format: 'seconds',
    },
    resume_command: null,
    max_wait_minutes: 60,
  },

  // OpenCode — may hang on 429, needs force restart
  'opencode': {
    detect_pattern: 'rate limited|429|subscription status',
    extract_wait_time: null,
    polling_interval_minutes: 5,
    resume_command: null,
    max_wait_minutes: 120,
    on_hang_timeout: 300, // Kill & restart if no output for 5 minutes
  },

  // Cody CLI
  'cody-cli': {
    detect_pattern: 'rate limit|quota exceeded',
    extract_wait_time: null,
    polling_interval_minutes: 5,
    resume_command: null,
    max_wait_minutes: 120,
  },

  // Gemini CLI
  'gemini-cli': {
    detect_pattern: 'rate limit|RESOURCE_EXHAUSTED|quota',
    extract_wait_time: null,
    polling_interval_minutes: 2,
    resume_command: null,
    max_wait_minutes: 60,
  },

  // Goose
  'goose': {
    detect_pattern: 'rate limit|too many requests|429',
    extract_wait_time: null,
    polling_interval_minutes: 5,
    resume_command: null,
    max_wait_minutes: 120,
  },
};

/**
 * Resolve a rate_limit config by merging preset defaults with user overrides.
 *
 * @param {object} rateLimitConfig - User's rate_limit config (may have `preset` key).
 * @returns {object} Merged rate limit config with all fields populated.
 */
export function resolveRateLimitConfig(rateLimitConfig) {
  if (!rateLimitConfig) return null;

  const { preset, ...userOverrides } = rateLimitConfig;

  if (!preset) return rateLimitConfig;

  const presetConfig = PRESETS[preset];
  if (!presetConfig) {
    throw new Error(`Unknown rate limit preset: "${preset}". Available: ${Object.keys(PRESETS).join(', ')}`);
  }

  // Merge: preset defaults + user overrides (user wins)
  return { ...presetConfig, ...userOverrides };
}
