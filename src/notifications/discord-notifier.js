/**
 * Discord webhook notifier for AutoShell.
 *
 * Sends task completion notifications to a Discord channel
 * via webhook URL with rich embed formatting.
 */

/**
 * Send a notification to Discord.
 *
 * @param {object} channel - Channel config with webhook_url.
 * @param {object} payload - Notification payload.
 */
export async function sendDiscord(channel, payload) {
  const emoji = payload.status === 'success' ? '✅' : '❌';
  const statusText = payload.status === 'success' ? 'completed' : 'failed';

  const body = {
    content: `${emoji} Task "${payload.task_name}" ${statusText}`,
    embeds: [{
      title: `AutoShell: ${payload.task_name}`,
      color: payload.status === 'success' ? 0x36a64f : 0xe01e5a,
      fields: [
        { name: 'Status', value: payload.status, inline: true },
        { name: 'Exit Code', value: String(payload.exit_code), inline: true },
        { name: 'Duration', value: `${payload.duration}s`, inline: true },
      ],
      description: payload.log_tail ? payload.log_tail.join('\n') : '',
      timestamp: payload.timestamp,
      footer: { text: 'AutoShell' },
    }],
  };

  const response = await fetch(channel.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook returned ${response.status}`);
  }
}
