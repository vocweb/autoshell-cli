# AutoShell

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-green.svg)](https://nodejs.org)
[![CI](https://github.com/vocweb/autoshell-cli/actions/workflows/test.yml/badge.svg)](https://github.com/vocweb/autoshell-cli/actions)

> Cross-platform CLI for managing scheduled shell command sets with built-in support for interactive programs and AI agent automation.

**Key highlights:**

- Schedule shell commands on macOS (launchd), Linux (systemd), Windows (Task Scheduler)
- Run interactive CLI programs (Claude Code, Aider, OpenCode...) with auto-responder
- Built-in rate limit detection and auto-resume for 10 AI coding agents
- Notifications via Slack, Discord, Email, Webhook
- Command Hub integration for sharing and downloading community templates

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Commands Reference](#commands-reference)
- [Interactive Programs & Auto-Responder](#interactive-programs--auto-responder)
- [Rate Limit Handling](#rate-limit-handling)
- [Terminal Launcher](#terminal-launcher)
- [Notifications](#notifications)
- [Logging](#logging)
- [Command Hub](#command-hub)
- [Data Directory Structure](#data-directory-structure)
- [Platform Support](#platform-support)
- [Contributing](#contributing)
- [License](#license)

## Installation

### Prerequisites

- **Node.js >= 22.0.0** (supports Node 22 LTS and Node 24+)
- **npm** (comes with Node.js)
- Optional per platform:
  - macOS/Linux: `expect` for interactive commands (`brew install expect` / `apt install expect`)
  - Linux: `systemd --user` (available on most modern distros)

### Install via npm

```bash
npm install -g autoshell
```

### Install from source

```bash
git clone https://github.com/vocweb/autoshell-cli.git
cd autoshell-cli
npm install
npm link
```

### Verify installation

```bash
autoshell --version
autoshell --help
```

## Quick Start

1. Create a config file `daily-backup.yaml`:

```yaml
name: "Daily Backup"
schedule:
  type: daily
  time: "02:00"
commands:
  - "tar -czf ~/backups/project-$(date +%F).tar.gz ~/project"
  - "echo 'Backup complete'"
```

Alternatively, use the interactive wizard:

```bash
autoshell create
```

2. Install the task:

```bash
autoshell install daily-backup.yaml
```

3. Verify it's scheduled:

```bash
autoshell list
autoshell status "Daily Backup"
```

4. Run it manually to test:

```bash
autoshell run "Daily Backup"
```

## Configuration

AutoShell uses YAML (primary) or JSON config files. Each file defines one task.

### Config Schema

```yaml
# Task name (required, must be unique)
name: "My Task"

# Enable/disable without removing (default: true)
enabled: true

# Schedule (required) — one of: daily, weekly, once, cron
schedule:
  type: daily          # daily | weekly | once | cron
  time: "09:00"        # HH:MM (required for daily, weekly, once)
  weekdays: [mon, wed, fri]  # Required for weekly
  date: "2025-12-31"   # YYYY-MM-DD, required for once
  cron: "0 */6 * * *"  # Cron expression, required for cron type

# Shell commands to execute (required unless interactive is set)
commands:
  - "echo 'Hello World'"
  - "npm run build"

# Working directory (optional)
working_dir: "~/projects/myapp"

# Environment variables (optional)
env:
  NODE_ENV: production
  API_URL: "https://api.example.com"

# Interactive program config (optional, alternative to commands)
interactive:
  program: "claude"
  args: ["--project", "myapp"]
  inputs:
    - prompt: "Do you want to proceed?"
      response: "yes"
  auto_responses:
    - match: "Y/n"
      response: "Y"
      type: substring     # substring (default) | regex

# Rate limit handling (optional, for AI agents)
rate_limit:
  preset: claude-code    # Use a built-in preset
  max_wait_minutes: 120  # Override preset default
  action: wait           # wait | exit

# Notification channels (optional)
notifications:
  on_success: true
  on_failure: true
  channels:
    - type: slack
      webhook_url: "${SLACK_WEBHOOK_URL}"
    - type: discord
      webhook_url: "${DISCORD_WEBHOOK_URL}"

# Logging config (optional)
logging:
  enabled: true
  max_size: "10MB"
  retention: 7           # Days to keep logs

# Terminal config (optional)
terminal:
  program: default       # Terminal preset name or path
  new_window: true
  profile: null
  args: []
```

### Multi-Record Format (Legacy)

For backward compatibility, you can define multiple tasks in one file:

```yaml
settings:
  terminal:
    program: iterm2

records:
  - name: "Task One"
    schedule:
      type: daily
      time: "09:00"
    commands:
      - "echo one"
  - name: "Task Two"
    schedule:
      type: cron
      cron: "0 */2 * * *"
    commands:
      - "echo two"
```

Use `autoshell migrate <file>` to split into individual files.

### Global Settings

Global defaults are stored in `~/.autoshell/config.yaml`:

```yaml
settings:
  terminal:
    program: default
    new_window: true
  notifications:
    on_success: false
    on_failure: true
    channels: []
  logging:
    enabled: true
    max_size: "10MB"
    retention: 7
hub:
  auth_token: null
  hub_url: "https://hub.autoshell.dev"
```

Per-task settings override global settings.

## Commands Reference

| Command | Description | Key Flags |
|---------|-------------|-----------|
| `install [source]` | Install tasks from config file, URL, or commands/ | `--dry-run`, `--force` |
| `uninstall [name]` | Remove installed tasks | `--all` |
| `list` (alias `ls`) | List installed tasks | `--json` |
| `status [name]` | Show task status and last run info | |
| `run <name>` | Execute task immediately | |
| `logs [name]` | View task logs | `-n`, `-e`, `-f` |
| `create` | Interactive task creation wizard | `-o <file>`, `-e` / `--edit` |
| `export` | Export tasks to YAML | `-o <file>` |
| `validate [file]` | Validate config file(s) | |
| `add <file>` | Add command file to commands/ | |
| `remove <name>` | Remove command file and uninstall task | |
| `migrate <file>` | Split multi-record file into single files | |
| `hub search <query>` | Search Command Hub | `--category`, `--agent`, `--os` |
| `hub install <slug>` | Install template from Hub | `--configure` |
| `hub publish <file>` | Publish template to Hub | `-d`, `-c`, `-t` |
| `hub update [name]` | Update installed Hub templates | `--dry-run` |
| `hub login` | Authenticate with Hub via GitHub | |
| `hub logout` | Remove saved Hub authentication | |

### install

Install tasks from a config file, URL, or all files in `~/.autoshell/commands/`:

```bash
# Install from local file
autoshell install my-task.yaml

# Install from URL
autoshell install https://example.com/task-config.yaml

# Install all files in commands/
autoshell install

# Preview without installing
autoshell install my-task.yaml --dry-run

# Overwrite existing task
autoshell install my-task.yaml --force
```

### uninstall

Remove installed tasks:

```bash
autoshell uninstall "My Task"
autoshell uninstall --all
```

### list

List all installed tasks:

```bash
autoshell list
autoshell ls
autoshell list --json
```

### status

Show detailed status for a task:

```bash
autoshell status "My Task"
```

### run

Execute a task immediately, bypassing its schedule. The config is validated before execution — if the metadata is corrupted or the script file is missing, you'll get a clear error with remediation steps.

```bash
autoshell run "My Task"
```

If validation fails:
```
Error: Task "My Task" has invalid configuration:
  - scriptPath: Missing script path — task may need to be reinstalled

Try reinstalling: autoshell install <config-file> --force
```

### logs

View task logs:

```bash
# View all logs for a task
autoshell logs "My Task"

# Last 50 lines
autoshell logs "My Task" -n 50

# Errors only
autoshell logs "My Task" -e

# Follow mode (live tail)
autoshell logs "My Task" -f
```

### create

Interactive wizard that generates an annotated YAML config file. The wizard starts with a mode selector:

| Mode | Description | Questions |
|------|-------------|-----------|
| **Simple commands** | Run shell commands on a schedule | name, schedule, commands |
| **AI agent automation** | Run interactive CLI programs with rate limit handling | name, schedule, program, rate limit preset |
| **Full config** | Configure all options including working dir | name, schedule, commands, program, rate limit, working dir |

The generated file includes:
- **Uncommented sections** for fields you configured
- **Commented sections** with detailed explanations for optional fields you can enable later

```bash
# Interactive wizard (saves to ~/.autoshell/commands/)
autoshell create

# Save to specific file
autoshell create -o my-task.yaml

# Create and open in your editor immediately
autoshell create --edit
autoshell create -e -o my-task.yaml
```

The `--edit` flag opens the generated file using this fallback chain:
1. `$VISUAL` environment variable
2. `$EDITOR` environment variable
3. Platform default: `open` (macOS), `xdg-open` (Linux), `start` (Windows)

#### Example Output (Simple mode)

```yaml
# AutoShell Task Configuration
# Docs: https://github.com/vocweb/autoshell-cli#configuration

# Task name (required, must be unique across all installed tasks)
name: "Daily Backup"

# Enable or disable this task without removing the file (default: true)
enabled: true

# Schedule — when this task runs
schedule:
  type: daily
  time: "02:00"

# Shell commands to run sequentially
commands:
  - "tar -czf ~/backups/project-$(date +%F).tar.gz ~/project"
  - "echo 'Backup complete'"

# --- Interactive Program ---
# Uncomment to run a CLI program in a PTY instead of (or alongside) commands.
# interactive:
#   program: "claude"
#   ...

# --- Rate Limit Handling ---
# Uncomment to auto-detect rate limits from AI agents and wait for reset.
# rate_limit:
#   preset: claude-code
#   ...
```

> **Note:** The generated skeleton is intentionally incomplete. Fill in the commented sections you need, then run `autoshell validate` and `autoshell install`.

### validate

Validate config files:

```bash
# Validate specific file
autoshell validate my-task.yaml

# Validate all files in commands/
autoshell validate
```

## Interactive Programs & Auto-Responder

AutoShell can run interactive CLI programs using a PTY (pseudo-terminal), with automatic responses to prompts.

### How It Works

1. The program is spawned in a PTY via `node-pty` (with graceful fallback to `child_process.spawn`)
2. AutoShell monitors stdout for prompt patterns
3. When a match is found, the configured response is sent automatically
4. Unmatched prompts pass through to the user (or fall through in unattended mode)

### Example: Claude Code with Auto-Accept

```yaml
name: "Claude Code Review"
schedule:
  type: daily
  time: "09:00"
interactive:
  program: "claude"
  args: ["--project", "myapp", "-p", "Review recent changes"]
  auto_responses:
    - match: "Y/n"
      response: "Y"
      type: substring
    - match: "Do you want to proceed"
      response: "yes"
      type: substring
  inputs:
    - prompt: "Enter API key"
      response: "${CLAUDE_API_KEY}"
rate_limit:
  preset: claude-code
```

### Match Types

| Type | Description | Example |
|------|-------------|---------|
| `substring` | Case-insensitive substring match (default) | `"Y/n"` matches `"Proceed? (Y/n)"` |
| `regex` | Regular expression match | `"password.*:"` matches `"Enter password:"` |

## Rate Limit Handling

AutoShell detects rate limit messages from AI coding agents and automatically waits before resuming.

### Built-in Presets

| Preset | Agent | Max Wait | Detection |
|--------|-------|----------|-----------|
| `claude-code` | Claude Code | 180 min | Polling (5 min interval) |
| `aider` | Aider | 60 min | Parses retry seconds |
| `cursor-cli` | Cursor CLI | 30 min | Polling (3 min) |
| `github-copilot` | GitHub Copilot | 30 min | Polling (2 min) |
| `plandex` | Plandex | 60 min | Parses wait seconds |
| `continue-cli` | Continue CLI | 60 min | Parses retry seconds |
| `opencode` | OpenCode | 120 min | Polling + hang detection |
| `cody-cli` | Cody CLI | 120 min | Polling (5 min) |
| `gemini-cli` | Gemini CLI | 60 min | Polling (2 min) |
| `goose` | Goose | 120 min | Polling (5 min) |

### Usage

```yaml
rate_limit:
  preset: claude-code        # Use preset defaults
  max_wait_minutes: 120      # Override max wait
  action: wait               # wait (default) | exit
```

### Custom Rate Limit Config

```yaml
rate_limit:
  detect_pattern: "rate limit|429|too many requests"
  extract_wait_time:
    pattern: "retry after (\\d+) seconds"
    format: seconds          # seconds | minutes | hours_minutes | iso8601 | unix_timestamp
  polling_interval_minutes: 5
  max_wait_minutes: 60
  action: wait
```

### Supported Wait Time Formats

| Format | Example | Description |
|--------|---------|-------------|
| `hours_minutes` | `"1h 30m"`, `"2 hours"` | Human-readable duration |
| `minutes` | `"30 minutes"`, `"45m"` | Minutes only |
| `seconds` | `"90 seconds"`, `"90s"` | Seconds only |
| `iso8601` | `"PT1H30M"` | ISO 8601 duration |
| `unix_timestamp` | `"1735689600"` | Resume timestamp |

## Terminal Launcher

AutoShell can open tasks in a dedicated terminal window.

### Terminal Presets

| macOS | Linux | Windows |
|-------|-------|---------|
| `default` (Terminal.app) | `default` (auto-detect) | `default` (cmd) |
| `iterm2` | `gnome-terminal` | `windows-terminal` |
| `warp` | `konsole` | `cmder` |
| `alacritty` | `alacritty` | `alacritty` |
| `kitty` | `kitty` | `hyper` |
| `hyper` | `hyper` | |
| | `tilix` | |

### Configuration

```yaml
terminal:
  program: iterm2          # Preset name or absolute path
  new_window: true         # Open in new window (default: true)
  profile: "Dev"           # Terminal profile name (optional)
  args: ["--title", "AutoShell"]  # Extra arguments (optional)
```

### Custom Terminal

```yaml
terminal:
  program: /usr/local/bin/my-terminal
  args: ["-e"]
```

## Notifications

AutoShell sends notifications on task success or failure.

### Slack

```yaml
notifications:
  on_failure: true
  channels:
    - type: slack
      webhook_url: "${SLACK_WEBHOOK_URL}"
```

### Discord

```yaml
notifications:
  on_failure: true
  channels:
    - type: discord
      webhook_url: "${DISCORD_WEBHOOK_URL}"
```

### Email (SMTP)

```yaml
notifications:
  on_failure: true
  channels:
    - type: email
      smtp_host: "smtp.gmail.com"
      smtp_port: 587
      smtp_user: "${SMTP_USER}"
      smtp_pass: "${SMTP_PASS}"
      from: "autoshell@example.com"
      to: "admin@example.com"
```

### Webhook

```yaml
notifications:
  on_failure: true
  channels:
    - type: webhook
      url: "https://api.example.com/webhook"
      method: POST
      headers:
        Authorization: "Bearer ${WEBHOOK_TOKEN}"
```

## Logging

Task execution is logged automatically to `~/.autoshell/logs/`.

### Log Format

```
[2025-01-15T09:00:01.234Z] [stdout] Running backup...
[2025-01-15T09:00:05.678Z] [stderr] Warning: disk usage 85%
[2025-01-15T09:00:10.000Z] [stdout] Backup complete
```

### Log Rotation

Logs rotate based on size and retention settings:

```yaml
logging:
  enabled: true
  max_size: "10MB"     # Rotate when log exceeds this size
  retention: 7         # Keep logs for 7 days
```

### Viewing Logs

```bash
autoshell logs "My Task"        # View all logs
autoshell logs "My Task" -n 50  # Last 50 lines
autoshell logs "My Task" -e     # Errors only
autoshell logs "My Task" -f     # Follow (live tail)
```

## Command Hub

The AutoShell Command Hub is a community registry for sharing task templates.

### Search Templates

```bash
autoshell hub search "claude"
autoshell hub search "backup" --category devops
autoshell hub search "ai" --agent claude --os macos
```

### Install a Template

```bash
# Install with defaults
autoshell hub install ai/claude-daily-review

# Install with interactive variable configuration
autoshell hub install ai/claude-daily-review --configure
```

Templates may contain `{{variable}}` placeholders that are resolved during installation.

### Publish a Template

```bash
autoshell hub login
autoshell hub publish my-task.yaml --tags "ai,claude,review"
```

### Update Installed Templates

```bash
autoshell hub update                # Update all
autoshell hub update claude-review  # Update specific
autoshell hub update --dry-run      # Preview only
```

### Authentication

Hub uses GitHub OAuth device flow:

```bash
autoshell hub login   # Opens browser for GitHub auth
autoshell hub logout  # Removes saved token
```

## Data Directory Structure

```
~/.autoshell/
├── config.yaml      # Global settings
├── commands/        # Command config files
│   ├── daily-backup.yaml
│   └── claude-review.yaml
├── scripts/         # Generated shell scripts
│   ├── daily-backup.sh
│   └── claude-review.sh
├── logs/            # Task execution logs
│   ├── daily-backup.log
│   └── claude-review.log
└── meta/            # Task metadata (install state)
    ├── daily-backup.json
    └── claude-review.json
```

## Platform Support

| Platform | Scheduler | Script | Status |
|----------|-----------|--------|--------|
| macOS | launchd (plist + launchctl) | Bash (.sh) | Full support |
| Linux | systemd (service + timer units) | Bash (.sh) | Full support |
| Windows | Task Scheduler (schtasks) | Batch (.bat) | Full support |

### Known Limitations

- **Cron on Windows**: Cron-type schedules are converted to the nearest schtasks equivalent
- **Interactive on Windows**: PTY support requires `node-pty`; falls back to `child_process.spawn`
- **launchd once**: macOS launchd does not natively support one-time schedules; implemented via StartCalendarInterval
- **Unicode task names**: Non-ASCII characters are stripped from task IDs (file names use kebab-case)
- **Concurrent installs**: Installing the same task concurrently may cause race conditions

## Contributing

### Development Setup

```bash
git clone https://github.com/vocweb/autoshell-cli.git
cd autoshell-cli
npm install
npm link
npm test
```

### Project Structure

```
src/
├── index.js              # CLI entry point
├── config/               # Config parsing, validation, global settings
├── generators/           # Script generation (Bash, Bat)
├── schedulers/           # OS schedulers (launchd, systemd, schtasks)
├── cli-commands/         # Commander command handlers
├── interactive/          # PTY runner, auto-responder, rate limit
├── terminal/             # Terminal launcher
├── logging/              # Task logger, log rotation
├── notifications/        # Slack, Discord, Email, Webhook
├── hub/                  # Command Hub client
└── utils/                # Paths, platform, task-id, metadata
__tests__/                # Test suites (Node.js built-in test runner)
```

### Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: resolve bug in parser
docs: update README
refactor: simplify script generator
test: add scheduler tests
chore: update dependencies
```

### Running Tests

```bash
npm test                  # Run all tests
npm run test:verbose      # Verbose output with spec reporter
```

### Pull Request Process

1. Fork the repo
2. Create a feature branch from `develop`
3. Implement changes with tests
4. Ensure `npm test` passes (all tests must pass)
5. Submit PR to the `develop` branch

### Code Style

- ESM modules (`import`/`export`)
- Node.js >= 22 features allowed
- Keep files under 200 lines
- Use kebab-case for file names
- English comments for all public functions

### Branch Strategy

- `master` — stable releases
- `develop` — integration branch
- `feature/*` — feature branches (PR to develop)

## License

[Apache-2.0](LICENSE)

## Links

- **GitHub:** [github.com/vocweb/autoshell-cli](https://github.com/vocweb/autoshell-cli)
- **Command Hub:** [hub.autoshell.dev](https://hub.autoshell.dev)
- **Issues:** [github.com/vocweb/autoshell-cli/issues](https://github.com/vocweb/autoshell-cli/issues)
