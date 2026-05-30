const { Sequelize } = require('sequelize');
require('dotenv').config();

const getDatabaseUrl = () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing. Add it to backend/.env before starting the server.');
  }

  try {
    new URL(databaseUrl);
  } catch (err) {
    throw new Error(
      'DATABASE_URL is invalid. If your password contains special characters like #, %, @, /, or ?, URL-encode them in backend/.env.'
    );
  }

  return databaseUrl;
};

const sequelize = new Sequelize(getDatabaseUrl(), {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // Required for Supabase and Render
    },
  },
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log(`✅ PostgreSQL Connected via Supabase`);
  } catch (err) {
    console.error("DB Connection Error:", err);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
