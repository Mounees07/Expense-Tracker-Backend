const Expense = require('../models/Expense');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');

// @desc    Get all expenses for user (with pagination, search, filter)
// @route   GET /api/expenses
// @access  Private
const getExpenses = async (req, res, next) => {
  try {
    const { category, search, month, year, page = 1, limit = 10, sortBy = 'date', order = 'desc' } = req.query;

    const where = { userId: req.user.id };

    // Category filter
    if (category && category !== 'All') {
      where.category = category;
    }

    // Search filter
    if (search) {
      where.title = { [Op.like]: `%${search}%` };
    }

    // Month/Year filter
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      where.date = { [Op.between]: [startDate, endDate] };
    } else if (year) {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);
      where.date = { [Op.between]: [startDate, endDate] };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const { count: total, rows: expenses } = await Expense.findAndCountAll({
      where,
      order: [[sortBy, order.toUpperCase()]],
      offset: skip,
      limit: parseInt(limit),
      raw: true,
    });

    // Summary stats
    const allExpenses = await Expense.findAll({ where: { userId: req.user.id }, raw: true });
    
    let totalIncome = 0;
    let totalExpenseAmount = 0;
    const accountBalances = {};

    allExpenses.forEach(e => {
      const amount = parseFloat(e.amount);
      const pm = e.paymentMethod || 'Cash';
      if (!accountBalances[pm]) accountBalances[pm] = 0;

      if (e.type === 'income') {
        totalIncome += amount;
        accountBalances[pm] += amount;
      } else {
        totalExpenseAmount += amount;
        accountBalances[pm] -= amount;
      }
    });

    const totalBalance = totalIncome - totalExpenseAmount;

    // Category breakdown (only for expenses)
    const categoryBreakdown = allExpenses
      .filter(e => e.type === 'expense')
      .reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + parseFloat(e.amount);
        return acc;
      }, {});

    // Monthly summary (current year)
    const currentYear = new Date().getFullYear();
    const monthlyData = await Expense.findAll({
      attributes: [
        [sequelize.fn('MONTH', sequelize.col('date')), '_id'],
        'category',
        [sequelize.fn('SUM', sequelize.col('amount')), 'total'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        userId: req.user.id,
        type: 'expense',
        date: {
          [Op.between]: [new Date(`${currentYear}-01-01`), new Date(`${currentYear}-12-31 23:59:59`)]
        }
      },
      group: [sequelize.fn('MONTH', sequelize.col('date')), 'category'],
      order: [[sequelize.fn('MONTH', sequelize.col('date')), 'ASC']],
      raw: true
    });

    res.json({
      success: true,
      data: expenses.map(e => ({...e, _id: e.id})), // MAP ID TO _id FOR FRONTEND COMPATIBILITY
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit),
      },
      summary: {
        totalAmount: totalExpenseAmount,
        totalIncome,
        totalBalance,
        accountBalances,
        categoryBreakdown,
        monthlyData: monthlyData.map(d => ({ _id: parseInt(d._id), category: d.category, total: parseFloat(d.total), count: parseInt(d.count) })),
        totalCount: allExpenses.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create expense
// @route   POST /api/expenses
// @access  Private
const createExpense = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { title, amount, category, paymentMethod, type, date, notes } = req.body;

    const expense = await Expense.create({
      userId: req.user.id,
      title,
      amount: parseFloat(amount),
      category,
      paymentMethod: paymentMethod || 'Cash',
      type: type || 'expense',
      date: date || new Date(),
      notes,
    });

    const expenseData = expense.toJSON();
    expenseData._id = expenseData.id;

    res.status(201).json({ success: true, message: 'Expense added', data: expenseData });
  } catch (error) {
    next(error);
  }
};

// @desc    Update expense
// @route   PUT /api/expenses/:id
// @access  Private
const updateExpense = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const expense = await Expense.findOne({ where: { id: req.params.id, userId: req.user.id } });

    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    const { title, amount, category, paymentMethod, type, date, notes } = req.body;

    expense.title = title || expense.title;
    expense.amount = amount ? parseFloat(amount) : expense.amount;
    expense.category = category || expense.category;
    if (paymentMethod) expense.paymentMethod = paymentMethod;
    if (type) expense.type = type;
    expense.date = date || expense.date;
    if (notes !== undefined) expense.notes = notes;

    await expense.save();
    
    const expenseData = expense.toJSON();
    expenseData._id = expenseData.id;

    res.json({ success: true, message: 'Expense updated', data: expenseData });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete expense
// @route   DELETE /api/expenses/:id
// @access  Private
const deleteExpense = async (req, res, next) => {
  try {
    const deleted = await Expense.destroy({ where: { id: req.params.id, userId: req.user.id } });

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    res.json({ success: true, message: 'Expense deleted' });
  } catch (error) {
    next(error);
  }
};

// @desc    Export expenses as CSV
// @route   GET /api/expenses/export
// @access  Private
const exportCSV = async (req, res, next) => {
  try {
    const { category, search, month, year } = req.query;
    const where = { userId: req.user.id };

    if (category && category !== 'All') where.category = category;
    if (search) where.title = { [Op.like]: `%${search}%` };
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      where.date = { [Op.between]: [startDate, endDate] };
    } else if (year) {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);
      where.date = { [Op.between]: [startDate, endDate] };
    }

    const expenses = await Expense.findAll({
      where,
      order: [['date', 'DESC']],
      raw: true
    });

    const header = 'Title,Amount,Category,Payment Method,Date,Notes\n';
    const rows = expenses
      .map((e) => {
        const date = new Date(e.date).toLocaleDateString('en-IN');
        const notes = (e.notes || '').replace(/,/g, ';');
        return `"${e.title}",${e.amount},"${e.category}","${e.paymentMethod || 'Cash'}","${date}","${notes}"`;
      })
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=expenses.csv');
    res.send(header + rows);
  } catch (error) {
    next(error);
  }
};

module.exports = { getExpenses, createExpense, updateExpense, deleteExpense, exportCSV };
