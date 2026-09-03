const nodemailer = require('nodemailer');

const { SMTP_USER, SMTP_PASS } = process.env;

if (!SMTP_USER || !SMTP_PASS) {
  console.warn(
    'WARNING: SMTP_USER/SMTP_PASS are not set. Password reset emails will fail until these are configured in .env.'
  );
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

/**
 * Send an email via the configured Gmail SMTP transporter.
 * @param {{ to: string, subject: string, html: string, attachments?: Array<{ filename: string, content: Buffer }> }} options
 */
const sendEmail = async ({ to, subject, html, attachments }) => {
  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error('Email service is not configured (missing SMTP_USER/SMTP_PASS).');
  }

  await transporter.sendMail({
    from: `"ExpenseTracker" <${SMTP_USER}>`,
    to,
    subject,
    html,
    ...(attachments && attachments.length ? { attachments } : {}),
  });
};

module.exports = { sendEmail, transporter };
