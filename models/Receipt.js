const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');

const Receipt = sequelize.define('Receipt', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: User, key: 'id' },
  },
  transactionId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  fileName: {
    type: DataTypes.STRING(160),
    allowNull: false,
  },
  fileUrl: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  fileType: {
    type: DataTypes.ENUM('image', 'pdf'),
    allowNull: false,
  },
}, {
  timestamps: true,
  indexes: [{ fields: ['userId', 'transactionId'] }],
});

User.hasMany(Receipt, { foreignKey: 'userId', onDelete: 'CASCADE' });
Receipt.belongsTo(User, { foreignKey: 'userId' });

module.exports = Receipt;
