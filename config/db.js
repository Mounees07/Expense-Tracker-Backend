const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
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
