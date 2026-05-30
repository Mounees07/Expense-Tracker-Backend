const { Op } = require('sequelize');
const {
  Account,
  Budget,
  SavingsGoal,
  Bill,
  RecurringTransaction,
  Notification,
  Receipt,
  Report,
  Expense,
} = require('../models');

const resources = {
  accounts: Account,
  budgets: Budget,
  goals: SavingsGoal,
  bills: Bill,
  recurring: RecurringTransaction,
  notifications: Notification,
  receipts: Receipt,
  reports: Report,
};

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10), 1), 100);
  return { page, limit, offset: (page - 1) * limit };
};

const getModel = (resource) => resources[resource];

const listResource = async (req, res, next) => {
  try {
    const Model = getModel(req.params.resource);
    if (!Model) return res.status(404).json({ success: false, message: 'Resource not found' });

    const { page, limit, offset } = parsePagination(req.query);
    const where = { userId: req.user.id };

    if (req.query.status && Model.rawAttributes.status) where.status = req.query.status;
    if (req.query.type && Model.rawAttributes.type) where.type = req.query.type;
    if (req.query.month && Model.rawAttributes.month) where.month = req.query.month;
    if (req.query.year && Model.rawAttributes.year) where.year = req.query.year;

    const { count, rows } = await Model.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      raw: true,
    });

    res.json({
      success: true,
      data: rows.map((row) => ({ ...row, _id: row.id })),
      pagination: { total: count, page, pages: Math.ceil(count / limit), limit },
    });
  } catch (error) {
    next(error);
  }
};

const createResource = async (req, res, next) => {
  try {
    const Model = getModel(req.params.resource);
    if (!Model) return res.status(404).json({ success: false, message: 'Resource not found' });

    const record = await Model.create({ ...req.body, userId: req.user.id });
    const data = record.toJSON();
    res.status(201).json({ success: true, data: { ...data, _id: data.id } });
  } catch (error) {
    next(error);
  }
};

const updateResource = async (req, res, next) => {
  try {
    const Model = getModel(req.params.resource);
    if (!Model) return res.status(404).json({ success: false, message: 'Resource not found' });

    const record = await Model.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });

    await record.update(req.body);
    const data = record.toJSON();
    res.json({ success: true, data: { ...data, _id: data.id } });
  } catch (error) {
    next(error);
  }
};

const deleteResource = async (req, res, next) => {
  try {
    const Model = getModel(req.params.resource);
    if (!Model) return res.status(404).json({ success: false, message: 'Resource not found' });

    const deleted = await Model.destroy({ where: { id: req.params.id, userId: req.user.id } });
    if (!deleted) return res.status(404).json({ success: false, message: 'Record not found' });

    res.json({ success: true, message: 'Record deleted' });
  } catch (error) {
    next(error);
  }
};

const getInsights = async (req, res, next) => {
  try {
    const now = new Date();
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const transactions = await Expense.findAll({ where: { userId: req.user.id }, raw: true });
    const current = transactions.filter((item) => new Date(item.date) >= currentStart && new Date(item.date) <= currentEnd);
    const previous = transactions.filter((item) => new Date(item.date) >= previousStart && new Date(item.date) <= previousEnd);

    const sumByType = (items, type) => items
      .filter((item) => item.type === type)
      .reduce((sum, item) => sum + parseFloat(item.amount), 0);

    const currentIncome = sumByType(current, 'income');
    const currentExpense = sumByType(current, 'expense');
    const previousExpense = sumByType(previous, 'expense');
    const savings = currentIncome - currentExpense;
    const savingsRate = currentIncome > 0 ? Math.round((savings / currentIncome) * 100) : 0;

    const categoryTotals = current
      .filter((item) => item.type === 'expense')
      .reduce((totals, item) => {
        totals[item.category] = (totals[item.category] || 0) + parseFloat(item.amount);
        return totals;
      }, {});

    const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
    const expenseChange = previousExpense > 0
      ? Math.round(((currentExpense - previousExpense) / previousExpense) * 100)
      : currentExpense > 0 ? 100 : 0;

    const insights = [
      topCategory
        ? `Highest spending category this month is ${topCategory[0]} at Rs ${topCategory[1].toFixed(2)}.`
        : 'No expense category has activity this month yet.',
      `Monthly expenses ${expenseChange >= 0 ? 'increased' : 'decreased'} by ${Math.abs(expenseChange)}% compared to last month.`,
      `Savings rate is ${savingsRate}% for the current month.`,
      savings >= 0
        ? `Cash flow is positive by Rs ${savings.toFixed(2)} this month.`
        : `Cash flow is negative by Rs ${Math.abs(savings).toFixed(2)} this month.`,
    ];

    res.json({
      success: true,
      data: {
        currentIncome,
        currentExpense,
        savings,
        savingsRate,
        topCategory: topCategory ? { category: topCategory[0], amount: topCategory[1] } : null,
        expenseChange,
        insights,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getMonthlyExpenseTarget = async (req, res, next) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month || `${now.getMonth() + 1}`, 10);
    const year = parseInt(req.query.year || `${now.getFullYear()}`, 10);

    const budget = await Budget.findOne({
      where: {
        userId: req.user.id,
        category: 'All',
        month,
        year,
      },
      order: [['updatedAt', 'DESC']],
      raw: true,
    });

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    const transactions = await Expense.findAll({
      where: {
        userId: req.user.id,
        type: 'expense',
        date: { [Op.between]: [startDate, endDate] },
      },
      raw: true,
    });

    const spent = transactions.reduce((sum, item) => sum + parseFloat(item.amount), 0);
    const target = budget ? parseFloat(budget.amount) : 0;
    const remaining = Math.max(target - spent, 0);
    const utilization = target > 0 ? Math.round((spent / target) * 100) : 0;

    res.json({
      success: true,
      data: {
        budget: budget ? { ...budget, _id: budget.id } : null,
        month,
        year,
        target,
        spent,
        remaining,
        utilization,
        exceeded: target > 0 && spent > target,
      },
    });
  } catch (error) {
    next(error);
  }
};

const setMonthlyExpenseTarget = async (req, res, next) => {
  try {
    const now = new Date();
    const month = parseInt(req.body.month || `${now.getMonth() + 1}`, 10);
    const year = parseInt(req.body.year || `${now.getFullYear()}`, 10);
    const amount = parseFloat(req.body.amount);

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Enter a valid monthly expense target' });
    }

    const [budget] = await Budget.findOrCreate({
      where: {
        userId: req.user.id,
        category: 'All',
        month,
        year,
      },
      defaults: {
        userId: req.user.id,
        name: 'Monthly Expense Target',
        category: 'All',
        month,
        year,
        amount,
        alertThreshold: req.body.alertThreshold || 80,
      },
    });

    await budget.update({
      name: 'Monthly Expense Target',
      amount,
      alertThreshold: req.body.alertThreshold || budget.alertThreshold || 80,
    });

    const data = budget.toJSON();
    res.json({ success: true, data: { ...data, _id: data.id } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listResource,
  createResource,
  updateResource,
  deleteResource,
  getInsights,
  getMonthlyExpenseTarget,
  setMonthlyExpenseTarget,
};
