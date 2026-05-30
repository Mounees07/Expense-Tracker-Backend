import React, { useState, useEffect, useCallback } from 'react';
import { useExpenses } from '../context/ExpenseContext';
import ExpenseModal from './ExpenseModal';
import BalanceModal from './BalanceModal';
import {
  FiPlus, FiSearch, FiEdit2, FiTrash2, FiChevronLeft, FiChevronRight, FiFilter,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

const CATEGORIES = [
  'All', 'Food & Dining', 'Transportation', 'Shopping', 'Entertainment',
  'Healthcare', 'Education', 'Utilities', 'Housing', 'Travel', 'Personal Care', 'Other',
];

const categoryClass = {
  'Food & Dining': 'cat-food', Transportation: 'cat-transport', Shopping: 'cat-shopping',
  Entertainment: 'cat-entertainment', Healthcare: 'cat-healthcare', Education: 'cat-education',
  Utilities: 'cat-utilities', Housing: 'cat-housing', Travel: 'cat-travel',
  'Personal Care': 'cat-personal', Other: 'cat-other',
};

const formatAmount = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const createMonthOptions = () => {
  const formatter = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });
  const now = new Date();

  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    return {
      label: formatter.format(date),
      value: `${year}-${month}`,
      month,
      year,
    };
  });
};

const MONTH_OPTIONS = createMonthOptions();

const ExpenseTable = () => {
  const { expenses, pagination, loading, filters, setFilters, fetchExpenses, deleteExpense } = useExpenses();
  const [modalOpen, setModalOpen] = useState(false);
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [editExpense, setEditExpense] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const doFetch = useCallback((params = {}) => {
    fetchExpenses({ page: currentPage, ...params });
  }, [fetchExpenses, currentPage]);

  useEffect(() => {
    doFetch();
  }, [filters, currentPage]); // eslint-disable-line

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput }));
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput, setFilters]);

  const handleCategoryFilter = (cat) => {
    setFilters((f) => ({ ...f, category: cat }));
    setCurrentPage(1);
  };

  const handleMonthFilter = (value) => {
    const selected = MONTH_OPTIONS.find((option) => option.value === value);
    if (!selected) return;

    setFilters((f) => ({ ...f, month: selected.month, year: selected.year }));
    setCurrentPage(1);
  };

  const handleDelete = async (id) => {
    try {
      await deleteExpense(id);
      doFetch();
    } catch {
      toast.error('Failed to delete expense');
    }
    setDeleteConfirm(null);
  };

  const handleEdit = (expense) => {
    setEditExpense(expense);
    setModalOpen(true);
  };

  const handleAddNew = () => {
    setEditExpense(null);
    setModalOpen(true);
  };

  const onSuccess = () => { doFetch({ page: 1 }); setCurrentPage(1); };

  const pages = Array.from({ length: pagination.pages }, (_, i) => i + 1);
  const selectedMonthValue = `${filters.year}-${filters.month}`;
  const selectedMonthLabel = MONTH_OPTIONS.find((option) => option.value === selectedMonthValue)?.label || 'Selected month';

  return (
    <div>
      {/* Filters Bar */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="filters-bar" style={{ marginBottom: 0, display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div className="search-input-wrapper" style={{ flex: '1 1 250px' }}>
            <FiSearch className="search-icon" />
            <input
              id="expense-search"
              className="form-control search-input"
              placeholder="Search expenses..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end', alignItems: 'center' }}>
            {/* Category Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-input)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border-input)', transition: 'all var(--transition-fast)' }}>
              <FiFilter size={14} color="var(--text-muted)" />
              <select
                id="category-filter"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px' }}
                value={filters.category}
                onChange={(e) => handleCategoryFilter(e.target.value)}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} style={{ background: 'var(--bg-card)' }}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Month/Year filter */}
            <select
              id="month-filter"
              className="form-control"
              style={{ width: 'auto', minWidth: '150px', cursor: 'pointer', fontSize: '13px' }}
              value={selectedMonthValue}
              onChange={(e) => handleMonthFilter(e.target.value)}
            >
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            <button id="set-balance-btn" className="btn btn-secondary" onClick={() => setBalanceModalOpen(true)} style={{ padding: '10px 20px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}>
              🏦 Set Balances
            </button>
            <button id="add-expense-btn" className="btn btn-primary" onClick={handleAddNew} style={{ padding: '10px 20px' }}>
              <FiPlus size={16} />
              Add Transaction
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">All Expenses</h3>
            <p className="card-subtitle">{selectedMonthLabel} - {pagination.total} record{pagination.total !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {loading ? (
          <div className="loading-overlay">
            <div className="spinner" />
            <p>Loading expenses...</p>
          </div>
        ) : expenses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💸</div>
            <h3>No expenses found</h3>
            <p>Start tracking your spending by adding your first expense.</p>
            <button className="btn btn-primary" onClick={handleAddNew}>
              <FiPlus size={16} />
              Add First Expense
            </button>
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Payment</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((exp, idx) => (
                    <tr key={exp._id} className="fade-in">
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {(currentPage - 1) * pagination.limit + idx + 1}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{exp.title}</span>
                      </td>
                      <td>
                        <span className={`badge category-badge ${categoryClass[exp.category] || 'cat-other'}`}>
                          {exp.category}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{exp.paymentMethod || 'Cash'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{formatDate(exp.date)}</td>
                      <td>
                        <span 
                          className="amount-text" 
                          style={{ 
                            fontSize: 14, 
                            color: exp.type === 'income' ? '#10b981' : 'var(--text-primary)',
                            fontWeight: exp.type === 'income' ? 700 : 500
                          }}
                        >
                          {exp.type === 'income' ? '+' : '-'}{formatAmount(exp.amount)}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {exp.notes || '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            id={`edit-btn-${exp._id}`}
                            className="btn btn-secondary btn-icon btn-sm"
                            onClick={() => handleEdit(exp)}
                            title="Edit"
                          >
                            <FiEdit2 size={13} />
                          </button>
                          <button
                            id={`delete-btn-${exp._id}`}
                            className="btn btn-danger btn-icon btn-sm"
                            onClick={() => setDeleteConfirm(exp._id)}
                            title="Delete"
                          >
                            <FiTrash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="pagination">
                <button
                  className="page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  <FiChevronLeft />
                </button>
                {pages.map((p) => (
                  <button
                    key={p}
                    className={`page-btn ${p === currentPage ? 'active' : ''}`}
                    onClick={() => setCurrentPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  className="page-btn"
                  disabled={currentPage === pagination.pages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  <FiChevronRight />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      <ExpenseModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditExpense(null); }}
        editExpense={editExpense}
        onSuccess={onSuccess}
      />

      {/* Set Balances Modal */}
      <BalanceModal
        isOpen={balanceModalOpen}
        onClose={() => setBalanceModalOpen(false)}
        onSuccess={onSuccess}
      />

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal slide-up" style={{ maxWidth: 380 }}>
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🗑️</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Delete Expense?</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
                This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setDeleteConfirm(null)}>
                  Cancel
                </button>
                <button
                  id="confirm-delete-btn"
                  className="btn btn-danger"
                  style={{ flex: 1, background: 'var(--danger)', color: 'white' }}
                  onClick={() => handleDelete(deleteConfirm)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseTable;
