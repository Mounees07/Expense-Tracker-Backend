const PDFDocument = require('pdfkit');
const { Op } = require('sequelize');
const Expense = require('../models/Expense');

/**
 * Generate a PDF statement (Buffer) for a user, scoped to a date range.
 * Mirrors the summary/table structure of the client-side jsPDF export in
 * ExpenseContext.js's exportPDF, but computed server-side with pdfkit.
 *
 * @param {object} user - Sequelize User instance (needs id, name, email)
 * @param {{ startDate: Date, endDate: Date }} range
 * @returns {Promise<Buffer>}
 */
const generateStatementPdf = async (user, { startDate, endDate }) => {
  const expenses = await Expense.findAll({
    where: {
      userId: user.id,
      date: { [Op.between]: [startDate, endDate] },
    },
    order: [['date', 'ASC']],
    raw: true,
  });

  let totalIncome = 0;
  let totalExpense = 0;
  const accountBalances = {};

  expenses.forEach((e) => {
    const amount = parseFloat(e.amount) || 0;
    const pm = e.paymentMethod || 'Cash';
    if (!accountBalances[pm]) accountBalances[pm] = 0;

    if (e.type === 'income') {
      totalIncome += amount;
      accountBalances[pm] += amount;
    } else {
      totalExpense += amount;
      accountBalances[pm] -= amount;
    }
  });

  const net = totalIncome - totalExpense;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const fmt = (n) => `Rs ${parseFloat(n).toFixed(2)}`;
      const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN');

      // Header
      doc.fontSize(20).fillColor('#282828').text('Expense Tracker — Statement', { align: 'left' });
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#646464');
      doc.text(`Name: ${user.name || ''}`);
      doc.text(`Email: ${user.email || ''}`);
      doc.text(`Period: ${fmtDate(startDate)} - ${fmtDate(endDate)}`);
      doc.text(`Generated on: ${fmtDate(new Date())}`);
      doc.moveDown(1);

      // Summary section
      doc.fontSize(14).fillColor('#282828').text('Summary');
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#282828');
      doc.text(`Total Income: ${fmt(totalIncome)}`);
      doc.text(`Total Expense: ${fmt(totalExpense)}`);
      doc.text(`Net: ${fmt(net)}`);
      doc.moveDown(0.5);

      const pmKeys = Object.keys(accountBalances);
      if (pmKeys.length) {
        doc.fontSize(12).fillColor('#282828').text('Balance by Payment Method');
        doc.fontSize(10).fillColor('#464646');
        pmKeys.forEach((pm) => {
          doc.text(`${pm}: ${fmt(accountBalances[pm])}`);
        });
      }
      doc.moveDown(1);

      // Transaction table
      doc.fontSize(14).fillColor('#282828').text('Transactions');
      doc.moveDown(0.4);

      const colX = { date: 40, title: 110, category: 230, method: 335, type: 420, amount: 480 };
      const rowY0 = doc.y;

      doc.fontSize(9).fillColor('#282828');
      doc.text('Date', colX.date, rowY0, { width: 65 });
      doc.text('Title', colX.title, rowY0, { width: 115 });
      doc.text('Category', colX.category, rowY0, { width: 100 });
      doc.text('Method', colX.method, rowY0, { width: 80 });
      doc.text('Type', colX.type, rowY0, { width: 55 });
      doc.text('Amount', colX.amount, rowY0, { width: 75 });
      doc.moveDown(0.3);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#cccccc').stroke();
      doc.moveDown(0.2);

      if (!expenses.length) {
        doc.fontSize(10).fillColor('#646464').text('No transactions in this period.', 40, doc.y);
      }

      expenses.forEach((e) => {
        if (doc.y > 760) {
          doc.addPage();
        }
        const y = doc.y;
        const isIncome = e.type === 'income';

        doc.fontSize(9).fillColor('#282828');
        doc.text(fmtDate(e.date), colX.date, y, { width: 65 });
        doc.text(e.title || '', colX.title, y, { width: 115 });
        doc.text(e.category || '', colX.category, y, { width: 100 });
        doc.text(e.paymentMethod || 'Cash', colX.method, y, { width: 80 });
        doc.text(isIncome ? 'Income' : 'Expense', colX.type, y, { width: 55 });

        doc.fillColor(isIncome ? '#1a7f37' : '#c0392b');
        doc.text(fmt(e.amount), colX.amount, y, { width: 75 });

        doc.moveDown(0.5);
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generateStatementPdf };
