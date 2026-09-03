const { Op } = require('sequelize');
const Expense = require('../models/Expense');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DUPLICATE_WINDOW_DAYS = 2;
const UNUSUAL_AMOUNT_MULTIPLIER = 2.5;
const MIN_HISTORY_FOR_UNUSUAL_CHECK = 3;

/**
 * Computes `isDuplicate` and `isUnusualAmount` flags for the given page of
 * expense rows (only rows with type 'expense' are checked). Kept cheap by
 * issuing at most two extra queries total for the whole page, rather than
 * per-row queries.
 *
 * @param {Array<object>} rows - Plain expense objects for the current page.
 * @param {number} userId
 * @returns {Promise<Array<object>>} The same rows, each augmented with
 *   isDuplicate/isUnusualAmount booleans (false for non-expense rows).
 */
const annotateAnomalies = async (rows, userId) => {
  const expenseRows = rows.filter((r) => r.type === 'expense');
  if (expenseRows.length === 0) {
    return rows.map((r) => ({ ...r, isDuplicate: false, isUnusualAmount: false }));
  }

  // --- Duplicate detection: single query over a padded date range ---
  const dates = expenseRows.map((r) => new Date(r.date).getTime());
  const minDate = new Date(Math.min(...dates) - DUPLICATE_WINDOW_DAYS * MS_PER_DAY);
  const maxDate = new Date(Math.max(...dates) + DUPLICATE_WINDOW_DAYS * MS_PER_DAY);

  const candidates = await Expense.findAll({
    where: {
      userId,
      type: 'expense',
      date: { [Op.between]: [minDate, maxDate] },
    },
    attributes: ['id', 'title', 'amount', 'date'],
    raw: true,
  });

  const isDuplicate = (row) => {
    const rowDate = new Date(row.date).getTime();
    const rowTitle = (row.title || '').trim().toLowerCase();
    const rowAmount = parseFloat(row.amount);

    return candidates.some((c) => {
      if (String(c.id) === String(row.id)) return false;
      if ((c.title || '').trim().toLowerCase() !== rowTitle) return false;
      if (parseFloat(c.amount) !== rowAmount) return false;
      const diffDays = Math.abs(new Date(c.date).getTime() - rowDate) / MS_PER_DAY;
      return diffDays <= DUPLICATE_WINDOW_DAYS;
    });
  };

  // --- Unusual amount detection: one query per distinct category on the page ---
  const categories = [...new Set(expenseRows.map((r) => r.category))];
  const categoryStats = {}; // category -> { avg, count }

  await Promise.all(
    categories.map(async (category) => {
      const historical = await Expense.findAll({
        where: { userId, type: 'expense', category },
        attributes: ['id', 'amount'],
        raw: true,
      });
      categoryStats[category] = historical;
    })
  );

  const isUnusualAmount = (row) => {
    const historical = categoryStats[row.category] || [];
    const others = historical.filter((h) => String(h.id) !== String(row.id));
    if (others.length < MIN_HISTORY_FOR_UNUSUAL_CHECK) return false;

    const avg = others.reduce((sum, h) => sum + parseFloat(h.amount), 0) / others.length;
    if (avg <= 0) return false;

    const rowAmount = parseFloat(row.amount);
    return rowAmount > avg * UNUSUAL_AMOUNT_MULTIPLIER;
  };

  return rows.map((row) => {
    if (row.type !== 'expense') {
      return { ...row, isDuplicate: false, isUnusualAmount: false };
    }
    return {
      ...row,
      isDuplicate: isDuplicate(row),
      isUnusualAmount: isUnusualAmount(row),
    };
  });
};

module.exports = { annotateAnomalies };
