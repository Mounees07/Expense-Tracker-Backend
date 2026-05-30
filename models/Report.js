const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');

const Report = sequelize.define('Report', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: User, key: 'id' },
  },
  type: {
    type: DataTypes.ENUM('monthly', 'yearly', 'category', 'income', 'savings'),
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(140),
    allowNull: false,
  },
  periodStart: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  periodEnd: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  format: {
    type: DataTypes.ENUM('pdf', 'csv', 'excel'),
    allowNull: false,
    defaultValue: 'pdf',
  },
  fileUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
}, {
  timestamps: true,
  indexes: [{ fields: ['userId', 'type'] }],
});

User.hasMany(Report, { foreignKey: 'userId', onDelete: 'CASCADE' });
Report.belongsTo(User, { foreignKey: 'userId' });

module.exports = Report;
