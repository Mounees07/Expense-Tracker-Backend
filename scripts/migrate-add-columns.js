/*
 * One-off, idempotent migration for the columns introduced alongside the
 * password-reset, scheduled-statement, budget-rollover and transfer-group
 * features. Safe to run multiple times.
 *
 * Usage:
 *   # against whatever DATABASE_URL is in the environment / .env
 *   node scripts/migrate-add-columns.js
 *
 *   # against a specific database (e.g. the Render/Supabase production URL)
 *   DATABASE_URL="postgres://..." node scripts/migrate-add-columns.js
 *
 * This exists because server.js no longer runs sequelize.sync({ alter: true })
 * in production, so new columns must be added explicitly.
 */
require('dotenv').config();
const { sequelize } = require('../config/db');

const statements = [
  // --- Users -------------------------------------------------------------
  `ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "resetPasswordToken" VARCHAR(255)`,
  `ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "resetPasswordExpires" TIMESTAMP WITH TIME ZONE`,
  `ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "lastStatementSentAt" TIMESTAMP WITH TIME ZONE`,
  // ENUM type must exist before the column can reference it. Sequelize expects
  // this exact type name so a later sync() recognises it.
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Users_statementSchedule') THEN
       CREATE TYPE "enum_Users_statementSchedule" AS ENUM ('off', 'daily', 'weekly', 'monthly');
     END IF;
   END $$`,
  `ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "statementSchedule" "enum_Users_statementSchedule" NOT NULL DEFAULT 'off'`,

  // --- Budgets ---------------------------------------------------------------
  `ALTER TABLE "Budgets" ADD COLUMN IF NOT EXISTS "rolloverEnabled" BOOLEAN NOT NULL DEFAULT false`,

  // --- Expenses ------------------------------------------------------------
  `ALTER TABLE "Expenses" ADD COLUMN IF NOT EXISTS "transferGroupId" VARCHAR(255)`,
];

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Connected. Applying migration...');
    for (const sql of statements) {
      const label = sql.replace(/\s+/g, ' ').trim().slice(0, 80);
      process.stdout.write(`  ${label} ... `);
      await sequelize.query(sql);
      console.log('ok');
    }
    console.log('\nMigration complete.');
    process.exit(0);
  } catch (err) {
    console.error('\nMigration failed:', err.message);
    process.exit(1);
  }
})();
