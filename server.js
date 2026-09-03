require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { connectDB, sequelize } = require('./config/db');
require('./models');
const authRoutes = require('./routes/authRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const financeRoutes = require('./routes/financeRoutes');
const errorHandler = require('./middleware/errorHandler');
const { startStatementScheduler } = require('./services/statementScheduler');

connectDB();

const app = express();

// ALLOWED_ORIGINS is a comma-separated list of frontend origins that may call
// the API. Entries may contain "*" as a wildcard, e.g.
//   https://myapp.vercel.app,https://*.vercel.app,http://localhost:3000
// which covers the production alias plus every Vercel preview deployment.
const originPatterns = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
  .map((o) => new RegExp('^' + o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'));

const isOriginAllowed = (origin) => originPatterns.some((re) => re.test(origin));

app.use(helmet());
app.use(cors({
  origin: function (origin, callback) {
    // No Origin header => same-origin / curl / server-to-server; allow it.
    if (!origin || isOriginAllowed(origin)) {
      return callback(null, true);
    }
    // Reject without throwing: the ACAO header is simply omitted and the
    // browser blocks the response, no 500 noise in the logs.
    return callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later.' },
});

app.use('/api/auth/register', authLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/finance', financeRoutes);

app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'ExpenseTracker API',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      expenses: '/api/expenses',
      finance: '/api/finance',
    },
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Expense Tracker API is running',
    timestamp: new Date(),
  });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));

  app.get('*', (req, res) => {
    if (!req.originalUrl.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
    } else {
      res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
    }
  });
} else {
  app.use('*', (req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
  });
}

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// In production we don't auto-alter the schema on every boot. Set
// SEQUELIZE_ALTER=true for a single deploy to add newly-introduced columns
// to an existing database, then remove it (proper migrations are the
// long-term answer).
const shouldAlter = process.env.NODE_ENV !== 'production' || process.env.SEQUELIZE_ALTER === 'true';
const syncOptions = shouldAlter ? { alter: true } : {};
if (process.env.NODE_ENV === 'production' && !shouldAlter) {
  console.warn('Running sequelize.sync() without alter in production. Use migrations for schema changes.');
}

sequelize.sync(syncOptions).then(() => {
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  });

  try {
    startStatementScheduler();
  } catch (err) {
    console.warn('Failed to start statement email scheduler:', err.message);
  }

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. The backend may already be running. Stop the existing server or set PORT to another value.`);
      process.exit(1);
    }

    console.error('Server failed to start:', err);
    process.exit(1);
  });
});
