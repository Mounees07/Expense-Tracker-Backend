const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');

const ACCOUNT_TYPES = ['bank', 'wallet', 'cash', 'upi'];

const Account = sequelize.define('Account', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: User, key: 'id' },
  },
  name: {
    type: DataTypes.STRING(80),
    allowNull: false,
    validate: { len: [2, 80] },
  },
  type: {
    type: DataTypes.ENUM(...ACCOUNT_TYPES),
    allowNull: false,
    defaultValue: 'bank',
  },
  openingBalance: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },
  currentBalance: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },
  color: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: '#6366f1',
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  timestamps: true,
  indexes: [{ fields: ['userId', 'type'] }],
});

User.hasMany(Account, { foreignKey: 'userId', onDelete: 'CASCADE' });
Account.belongsTo(User, { foreignKey: 'userId' });

module.exports = Account;
module.exports.ACCOUNT_TYPES = ACCOUNT_TYPES;
