/**
 * Slack webhook notifier for AutoShell.
 *
 * Sends task completion notifications to a Slack channel
 * via incoming webhook URL.
 */

/**
 * Send a notification to Slack.
 *
 * @param {object} channel - Channel config with webhook_url.
 * @param {object} payload - Notification payload.
 */
export async function sendSlack(channel, payload) {
  const emoji = payload.status === 'success' ? '✅' : '❌';
  const statusText = payload.status === 'success' ? 'completed' : 'failed';

  const body = {
    text: `${emoji} Task "${payload.task_name}" ${statusText}`,
    attachments: [{
      color: payload.status === 'success' ? '#36a64f' : '#e01e5a',
      fields: [
        { title: 'Task', value: payload.task_name, short: true },
        { title: 'Status', value: payload.status, short: true },
        { title: 'Exit Code', value: String(payload.exit_code), short: true },
        { title: 'Duration', value: `${payload.duration}s`, short: true },
      ],
      text: payload.log_tail ? payload.log_tail.join('\n') : '',
      footer: 'AutoShell',
      ts: Math.floor(new Date(payload.timestamp).getTime() / 1000),
    }],
  };

  const response = await fetch(channel.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook returned ${response.status}`);
  }
}
