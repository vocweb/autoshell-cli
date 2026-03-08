/**
 * Email notifier for AutoShell via SMTP.
 *
 * Uses nodemailer (optional dependency) to send task completion
 * notifications. SMTP password is read from an environment variable
 * to avoid storing secrets in config files.
 */

/**
 * Send a notification via email.
 *
 * @param {object} channel - Channel config with SMTP settings.
 * @param {object} payload - Notification payload.
 */
export async function sendEmail(channel, payload) {
  // Dynamic import: nodemailer is an optional dependency
  let nodemailer;
  try {
    nodemailer = await import('nodemailer');
  } catch {
    throw new Error('nodemailer is not installed. Run: npm install nodemailer');
  }

  const statusUpper = payload.status.toUpperCase();
  const emoji = payload.status === 'success' ? '✅' : '❌';

  // Read SMTP password from environment variable (never from config)
  const password = channel.password_env
    ? process.env[channel.password_env]
    : undefined;

  const transporter = nodemailer.default.createTransport({
    host: channel.smtp_host,
    port: channel.smtp_port || 587,
    secure: channel.smtp_port === 465,
    auth: channel.from && password ? {
      user: channel.from,
      pass: password,
    } : undefined,
  });

  const logSection = payload.log_tail
    ? `\n\nLast output:\n${payload.log_tail.join('\n')}`
    : '';

  await transporter.sendMail({
    from: channel.from,
    to: channel.to,
    subject: `AutoShell: Task "${payload.task_name}" [${statusUpper}]`,
    text: [
      `${emoji} Task "${payload.task_name}" ${payload.status}`,
      '',
      `Exit code: ${payload.exit_code}`,
      `Duration: ${payload.duration}s`,
      `Time: ${payload.timestamp}`,
      logSection,
    ].join('\n'),
  });
}
