/**
 * AutoShell create wizard — annotated YAML skeleton builder.
 *
 * Builds a YAML string using raw template literals (NOT YAML.stringify)
 * so that comment blocks are preserved in the output.
 *
 * Convention:
 *   - Fields the user configured  → uncommented YAML
 *   - Optional fields not chosen  → commented block with "# ---" header + explanation
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a complete annotated YAML skeleton from wizard answers.
 *
 * Each section is either uncommented (user provided data) or
 * a commented example with explanation text.
 *
 * @param {object} answers - Wizard answers from runWizardPrompts().
 * @param {string} answers.mode - 'simple' | 'ai-agent' | 'full'
 * @param {string} answers.name - Human-readable task name.
 * @param {object} answers.schedule - Schedule object.
 * @param {string[]} [answers.commands] - Shell commands (simple + full).
 * @param {string} [answers.interactiveProgram] - Program name (ai-agent + full).
 * @param {string|null} [answers.rateLimitPreset] - Rate limit preset (ai-agent + full).
 * @param {string|null} [answers.workingDir] - Working directory (full only).
 * @returns {string} Complete YAML string with inline comments.
 */
export function buildSkeleton(answers) {
  const sections = [
    buildHeader(answers),
    buildScheduleSection(answers.schedule),
    buildCommandsSection(answers),
    buildInteractiveSection(answers),
    buildRateLimitSection(answers),
    buildWorkingDirSection(answers),
    buildEnvSection(),
    buildNotificationsSection(),
    buildLoggingSection(),
    buildTerminalSection(),
  ];

  return sections.filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Section builders — each returns a string ending with a blank line
// ---------------------------------------------------------------------------

/**
 * File header + name + enabled flag (always uncommented).
 *
 * @param {object} answers
 * @returns {string}
 */
function buildHeader(answers) {
  return `# AutoShell Task Configuration
# Docs: https://github.com/vocweb/autoshell-cli#configuration

# Task name (required, must be unique across all installed tasks)
name: "${escapeYamlString(answers.name)}"

# Enable or disable this task without removing the file (default: true)
enabled: true
`;
}

/**
 * Schedule section — always uncommented because the user always provides it.
 *
 * @param {object} schedule
 * @returns {string}
 */
function buildScheduleSection(schedule) {
  const lines = ['# Schedule — when this task runs', 'schedule:'];
  lines.push(`  type: ${schedule.type}`);

  if (schedule.time) lines.push(`  time: "${schedule.time}"`);
  if (schedule.date) lines.push(`  date: "${schedule.date}"`);
  if (schedule.weekdays) lines.push(`  weekdays: [${schedule.weekdays.join(', ')}]`);
  if (schedule.cron) lines.push(`  cron: "${schedule.cron}"`);

  lines.push('');
  return lines.join('\n');
}

/**
 * Commands section.
 * Uncommented when the user provided commands; otherwise a commented example.
 *
 * @param {object} answers
 * @returns {string}
 */
function buildCommandsSection(answers) {
  if (answers.commands && answers.commands.length > 0) {
    const lines = ['# Shell commands to run sequentially'];
    lines.push('commands:');
    for (const cmd of answers.commands) {
      lines.push(`  - "${escapeYamlString(cmd)}"`);
    }
    lines.push('');
    return lines.join('\n');
  }

  return `# --- Shell Commands ---
# Uncomment to run shell commands sequentially in a single script.
# Each command runs in the same shell session.
# commands:
#   - "echo 'Hello from AutoShell!'"
#   - "npm run build"
#   - "tar -czf backup.tar.gz ./data"
`;
}

/**
 * Interactive program section.
 * Uncommented when the user provided a program; otherwise a commented example.
 *
 * @param {object} answers
 * @returns {string}
 */
function buildInteractiveSection(answers) {
  if (answers.interactiveProgram) {
    return `# Interactive program — runs in a PTY with auto-responder
interactive:
  program: "${escapeYamlString(answers.interactiveProgram)}"
  # args: ["--project", "myapp", "-p", "Review code"]
  #
  # Auto-respond to prompts (matched against program output)
  # auto_responses:
  #   - match: "Y/n"           # Text to match in output
  #     response: "Y"          # Text to send back
  #     type: substring        # substring (default) | regex
  #   - match: "Do you want to proceed"
  #     response: "yes"
  #
  # Predefined inputs sent in order when program starts
  # inputs:
  #   - prompt: "Enter API key"
  #     response: "\${API_KEY}"
`;
  }

  return `# --- Interactive Program ---
# Uncomment to run a CLI program in a PTY instead of (or alongside) commands.
# AutoShell can auto-respond to prompts and handle rate limits.
# interactive:
#   program: "claude"
#   args: ["--project", "myapp"]
#   auto_responses:
#     - match: "Y/n"
#       response: "Y"
#       type: substring        # substring (default) | regex
#   inputs:
#     - prompt: "Enter API key"
#       response: "\${API_KEY}"
`;
}

/**
 * Rate limit section.
 * Uncommented when the user chose a preset; otherwise a commented example.
 *
 * @param {object} answers
 * @returns {string}
 */
function buildRateLimitSection(answers) {
  if (answers.rateLimitPreset) {
    return `# Rate limit handling — auto-detect and wait for reset
rate_limit:
  preset: ${answers.rateLimitPreset}
  # max_wait_minutes: 120     # Override preset default max wait
  # action: wait              # wait (default) | exit
`;
  }

  return `# --- Rate Limit Handling ---
# Uncomment to auto-detect rate limits from AI agents and wait for reset.
# Available presets: claude-code, aider, cursor-cli, github-copilot,
#   plandex, continue-cli, opencode, cody-cli, gemini-cli, goose
# rate_limit:
#   preset: claude-code        # Use a built-in preset
#   max_wait_minutes: 120      # Max time to wait before giving up
#   action: wait               # wait | exit
#
# Or define custom detection:
# rate_limit:
#   detect_pattern: "rate limit|429"
#   extract_wait_time:
#     pattern: "retry after (\\d+) seconds"
#     format: seconds          # seconds | minutes | hours_minutes | iso8601
#   polling_interval_minutes: 5
#   max_wait_minutes: 60
`;
}

/**
 * Working directory section.
 * Uncommented when the user provided a path; otherwise a commented example.
 *
 * @param {object} answers
 * @returns {string}
 */
function buildWorkingDirSection(answers) {
  if (answers.workingDir) {
    return `# Working directory — commands execute here
working_dir: "${escapeYamlString(answers.workingDir)}"
`;
  }

  return `# --- Working Directory ---
# Uncomment to set where commands execute. Defaults to current directory.
# working_dir: "~/projects/myapp"
`;
}

/**
 * Environment variables section — always commented, not prompted in any mode.
 *
 * @returns {string}
 */
function buildEnvSection() {
  return `# --- Environment Variables ---
# Uncomment to set env vars available to commands and interactive programs.
# Use \${VAR} syntax to reference system env vars.
# env:
#   NODE_ENV: production
#   API_URL: "https://api.example.com"
`;
}

/**
 * Notifications section — always commented, not prompted in any mode.
 *
 * @returns {string}
 */
function buildNotificationsSection() {
  return `# --- Notifications ---
# Uncomment to send notifications on task success or failure.
# Supports: slack, discord, email, webhook
# notifications:
#   on_success: true
#   on_failure: true
#   channels:
#     - type: slack
#       webhook_url: "\${SLACK_WEBHOOK_URL}"
#     - type: discord
#       webhook_url: "\${DISCORD_WEBHOOK_URL}"
#     - type: email
#       smtp_host: "smtp.gmail.com"
#       smtp_port: 587
#       smtp_user: "\${SMTP_USER}"
#       smtp_pass: "\${SMTP_PASS}"
#       from: "autoshell@example.com"
#       to: "admin@example.com"
`;
}

/**
 * Logging section — always commented, not prompted in any mode.
 *
 * @returns {string}
 */
function buildLoggingSection() {
  return `# --- Logging ---
# Uncomment to customize log behavior. Logging is enabled by default.
# logging:
#   enabled: true
#   max_size: "10MB"           # Rotate when log file exceeds this size
#   retention: 7               # Days to keep old log files
`;
}

/**
 * Terminal launcher section — always commented, not prompted in any mode.
 *
 * @returns {string}
 */
function buildTerminalSection() {
  return `# --- Terminal ---
# Uncomment to open this task in a specific terminal application.
# terminal:
#   program: default           # Preset name or absolute path to terminal
#   new_window: true           # Open in a new window
#   profile: null              # Terminal profile name (optional)
#   args: []                   # Extra arguments
`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape double quotes inside a YAML string value.
 * All string values in the skeleton are double-quoted.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeYamlString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
