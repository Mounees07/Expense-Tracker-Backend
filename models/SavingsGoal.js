const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');

const SavingsGoal = sequelize.define('SavingsGoal', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: User, key: 'id' },
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: { len: [2, 100] },
  },
  targetAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    validate: { min: 0.01 },
  },
  savedAmount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },
  targetDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'completed', 'paused'),
    allowNull: false,
    defaultValue: 'active',
  },
}, {
  timestamps: true,
  indexes: [{ fields: ['userId', 'status'] }],
});

User.hasMany(SavingsGoal, { foreignKey: 'userId', onDelete: 'CASCADE' });
SavingsGoal.belongsTo(User, { foreignKey: 'userId' });

module.exports = SavingsGoal;
