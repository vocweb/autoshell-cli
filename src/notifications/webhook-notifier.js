/**
 * Generic webhook notifier for AutoShell.
 *
 * Sends the full notification payload as a JSON POST request
 * to a custom URL with optional headers.
 */

/**
 * Send a notification via generic webhook.
 *
 * @param {object} channel - Channel config with url and optional headers.
 * @param {object} payload - Notification payload (sent as-is in body).
 */
export async function sendWebhook(channel, payload) {
  const headers = {
    'Content-Type': 'application/json',
    ...(channel.headers || {}),
  };

  const response = await fetch(channel.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
  }
}
