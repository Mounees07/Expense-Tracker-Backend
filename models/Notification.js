const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');

const Notification = sequelize.define('Notification', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: User, key: 'id' },
  },
  type: {
    type: DataTypes.ENUM('budget', 'goal', 'bill', 'summary', 'system'),
    allowNull: false,
    defaultValue: 'system',
  },
  title: {
    type: DataTypes.STRING(120),
    allowNull: false,
  },
  message: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  timestamps: true,
  indexes: [{ fields: ['userId', 'isRead'] }],
});

User.hasMany(Notification, { foreignKey: 'userId', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'userId' });

module.exports = Notification;
