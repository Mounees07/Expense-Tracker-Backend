const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

const RecurringTransaction = sequelize.define('RecurringTransaction', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: User, key: 'id' },
  },
  title: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    validate: { min: 0.01 },
  },
  type: {
    type: DataTypes.ENUM('expense', 'income'),
    allowNull: false,
    defaultValue: 'expense',
  },
  category: {
    type: DataTypes.STRING(80),
    allowNull: false,
    defaultValue: 'Other',
  },
  account: {
    type: DataTypes.STRING(80),
    allowNull: false,
    defaultValue: 'Cash',
  },
  frequency: {
    type: DataTypes.ENUM(...FREQUENCIES),
    allowNull: false,
    defaultValue: 'monthly',
  },
  nextRunDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  endDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  timestamps: true,
  indexes: [{ fields: ['userId', 'isActive', 'nextRunDate'] }],
});

User.hasMany(RecurringTransaction, { foreignKey: 'userId', onDelete: 'CASCADE' });
RecurringTransaction.belongsTo(User, { foreignKey: 'userId' });

module.exports = RecurringTransaction;
module.exports.FREQUENCIES = FREQUENCIES;
