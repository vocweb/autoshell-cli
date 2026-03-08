/**
 * Config validator for AutoShell.
 *
 * Validates parsed config objects against the schema defined in brainstorm.
 * Returns an array of human-readable error messages with record indices.
 */

const VALID_SCHEDULE_TYPES = ['once', 'daily', 'weekly', 'cron'];
const VALID_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const VALID_RATE_LIMIT_ACTIONS = ['pause_and_resume', 'exit', 'notify_only'];
const VALID_WAIT_TIME_FORMATS = ['hours_minutes', 'minutes', 'seconds', 'iso8601', 'unix_timestamp'];
const VALID_NOTIFICATION_TYPES = ['slack', 'discord', 'email', 'webhook'];
const TIME_REGEX = /^\d{2}:\d{2}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SIZE_REGEX = /^\d+(KB|MB|GB)$/i;

/**
 * Validate a full config object (with records array).
 * @param {object} config - Parsed config with `records` array and optional `settings`.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateConfig(config) {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be a non-null object'] };
  }

  // Validate settings (optional)
  if (config.settings) {
    validateSettings(config.settings, errors);
  }

  // Validate records
  if (!Array.isArray(config.records)) {
    errors.push('records: Must be an array');
    return { valid: false, errors };
  }

  if (config.records.length === 0) {
    errors.push('records: Must contain at least one record');
    return { valid: false, errors };
  }

  // Check name uniqueness
  const names = new Set();
  for (let i = 0; i < config.records.length; i++) {
    const record = config.records[i];
    const prefix = `records[${i}]`;

    validateRecord(record, prefix, errors);

    if (record.name) {
      if (names.has(record.name)) {
        errors.push(`${prefix}.name: Duplicate name "${record.name}"`);
      }
      names.add(record.name);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate the optional top-level settings block.
 */
function validateSettings(settings, errors) {
  if (typeof settings !== 'object') {
    errors.push('settings: Must be an object');
    return;
  }

  if (settings.terminal) {
    const t = settings.terminal;
    if (typeof t !== 'object') {
      errors.push('settings.terminal: Must be an object');
      return;
    }
    if (t.program !== undefined && typeof t.program !== 'string') {
      errors.push('settings.terminal.program: Must be a string');
    }
    if (t.new_window !== undefined && typeof t.new_window !== 'boolean') {
      errors.push('settings.terminal.new_window: Must be a boolean');
    }
  }
}

/**
 * Validate a single record within the records array.
 */
function validateRecord(record, prefix, errors) {
  if (!record || typeof record !== 'object') {
    errors.push(`${prefix}: Must be an object`);
    return;
  }

  // name — required, string
  if (!record.name || typeof record.name !== 'string') {
    errors.push(`${prefix}.name: Required and must be a string`);
  }

  // schedule — required
  if (!record.schedule || typeof record.schedule !== 'object') {
    errors.push(`${prefix}.schedule: Required and must be an object`);
  } else {
    validateSchedule(record.schedule, prefix, errors);
  }

  // commands — required, non-empty array
  if (!Array.isArray(record.commands) || record.commands.length === 0) {
    // commands can be absent if interactive is present
    if (!record.interactive) {
      errors.push(`${prefix}.commands: Required non-empty array (or provide interactive block)`);
    }
  }

  // env — optional, must be object
  if (record.env !== undefined && (typeof record.env !== 'object' || Array.isArray(record.env))) {
    errors.push(`${prefix}.env: Must be a key-value object`);
  }

  // logging — optional
  if (record.logging) {
    validateLogging(record.logging, prefix, errors);
  }

  // interactive — optional array
  if (record.interactive) {
    validateInteractive(record.interactive, prefix, errors);
  }

  // notifications — optional
  if (record.notifications) {
    validateNotifications(record.notifications, prefix, errors);
  }
}

/**
 * Validate the schedule block of a record.
 */
function validateSchedule(schedule, prefix, errors) {
  const p = `${prefix}.schedule`;

  if (!VALID_SCHEDULE_TYPES.includes(schedule.type)) {
    errors.push(`${p}.type: Must be one of: ${VALID_SCHEDULE_TYPES.join(', ')}`);
    return;
  }

  // time — required for non-cron types
  if (schedule.type !== 'cron') {
    if (!schedule.time || !TIME_REGEX.test(schedule.time)) {
      errors.push(`${p}.time: Required, format HH:MM`);
    }
  }

  // type-specific validations
  switch (schedule.type) {
    case 'once':
      if (!schedule.date || !DATE_REGEX.test(schedule.date)) {
        errors.push(`${p}.date: Required for type "once", format YYYY-MM-DD`);
      }
      break;

    case 'weekly':
      if (!Array.isArray(schedule.weekdays) || schedule.weekdays.length === 0) {
        errors.push(`${p}.weekdays: Required non-empty array for type "weekly"`);
      } else {
        for (const day of schedule.weekdays) {
          if (!VALID_WEEKDAYS.includes(day)) {
            errors.push(`${p}.weekdays: Invalid weekday "${day}", must be one of: ${VALID_WEEKDAYS.join(', ')}`);
          }
        }
      }
      break;

    case 'cron':
      if (!schedule.cron || typeof schedule.cron !== 'string') {
        errors.push(`${p}.cron: Required string for type "cron"`);
      }
      break;
  }
}

/**
 * Validate the logging block.
 */
function validateLogging(logging, prefix, errors) {
  const p = `${prefix}.logging`;

  if (typeof logging !== 'object') {
    errors.push(`${p}: Must be an object`);
    return;
  }

  if (logging.max_size !== undefined && !SIZE_REGEX.test(String(logging.max_size))) {
    errors.push(`${p}.max_size: Invalid format, expected "10MB", "500KB", or "1GB"`);
  }

  if (logging.retention !== undefined) {
    if (!Number.isInteger(logging.retention) || logging.retention <= 0) {
      errors.push(`${p}.retention: Must be a positive integer (days)`);
    }
  }
}

/**
 * Validate the interactive block (array of interactive program configs).
 */
function validateInteractive(interactive, prefix, errors) {
  const p = `${prefix}.interactive`;

  if (!Array.isArray(interactive)) {
    errors.push(`${p}: Must be an array`);
    return;
  }

  for (let i = 0; i < interactive.length; i++) {
    const item = interactive[i];
    const ip = `${p}[${i}]`;

    if (!item.program || typeof item.program !== 'string') {
      errors.push(`${ip}.program: Required string`);
    }

    if (!Array.isArray(item.inputs) || item.inputs.length === 0) {
      errors.push(`${ip}.inputs: Required non-empty array`);
    }

    // auto_responses — optional
    if (item.auto_responses) {
      if (!Array.isArray(item.auto_responses)) {
        errors.push(`${ip}.auto_responses: Must be an array`);
      } else {
        for (let j = 0; j < item.auto_responses.length; j++) {
          const ar = item.auto_responses[j];
          const arp = `${ip}.auto_responses[${j}]`;
          if (!ar.prompt || typeof ar.prompt !== 'string') {
            errors.push(`${arp}.prompt: Required string`);
          }
          if (!ar.response || typeof ar.response !== 'string') {
            errors.push(`${arp}.response: Required string`);
          }
        }
      }
    }

    // rate_limit — optional
    if (item.rate_limit) {
      validateRateLimit(item.rate_limit, ip, errors);
    }
  }
}

/**
 * Validate the rate_limit block within an interactive item.
 */
function validateRateLimit(rateLimit, prefix, errors) {
  const p = `${prefix}.rate_limit`;

  // If using preset, detect_pattern is not required
  if (!rateLimit.preset) {
    if (!rateLimit.detect_pattern || typeof rateLimit.detect_pattern !== 'string') {
      errors.push(`${p}.detect_pattern: Required string (regex) unless using preset`);
    }
  }

  if (rateLimit.action && !VALID_RATE_LIMIT_ACTIONS.includes(rateLimit.action)) {
    errors.push(`${p}.action: Must be one of: ${VALID_RATE_LIMIT_ACTIONS.join(', ')}`);
  }

  if (rateLimit.extract_wait_time) {
    const ewt = rateLimit.extract_wait_time;
    if (!ewt.pattern || typeof ewt.pattern !== 'string') {
      errors.push(`${p}.extract_wait_time.pattern: Required string (regex)`);
    }
    if (!VALID_WAIT_TIME_FORMATS.includes(ewt.format)) {
      errors.push(`${p}.extract_wait_time.format: Must be one of: ${VALID_WAIT_TIME_FORMATS.join(', ')}`);
    }
  }

  if (rateLimit.max_wait_minutes !== undefined) {
    if (!Number.isInteger(rateLimit.max_wait_minutes) || rateLimit.max_wait_minutes <= 0) {
      errors.push(`${p}.max_wait_minutes: Must be a positive integer`);
    }
  }
}

/**
 * Validate the notifications block.
 */
function validateNotifications(notifications, prefix, errors) {
  const p = `${prefix}.notifications`;

  if (typeof notifications !== 'object') {
    errors.push(`${p}: Must be an object`);
    return;
  }

  if (!notifications.channels) {
    // Channels not required if only on_success/on_failure flags set
    return;
  }

  if (!Array.isArray(notifications.channels) || notifications.channels.length === 0) {
    errors.push(`${p}.channels: Must be a non-empty array`);
    return;
  }

  for (let i = 0; i < notifications.channels.length; i++) {
    const ch = notifications.channels[i];
    const cp = `${p}.channels[${i}]`;

    if (!VALID_NOTIFICATION_TYPES.includes(ch.type)) {
      errors.push(`${cp}.type: Must be one of: ${VALID_NOTIFICATION_TYPES.join(', ')}`);
      continue;
    }

    // Type-specific required fields
    switch (ch.type) {
      case 'slack':
      case 'discord':
        if (!ch.webhook_url || typeof ch.webhook_url !== 'string') {
          errors.push(`${cp}.webhook_url: Required for type "${ch.type}"`);
        }
        break;
      case 'email':
        if (!ch.to || typeof ch.to !== 'string') {
          errors.push(`${cp}.to: Required for type "email"`);
        }
        break;
      case 'webhook':
        if (!ch.url || typeof ch.url !== 'string') {
          errors.push(`${cp}.url: Required for type "webhook"`);
        }
        break;
    }
  }
}
