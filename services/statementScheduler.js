const cron = require('node-cron');
const { Op } = require('sequelize');
const User = require('../models/User');
const { sendEmail } = require('../config/email');
const { generateStatementPdf } = require('../utils/generateStatementPdf');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const SCHEDULE_CONFIG = {
  daily: {
    dueAfterMs: 23 * HOUR,
    label: 'Daily',
    getRange: () => {
      const end = new Date();
      const start = new Date(end.getTime() - DAY);
      return { startDate: start, endDate: end };
    },
  },
  weekly: {
    dueAfterMs: 6.5 * DAY,
    label: 'Weekly',
    getRange: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 7 * DAY);
      return { startDate: start, endDate: end };
    },
  },
  monthly: {
    dueAfterMs: 29.5 * DAY,
    label: 'Monthly',
    getRange: () => {
      const now = new Date();
      // last calendar month
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { startDate: start, endDate: end };
    },
  },
};

const isDue = (user) => {
  const config = SCHEDULE_CONFIG[user.statementSchedule];
  if (!config) return false;
  if (!user.lastStatementSentAt) return true;
  const elapsed = Date.now() - new Date(user.lastStatementSentAt).getTime();
  return elapsed > config.dueAfterMs;
};

/**
 * Finds users due for a scheduled statement email and sends them.
 * Each user is processed independently — a failure for one user
 * (e.g. missing SMTP config) is logged and does not stop the loop.
 */
const runDueStatements = async () => {
  const users = await User.findAll({
    where: { statementSchedule: { [Op.ne]: 'off' } },
  });

  for (const user of users) {
    try {
      if (!isDue(user)) continue;

      const config = SCHEDULE_CONFIG[user.statementSchedule];
      const { startDate, endDate } = config.getRange();

      const pdfBuffer = await generateStatementPdf(user, { startDate, endDate });

      const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN');

      await sendEmail({
        to: user.email,
        subject: `Your ${config.label} Expense Statement`,
        html: `
          <p>Hi ${user.name || ''},</p>
          <p>Attached is your ${config.label.toLowerCase()} expense statement for
          ${fmtDate(startDate)} - ${fmtDate(endDate)}.</p>
          <p>This is an automated email from ExpenseTracker based on your notification settings.</p>
        `,
        attachments: [
          {
            filename: `statement-${user.statementSchedule}-${new Date().toISOString().slice(0, 10)}.pdf`,
            content: pdfBuffer,
          },
        ],
      });

      user.lastStatementSentAt = new Date();
      await user.save();
    } catch (err) {
      console.error(`Failed to send statement email to user ${user.id}:`, err.message);
    }
  }
};

/**
 * Registers a daily cron job (8am server time) that checks all users
 * for due scheduled statement emails. Does not run immediately.
 */
const startStatementScheduler = () => {
  cron.schedule('0 8 * * *', () => {
    runDueStatements().catch((err) => {
      console.error('Statement scheduler run failed:', err.message);
    });
  });
  console.log('Statement email scheduler registered (daily check at 08:00 server time).');
};

module.exports = { startStatementScheduler, runDueStatements };
