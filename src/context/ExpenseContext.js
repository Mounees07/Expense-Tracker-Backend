import React, { createContext, useContext, useState, useCallback } from 'react';
import { expenseService } from '../services/api';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ExpenseContext = createContext(null);

const getCurrentMonthFilters = () => {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
};

export const ExpenseProvider = ({ children }) => {
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({ totalAmount: 0, categoryBreakdown: {}, monthlyData: [], totalCount: 0 });
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit: 10 });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ category: 'All', search: '', ...getCurrentMonthFilters() });

  const fetchExpenses = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const mergedParams = { ...filters, ...params };
      // Clean params
      if (mergedParams.category === 'All') delete mergedParams.category;
      if (!mergedParams.search) delete mergedParams.search;
      if (!mergedParams.month) delete mergedParams.month;

      const res = await expenseService.getAll(mergedParams);
      setExpenses(res.data.data);
      setSummary(res.data.summary);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const addExpense = useCallback(async (data) => {
    const res = await expenseService.create(data);
    toast.success('Expense added successfully!');
    return res.data;
  }, []);

  const updateExpense = useCallback(async (id, data) => {
    const res = await expenseService.update(id, data);
    toast.success('Expense updated successfully!');
    return res.data;
  }, []);

  const deleteExpense = useCallback(async (id) => {
    await expenseService.delete(id);
    toast.success('Expense deleted');
  }, []);

  const exportCSV = useCallback(async () => {
    try {
      const mergedParams = { ...filters };
      if (mergedParams.category === 'All') delete mergedParams.category;
      if (!mergedParams.search) delete mergedParams.search;
      if (!mergedParams.month) delete mergedParams.month;

      const res = await expenseService.exportCSV(mergedParams);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `expenses_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('CSV Exported successfully!');
    } catch {
      toast.error('CSV Export failed');
    }
  }, [filters]);

  const exportPDF = useCallback(async () => {
    try {
      const mergedParams = { ...filters, limit: 100000, page: 1 };
      if (mergedParams.category === 'All') delete mergedParams.category;
      if (!mergedParams.search) delete mergedParams.search;
      if (!mergedParams.month) delete mergedParams.month;

      const res = await expenseService.getAll(mergedParams);
      const data = res.data.data;

      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.setTextColor(40, 40, 40);
      doc.text('Expense & Income Report', 14, 22);
      
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 14, 30);

      // Summary Section
      const { totalBalance = 0, accountBalances = {} } = summary;
      const sbi = (accountBalances?.['SBI'] || 0);
      const kvb = (accountBalances?.['KVB'] || 0);
      const wallet = (accountBalances?.['GPay'] || 0) + (accountBalances?.['Wallet'] || 0) + (accountBalances?.['PhonePe'] || 0) + (accountBalances?.['Paytm'] || 0);
      const cash = (accountBalances?.['Cash'] || 0);

      autoTable(doc, {
        body: [
          ['Total Balance', `Rs ${parseFloat(totalBalance).toFixed(2)}`],
          ['SBI Balance', `Rs ${parseFloat(sbi).toFixed(2)}`],
          ['KVB Balance', `Rs ${parseFloat(kvb).toFixed(2)}`],
          ['GPay & Wallet', `Rs ${parseFloat(wallet).toFixed(2)}`],
          ['Cash in Hand', `Rs ${parseFloat(cash).toFixed(2)}`]
        ],
        startY: 35,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 35, fontStyle: 'bold', textColor: [100, 100, 100] },
          1: { cellWidth: 40, fontStyle: 'bold', textColor: [40, 40, 40] }
        }
      });

      const tableColumn = ["Date", "Title", "Category", "Payment Method", "Type", "Amount"];
      const tableRows = [];

      data.forEach(exp => {
        const row = [
          new Date(exp.date).toLocaleDateString('en-IN'),
          exp.title,
          exp.category,
          exp.paymentMethod || 'Cash',
          exp.type === 'income' ? 'Income' : 'Expense',
          `Rs ${parseFloat(exp.amount).toFixed(2)}`
        ];
        tableRows.push(row);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 75,
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 4 },
        headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255] },
        columnStyles: {
          5: { halign: 'right', textColor: [40, 40, 40], fontStyle: 'bold' }
        },
        didParseCell: function(data) {
          if (data.section === 'body' && data.column.index === 4) {
            if (data.cell.raw === 'Income') {
              data.cell.styles.textColor = [16, 185, 129];
            } else {
              data.cell.styles.textColor = [239, 68, 68];
            }
          }
        }
      });

      doc.save(`financial_report_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF Exported successfully!');
    } catch (err) {
      console.error(err);
      toast.error('PDF Export failed');
    }
  }, [filters]);

  return (
    <ExpenseContext.Provider value={{
      expenses, summary, pagination, loading, filters,
      setFilters, fetchExpenses, addExpense, updateExpense, deleteExpense, exportCSV, exportPDF
    }}>
      {children}
    </ExpenseContext.Provider>
  );
};

export const useExpenses = () => {
  const ctx = useContext(ExpenseContext);
  if (!ctx) throw new Error('useExpenses must be used within ExpenseProvider');
  return ctx;
};
