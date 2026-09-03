const crypto = require('crypto');
const Expense = require('../models/Expense');
const Budget = require('../models/Budget');
const Notification = require('../models/Notification');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const { suggestCategory } = require('../utils/categorize');
const { annotateAnomalies } = require('../utils/anomalies');

// Checks whether an expense pushed a category (or the overall "All" target)
// past its budget alert threshold and, if so, raises a one-time notification.
// Wrapped in try/catch by the caller so a failure here never blocks expense creation.
const checkBudgetAlerts = async (userId, category, date) => {
  const refDate = date ? new Date(date) : new Date();
  const month = refDate.getMonth() + 1;
  const year = refDate.getFullYear();
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const categoriesToCheck = ['All', category].filter((value, index, arr) => arr.indexOf(value) === index);

  for (const budgetCategory of categoriesToCheck) {
    const budget = await Budget.findOne({
      where: { userId, category: budgetCategory, month, year },
      raw: true,
    });
    if (!budget || !budget.amount) continue;

    const where = {
      userId,
      type: 'expense',
      date: { [Op.between]: [startDate, endDate] },
    };
    if (budgetCategory !== 'All') where.category = budgetCategory;

    const transactions = await Expense.findAll({ where, raw: true, attributes: ['amount'] });
    const spent = transactions.reduce((sum, item) => sum + parseFloat(item.amount), 0);
    const target = parseFloat(budget.amount);
    const thresholdPct = budget.alertThreshold || 80;
    const usagePct = target > 0 ? Math.round((spent / target) * 100) : 0;

    if (usagePct < thresholdPct) continue;

    const title = budgetCategory === 'All'
      ? `You've used ${usagePct}% of your monthly expense target`
      : `You've used ${usagePct}% of your ${budgetCategory} budget this month`;

    const existing = await Notification.findOne({
      where: { userId, type: 'budget', isRead: false, title },
    });
    if (existing) continue;

    await Notification.create({
      userId,
      type: 'budget',
      title,
      message: budgetCategory === 'All'
        ? `Total spending this month is Rs ${spent.toFixed(2)} of a Rs ${target.toFixed(2)} target.`
        : `Spending on ${budgetCategory} this month is Rs ${spent.toFixed(2)} of a Rs ${target.toFixed(2)} budget.`,
    });
  }
};

// @desc    Get all expenses for user (with pagination, search, filter)
// @route   GET /api/expenses
// @access  Private
const getExpenses = async (req, res, next) => {
  try {
    const {
      category,
      search,
      notes,
      month,
      year,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      account,
      paymentMethod,
      type,
      page = 1,
      limit = 10,
      sortBy = 'date',
      order = 'desc',
    } = req.query;

    const where = { userId: req.user.id };

    // Category filter
    if (category && category !== 'All') {
      where.category = category;
    }

    // Search filter
    if (search) {
      where.title = { [Op.like]: `%${search}%` };
    }

    if (notes) {
      where.notes = { [Op.like]: `%${notes}%` };
    }

    if (type) {
      where.type = type;
    }

    if (account || paymentMethod) {
      where.paymentMethod = account || paymentMethod;
    }

    if (minAmount || maxAmount) {
      where.amount = {};
      if (minAmount) where.amount[Op.gte] = parseFloat(minAmount);
      if (maxAmount) where.amount[Op.lte] = parseFloat(maxAmount);
    }

    // Month/Year filter
    if (startDate || endDate) {
      const rangeStart = startDate ? new Date(startDate) : new Date(1970, 0, 1);
      const rangeEnd = endDate ? new Date(`${endDate} 23:59:59`) : new Date();
      where.date = { [Op.between]: [rangeStart, rangeEnd] };
    } else if (month && year) {
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
        [sequelize.literal('EXTRACT(MONTH FROM "date")'), '_id'],
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
      group: [sequelize.literal('EXTRACT(MONTH FROM "date")'), 'category'],
      order: [[sequelize.literal('EXTRACT(MONTH FROM "date")'), 'ASC']],
      raw: true
    });

    const expensesWithFlags = await annotateAnomalies(expenses, req.user.id);

    res.json({
      success: true,
      data: expensesWithFlags.map(e => ({...e, _id: e.id})), // MAP ID TO _id FOR FRONTEND COMPATIBILITY
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

    if (expenseData.type === 'expense') {
      try {
        await checkBudgetAlerts(req.user.id, expenseData.category, expenseData.date);
      } catch (notifyError) {
        console.error('Budget alert notification failed:', notifyError.message);
      }
    }

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
    const expense = await Expense.findOne({ where: { id: req.params.id, userId: req.user.id } });

    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    if (expense.transferGroupId) {
      await Expense.destroy({ where: { transferGroupId: expense.transferGroupId, userId: req.user.id } });
    } else {
      await expense.destroy();
    }

    res.json({ success: true, message: 'Expense deleted' });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk delete expenses
// @route   DELETE /api/expenses/bulk
// @access  Private
const bulkDeleteExpenses = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { ids } = req.body;

    const deleted = await Expense.destroy({ where: { id: { [Op.in]: ids }, userId: req.user.id } });

    res.json({ success: true, message: `${deleted} expense(s) deleted`, count: deleted });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk update category for expenses
// @route   PATCH /api/expenses/bulk-category
// @access  Private
const bulkUpdateCategory = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { ids, category } = req.body;

    const [updated] = await Expense.update(
      { category },
      { where: { id: { [Op.in]: ids }, userId: req.user.id } }
    );

    res.json({ success: true, message: `${updated} expense(s) updated`, count: updated });
  } catch (error) {
    next(error);
  }
};

// @desc    Transfer money between two payment methods/accounts
// @route   POST /api/expenses/transfer
// @access  Private
const createTransfer = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { fromPaymentMethod, toPaymentMethod, amount, date, notes } = req.body;

    if (fromPaymentMethod === toPaymentMethod) {
      return res.status(400).json({ success: false, message: 'From and To accounts must be different' });
    }

    const transferGroupId = crypto.randomUUID();
    const transferDate = date || new Date();

    const result = await sequelize.transaction(async (t) => {
      const outExpense = await Expense.create({
        userId: req.user.id,
        title: `Transfer to ${toPaymentMethod}`,
        amount: parseFloat(amount),
        category: 'Other',
        paymentMethod: fromPaymentMethod,
        type: 'expense',
        date: transferDate,
        notes,
        transferGroupId,
      }, { transaction: t });

      const inExpense = await Expense.create({
        userId: req.user.id,
        title: `Transfer from ${fromPaymentMethod}`,
        amount: parseFloat(amount),
        category: 'Other',
        paymentMethod: toPaymentMethod,
        type: 'income',
        date: transferDate,
        notes,
        transferGroupId,
      }, { transaction: t });

      return { outExpense, inExpense };
    });

    res.status(201).json({
      success: true,
      message: 'Transfer completed',
      data: {
        transferGroupId,
        from: result.outExpense.toJSON(),
        to: result.inExpense.toJSON(),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Export expenses as CSV
// @route   GET /api/expenses/export
// @access  Private
const exportCSV = async (req, res, next) => {
  try {
    const { category, search, month, year, startDate, endDate, type } = req.query;
    const where = { userId: req.user.id };

    if (category && category !== 'All') where.category = category;
    if (search) where.title = { [Op.like]: `%${search}%` };
    if (type) where.type = type;

    if (startDate || endDate) {
      const rangeStart = startDate ? new Date(startDate) : new Date(1970, 0, 1);
      const rangeEnd = endDate ? new Date(`${endDate} 23:59:59`) : new Date();
      where.date = { [Op.between]: [rangeStart, rangeEnd] };
    } else if (month && year) {
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

// @desc    Suggest a category based on an expense title (rule-based, no ML)
// @route   GET /api/expenses/suggest-category
// @access  Private
const suggestCategoryHandler = async (req, res, next) => {
  try {
    const { title } = req.query;
    const category = suggestCategory(title);
    res.json({ success: true, category });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  exportCSV,
  bulkDeleteExpenses,
  bulkUpdateCategory,
  createTransfer,
  suggestCategoryHandler,
};
