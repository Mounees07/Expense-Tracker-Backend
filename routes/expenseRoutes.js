const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  exportCSV,
} = require('../controllers/expenseController');
const { protect } = require('../middleware/auth');
const { CATEGORIES } = require('../models/Expense');

const expenseValidation = [
  body('title').trim().isLength({ min: 2, max: 100 }).withMessage('Title must be 2-100 characters'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('category').isIn(CATEGORIES).withMessage('Invalid category'),
  body('date').optional().isISO8601().withMessage('Invalid date format'),
];

const updateValidation = [
  body('title').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Title must be 2-100 characters'),
  body('amount').optional().isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('category').optional().isIn(CATEGORIES).withMessage('Invalid category'),
  body('date').optional().isISO8601().withMessage('Invalid date format'),
];

router.use(protect);

router.get('/export', exportCSV);
router.get('/', getExpenses);
router.post('/', expenseValidation, createExpense);
router.put('/:id', updateValidation, updateExpense);
router.delete('/:id', deleteExpense);

module.exports = router;
