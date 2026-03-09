/**
 * Notification dispatcher for AutoShell.
 *
 * Routes notifications to the appropriate channel handler based on type.
 * Notification failures are logged as warnings and never affect task results.
 */

import { sendSlack } from './slack-notifier.js';
import { sendDiscord } from './discord-notifier.js';
import { sendEmail } from './email-notifier.js';
import { sendWebhook } from './webhook-notifier.js';

/**
 * Send notifications for a completed task.
 *
 * Respects on_success/on_failure flags. Sends to all configured channels.
 * Individual channel failures are caught and logged — they never propagate.
 *
 * @param {object} notifConfig - Notification config from record.
 * @param {boolean} notifConfig.on_success - Send on success.
 * @param {boolean} notifConfig.on_failure - Send on failure.
 * @param {Array} notifConfig.channels - Channel configurations.
 * @param {object} payload - Notification payload.
 * @param {string} payload.task_name - Human-readable task name.
 * @param {string} payload.task_id - URL-safe task ID.
 * @param {string} payload.status - 'success' or 'failure'.
 * @param {number} payload.exit_code - Process exit code.
 * @param {number} payload.duration - Duration in seconds.
 * @param {string[]} payload.log_tail - Last 10 lines of output.
 * @param {string} payload.timestamp - ISO timestamp of completion.
 */
export async function sendNotifications(notifConfig, payload) {
  if (!notifConfig || !notifConfig.channels) return;

  // Check if we should send based on status
  if (payload.status === 'success' && !notifConfig.on_success) return;
  if (payload.status === 'failure' && !notifConfig.on_failure) return;

  for (const channel of notifConfig.channels) {
    try {
      await dispatchByType(channel, payload);
    } catch (err) {
      // Log warning but never fail the task due to notification errors
      console.warn(`Notification failed (${channel.type}): ${err.message}`);
    }
  }
}

/**
 * Dispatch a notification to the correct handler based on channel type.
 */
async function dispatchByType(channel, payload) {
  switch (channel.type) {
    case 'slack':
      return sendSlack(channel, payload);
    case 'discord':
      return sendDiscord(channel, payload);
    case 'email':
      return sendEmail(channel, payload);
    case 'webhook':
      return sendWebhook(channel, payload);
    default:
      console.warn(`Unknown notification channel type: "${channel.type}"`);
  }
}
