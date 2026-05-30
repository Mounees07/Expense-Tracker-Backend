const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');

const Budget = sequelize.define('Budget', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: User, key: 'id' },
  },
  name: {
    type: DataTypes.STRING(80),
    allowNull: false,
    defaultValue: 'Monthly Budget',
  },
  category: {
    type: DataTypes.STRING(80),
    allowNull: false,
    defaultValue: 'All',
  },
  month: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1, max: 12 },
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    validate: { min: 0.01 },
  },
  alertThreshold: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 80,
    validate: { min: 1, max: 100 },
  },
}, {
  timestamps: true,
  indexes: [{ fields: ['userId', 'month', 'year'] }],
});

User.hasMany(Budget, { foreignKey: 'userId', onDelete: 'CASCADE' });
Budget.belongsTo(User, { foreignKey: 'userId' });

module.exports = Budget;
