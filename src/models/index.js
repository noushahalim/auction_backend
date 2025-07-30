// src/models/index.js

const User = require('./User');
const Player = require('./Player');
const Auction = require('./Auction');
const Bid = require('./Bid');
const Request = require('./Request');
const Settings = require('./Settings');
const Broadcast = require('./Broadcast');

module.exports = {
  User,
  Player,
  Auction,
  Bid,
  Request,
  Settings,
  Broadcast
};