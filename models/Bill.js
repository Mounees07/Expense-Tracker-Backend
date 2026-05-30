const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');

const Bill = sequelize.define('Bill', {
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
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    validate: { min: 0.01 },
  },
  dueDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  reminderStatus: {
    type: DataTypes.ENUM('pending', 'sent', 'paid', 'overdue'),
    allowNull: false,
    defaultValue: 'pending',
  },
  notes: {
    type: DataTypes.STRING(300),
    allowNull: true,
  },
}, {
  timestamps: true,
  indexes: [{ fields: ['userId', 'dueDate'] }],
});

User.hasMany(Bill, { foreignKey: 'userId', onDelete: 'CASCADE' });
Bill.belongsTo(User, { foreignKey: 'userId' });

module.exports = Bill;
