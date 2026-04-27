const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');

const CATEGORIES = [
  'Food & Dining',
  'Transportation',
  'Shopping',
  'Entertainment',
  'Healthcare',
  'Education',
  'Utilities',
  'Housing',
  'Travel',
  'Personal Care',
  'Other',
];

const PAYMENT_METHODS = ['Cash', 'GPay', 'PhonePe', 'Paytm', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Wallet', 'SBI', 'KVB', 'Other'];

const Expense = sequelize.define('Expense', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
  title: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      len: [2, 100],
    },
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0.01,
    },
  },
  type: {
    type: DataTypes.ENUM('expense', 'income'),
    allowNull: false,
    defaultValue: 'expense',
  },
  category: {
    type: DataTypes.ENUM(...CATEGORIES),
    allowNull: false,
  },
  paymentMethod: {
    type: DataTypes.ENUM(...PAYMENT_METHODS),
    allowNull: false,
    defaultValue: 'Cash',
  },
  date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  notes: {
    type: DataTypes.STRING(300),
    allowNull: true,
  },
}, {
  timestamps: true,
  indexes: [
    { fields: ['userId', 'date'] },
    { fields: ['userId', 'category'] },
  ]
});

User.hasMany(Expense, { foreignKey: 'userId', onDelete: 'CASCADE' });
Expense.belongsTo(User, { foreignKey: 'userId' });

module.exports = Expense;
module.exports.CATEGORIES = CATEGORIES;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
