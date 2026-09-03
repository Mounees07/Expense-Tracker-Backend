const { Op } = require('sequelize');
const { validationResult } = require('express-validator');
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

const RESTRICTED_FIELDS = ['id', 'userId', 'createdAt', 'updatedAt'];

const sanitizeBody = (body) => {
  const clean = { ...body };
  RESTRICTED_FIELDS.forEach((field) => delete clean[field]);
  return clean;
};

// Sums a user's actual expense spend for a given category/month/year.
// category === 'All' sums every expense in the period (mirrors getMonthlyExpenseTarget).
const computeActualSpend = async (userId, category, month, year) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  const where = {
    userId,
    type: 'expense',
    date: { [Op.between]: [startDate, endDate] },
  };
  if (category && category !== 'All') where.category = category;

  const transactions = await Expense.findAll({ where, raw: true, attributes: ['amount'] });
  return transactions.reduce((sum, item) => sum + parseFloat(item.amount), 0);
};

// Looks up the immediately preceding month's budget for this category and,
// if rollover is enabled and there was unspent budget, returns that leftover
// amount so it can be added to the new period's target. Returns 0 otherwise.
const computeRolloverAmount = async (userId, category, month, year) => {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const previousBudget = await Budget.findOne({
    where: { userId, category, month: prevMonth, year: prevYear },
    raw: true,
  });

  if (!previousBudget || !previousBudget.rolloverEnabled) return 0;

  const previousActualSpend = await computeActualSpend(userId, category, prevMonth, prevYear);
  const leftover = parseFloat(previousBudget.amount) - previousActualSpend;
  return leftover > 0 ? leftover : 0;
};

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

    if (req.params.resource === 'bills') {
      await handleBillReminders(req.user.id);
    }

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

// Lazily keeps bill reminder status fresh on read (no cron needed):
// - flips pending/sent bills whose dueDate has passed to 'overdue'
// - creates a one-time 'bill' notification for bills due within 3 days
const handleBillReminders = async (userId) => {
  const todayStr = new Date().toISOString().slice(0, 10);

  await Bill.update(
    { reminderStatus: 'overdue' },
    {
      where: {
        userId,
        reminderStatus: { [Op.in]: ['pending', 'sent'] },
        dueDate: { [Op.lt]: todayStr },
      },
    }
  );

  const soon = new Date();
  soon.setDate(soon.getDate() + 3);
  const soonStr = soon.toISOString().slice(0, 10);

  const upcomingBills = await Bill.findAll({
    where: {
      userId,
      reminderStatus: 'pending',
      dueDate: { [Op.between]: [todayStr, soonStr] },
    },
    raw: true,
  });

  for (const bill of upcomingBills) {
    const existing = await Notification.findOne({
      where: {
        userId,
        type: 'bill',
        isRead: false,
        title: `Upcoming bill: ${bill.name}`,
      },
    });
    if (existing) continue;

    await Notification.create({
      userId,
      type: 'bill',
      title: `Upcoming bill: ${bill.name}`,
      message: `${bill.name} of Rs ${parseFloat(bill.amount).toFixed(2)} is due on ${bill.dueDate}.`,
    });
  }
};

const getBudgetSummary = async (req, res, next) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month || `${now.getMonth() + 1}`, 10);
    const year = parseInt(req.query.year || `${now.getFullYear()}`, 10);

    const budgets = await Budget.findAll({
      where: { userId: req.user.id, month, year },
      raw: true,
    });

    const summary = await Promise.all(
      budgets.map(async (budget) => {
        const actual = await computeActualSpend(req.user.id, budget.category, month, year);
        const target = parseFloat(budget.amount);
        return {
          ...budget,
          _id: budget.id,
          target,
          actual,
          remaining: Math.max(target - actual, 0),
          utilization: target > 0 ? Math.round((actual / target) * 100) : 0,
          exceeded: target > 0 && actual > target,
        };
      })
    );

    res.json({ success: true, data: summary, month, year });
  } catch (error) {
    next(error);
  }
};

const createResource = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const Model = getModel(req.params.resource);
    if (!Model) return res.status(404).json({ success: false, message: 'Resource not found' });

    const payload = sanitizeBody(req.body);

    if (req.params.resource === 'budgets' && payload.category && payload.month && payload.year && payload.amount) {
      const month = parseInt(payload.month, 10);
      const year = parseInt(payload.year, 10);
      const existing = await Budget.findOne({
        where: { userId: req.user.id, category: payload.category, month, year },
      });
      if (!existing) {
        const rollover = await computeRolloverAmount(req.user.id, payload.category, month, year);
        if (rollover > 0) {
          payload.amount = parseFloat(payload.amount) + rollover;
        }
      }
    }

    const record = await Model.create({ ...payload, userId: req.user.id });
    const data = record.toJSON();
    res.status(201).json({ success: true, data: { ...data, _id: data.id } });
  } catch (error) {
    next(error);
  }
};

const updateResource = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const Model = getModel(req.params.resource);
    if (!Model) return res.status(404).json({ success: false, message: 'Resource not found' });

    const record = await Model.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });

    await record.update(sanitizeBody(req.body));
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

    const existingBudget = await Budget.findOne({
      where: { userId: req.user.id, category: 'All', month, year },
    });
    let initialAmount = amount;
    if (!existingBudget) {
      const rollover = await computeRolloverAmount(req.user.id, 'All', month, year);
      if (rollover > 0) initialAmount = amount + rollover;
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
        amount: initialAmount,
        alertThreshold: req.body.alertThreshold || 80,
        rolloverEnabled: req.body.rolloverEnabled || false,
      },
    });

    await budget.update({
      name: 'Monthly Expense Target',
      amount: existingBudget ? amount : initialAmount,
      alertThreshold: req.body.alertThreshold || budget.alertThreshold || 80,
      rolloverEnabled: req.body.rolloverEnabled !== undefined ? req.body.rolloverEnabled : budget.rolloverEnabled,
    });

    const data = budget.toJSON();
    res.json({ success: true, data: { ...data, _id: data.id } });
  } catch (error) {
    next(error);
  }
};

// Frequency bands (average gap in days) used to classify a recurring pattern.
const FREQUENCY_BANDS = [
  { frequency: 'daily', min: 0.5, max: 1.5, intervalDays: 1 },
  { frequency: 'weekly', min: 6, max: 8, intervalDays: 7 },
  { frequency: 'monthly', min: 28, max: 31, intervalDays: 30 },
  { frequency: 'yearly', min: 360, max: 370, intervalDays: 365 },
];

const addFrequencyInterval = (date, frequency) => {
  const result = new Date(date);
  if (frequency === 'daily') result.setDate(result.getDate() + 1);
  else if (frequency === 'weekly') result.setDate(result.getDate() + 7);
  else if (frequency === 'monthly') result.setMonth(result.getMonth() + 1);
  else if (frequency === 'yearly') result.setFullYear(result.getFullYear() + 1);
  return result;
};

// Scans the user's recent expense history for repeating title/category
// patterns (e.g. "Netflix" every ~30 days) that aren't already tracked as a
// RecurringTransaction, and suggests them as candidates to add.
const getRecurringSuggestions = async (req, res, next) => {
  try {
    const since = new Date();
    since.setMonth(since.getMonth() - 6);

    const transactions = await Expense.findAll({
      where: {
        userId: req.user.id,
        type: 'expense',
        date: { [Op.gte]: since },
      },
      raw: true,
      order: [['date', 'ASC']],
    });

    const groups = {};
    transactions.forEach((item) => {
      const key = `${item.title.trim().toLowerCase()}|${item.category}`;
      if (!groups[key]) groups[key] = { title: item.title.trim(), category: item.category, items: [] };
      groups[key].items.push(item);
    });

    const existingRecurring = await RecurringTransaction.findAll({
      where: { userId: req.user.id },
      raw: true,
      attributes: ['title'],
    });
    const existingTitles = new Set(existingRecurring.map((row) => row.title.trim().toLowerCase()));

    const candidates = [];

    Object.values(groups).forEach((group) => {
      if (group.items.length < 3) return;
      if (existingTitles.has(group.title.toLowerCase())) return;

      const sorted = [...group.items].sort((a, b) => new Date(a.date) - new Date(b.date));
      const gaps = [];
      for (let i = 1; i < sorted.length; i += 1) {
        const days = (new Date(sorted[i].date) - new Date(sorted[i - 1].date)) / (1000 * 60 * 60 * 24);
        gaps.push(days);
      }
      if (gaps.length === 0) return;

      const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
      const band = FREQUENCY_BANDS.find((entry) => avgGap >= entry.min && avgGap <= entry.max);
      if (!band) return;

      const consistent = gaps.every((gap) => Math.abs(gap - avgGap) <= avgGap * 0.4 + 0.5);
      if (!consistent) return;

      const avgAmount = sorted.reduce((sum, item) => sum + parseFloat(item.amount), 0) / sorted.length;
      const lastDate = sorted[sorted.length - 1].date;

      candidates.push({
        title: group.title,
        category: group.category,
        amount: Math.round(avgAmount * 100) / 100,
        frequency: band.frequency,
        occurrences: sorted.length,
        lastDate,
        suggestedNextRunDate: addFrequencyInterval(lastDate, band.frequency).toISOString().slice(0, 10),
      });
    });

    candidates.sort((a, b) => b.occurrences - a.occurrences);

    res.json({ success: true, data: candidates.slice(0, 10) });
  } catch (error) {
    next(error);
  }
};

// Mirrors expenseController's balance calc locally (sum of all income minus
// all expense across the user's full history) to avoid cross-controller coupling.
const computeCurrentBalance = async (userId) => {
  const transactions = await Expense.findAll({
    where: { userId },
    raw: true,
    attributes: ['amount', 'type'],
  });
  return transactions.reduce((balance, item) => {
    const amount = parseFloat(item.amount);
    return item.type === 'income' ? balance + amount : balance - amount;
  }, 0);
};

const toDateOnly = (date) => new Date(date).toISOString().slice(0, 10);

// Projects each active recurring transaction's occurrences (starting at
// nextRunDate, stepping by its frequency, respecting endDate) that fall
// within [windowStart, windowEnd].
const projectRecurringOccurrences = (recurring, windowStart, windowEnd) => {
  const occurrences = [];
  let cursor = new Date(recurring.nextRunDate);
  const end = recurring.endDate ? new Date(recurring.endDate) : null;
  let guard = 0;

  while (cursor <= windowEnd && guard < 500) {
    guard += 1;
    if (end && cursor > end) break;
    if (cursor >= windowStart) {
      occurrences.push({
        date: toDateOnly(cursor),
        amount: parseFloat(recurring.amount) * (recurring.type === 'income' ? 1 : -1),
      });
    }
    cursor = addFrequencyInterval(cursor, recurring.frequency);
  }

  return occurrences;
};

// Builds a simple, defensible day-by-day cash-flow projection: current
// balance + scheduled recurring transactions + upcoming bills + a smoothed
// historical daily run-rate for everything else.
const getCashFlowForecast = async (req, res, next) => {
  try {
    const days = [30, 60, 90].includes(parseInt(req.query.days, 10)) ? parseInt(req.query.days, 10) : 30;
    const userId = req.user.id;

    const currentBalance = await computeCurrentBalance(userId);

    const windowStart = new Date();
    windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + days);

    const activeRecurring = await RecurringTransaction.findAll({
      where: { userId, isActive: true },
      raw: true,
    });

    const dailyNet = {};
    activeRecurring.forEach((recurring) => {
      const occurrences = projectRecurringOccurrences(recurring, windowStart, windowEnd);
      occurrences.forEach(({ date, amount }) => {
        dailyNet[date] = (dailyNet[date] || 0) + amount;
      });
    });

    const upcomingBills = await Bill.findAll({
      where: {
        userId,
        dueDate: { [Op.between]: [toDateOnly(windowStart), toDateOnly(windowEnd)] },
        reminderStatus: { [Op.ne]: 'paid' },
      },
      raw: true,
    });
    upcomingBills.forEach((bill) => {
      const date = toDateOnly(bill.dueDate);
      dailyNet[date] = (dailyNet[date] || 0) - parseFloat(bill.amount);
    });

    // Historical daily run-rate over the last 90 days, to approximate ad-hoc
    // discretionary spending/income not captured by recurring rules or bills.
    const historyStart = new Date(windowStart);
    historyStart.setDate(historyStart.getDate() - 90);
    const history = await Expense.findAll({
      where: { userId, date: { [Op.gte]: historyStart } },
      raw: true,
      attributes: ['amount', 'type'],
    });
    const historyNet = history.reduce((sum, item) => {
      const amount = parseFloat(item.amount);
      return item.type === 'income' ? sum + amount : sum - amount;
    }, 0);
    const dailyRunRate = historyNet / 90;

    // Build the day-by-day series, then downsample to weekly points if the
    // window is large enough that a daily chart would be too dense.
    const series = [];
    let runningBalance = currentBalance;
    for (let i = 1; i <= days; i += 1) {
      const date = new Date(windowStart);
      date.setDate(date.getDate() + i);
      const dateStr = toDateOnly(date);
      runningBalance += dailyRunRate + (dailyNet[dateStr] || 0);
      series.push({ date: dateStr, projectedBalance: Math.round(runningBalance * 100) / 100 });
    }

    const useWeekly = days > 30;
    const points = useWeekly
      ? series.filter((_, index) => (index + 1) % 7 === 0 || index === series.length - 1)
      : series;

    const endingBalance = points.length ? points[points.length - 1].projectedBalance : currentBalance;

    res.json({
      success: true,
      data: {
        days,
        currentBalance: Math.round(currentBalance * 100) / 100,
        endingBalance,
        points,
      },
    });
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
  getBudgetSummary,
  getRecurringSuggestions,
  getCashFlowForecast,
};
