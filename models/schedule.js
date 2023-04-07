'use strict';
const {sequelize, DataTypes} = require('./sequelize-loader');

const Schedule = sequelize.define(
  'schedules',
  {
    scheduleId: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false
    },
    scheduleName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    memo: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    createBy: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    updateAt: {
      type: DataTypes.DATE,
      allowNull: false
    }
  },
  {
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        fields: ['createBy']
      }
    ]
  }
);

module.exports = Schedule;