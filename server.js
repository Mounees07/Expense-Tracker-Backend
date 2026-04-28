require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { connectDB, sequelize } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const errorHandler = require('./middleware/errorHandler');

// Connect to MySQL
connectDB();

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/expenses', expenseRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Expense Tracker API is running 🚀', timestamp: new Date() });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));

  app.get('*', (req, res) => {
    // Only send the HTML file if the route doesn't start with /api
    if (!req.originalUrl.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
    } else {
      res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
    }
  });
} else {
  // 404 handler for API routes in dev
  app.use('*', (req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
  });
}

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

sequelize.sync({ alter: true }).then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  });
});
