// src/models/Achievement.js

import mongoose from 'mongoose';

// Defines achievements system for user engagement and gamification
const achievementSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  icon: {
    type: String,
    default: '🏆'
  },
  points: {
    type: Number,
    required: true,
    min: 0,
    max: 1000
  },
  category: {
    type: String,
    enum: ['bidding', 'winning', 'spending', 'participation', 'milestone', 'special'],
    required: true
  },
  condition: {
    type: {
      type: String,
      enum: ['first_bid', 'auction_win', 'bid_count', 'spend_amount', 'win_count', 'custom'],
      required: true
    },
    value: {
      type: Number,
      default: 1
    },
    operator: {
      type: String,
      enum: ['>=', '<=', '=', '>', '<'],
      default: '>='
    }
  },
  rarity: {
    type: String,
    enum: ['common', 'rare', 'epic', 'legendary'],
    default: 'common'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isRepeatable: {
    type: Boolean,
    default: false
  },
  maxCount: {
    type: Number,
    default: 1 // How many times this achievement can be earned
  },
  prerequisiteAchievements: [{
    type: String, // Achievement IDs that must be completed first
    ref: 'Achievement'
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for achievement difficulty
achievementSchema.virtual('difficulty').get(function() {
  const thresholds = { common: 50, rare: 100, epic: 200, legendary: 500 };
  if (this.points >= thresholds.legendary) return 'legendary';
  if (this.points >= thresholds.epic) return 'epic';
  if (this.points >= thresholds.rare) return 'rare';
  return 'common';
});

// Indexes
achievementSchema.index({ category: 1, isActive: 1 });
achievementSchema.index({ rarity: 1, points: -1 });

// Pre-save middleware to update updatedAt
achievementSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static: default achievements seed
achievementSchema.statics.getDefaultAchievements = function() {
  return [
    { id: 'first_blood', name: 'First Blood', description: 'Place your first bid in any auction', icon: '🩸', points: 10, category: 'bidding', condition: { type: 'first_bid', value: 1 }, rarity: 'common' },
    { id: 'auction_victor', name: 'Auction Victor', description: 'Win your first auction', icon: '👑', points: 20, category: 'winning', condition: { type: 'auction_win', value: 1 }, rarity: 'common' },
    { id: 'persistent_bidder', name: 'Persistent Bidder', description: 'Place 10 bids in total', icon: '⚡', points: 15, category: 'bidding', condition: { type: 'bid_count', value: 10 }, rarity: 'common' },
    { id: 'big_spender_i', name: 'Big Spender I', description: 'Spend 30M or more on a single player', icon: '💰', points: 25, category: 'spending', condition: { type: 'spend_amount', value: 30000000 }, rarity: 'rare' },
    { id: 'big_spender_ii', name: 'Big Spender II', description: 'Spend 40M or more on a single player', icon: '💎', points: 35, category: 'spending', condition: { type: 'spend_amount', value: 40000000 }, rarity: 'rare', prerequisiteAchievements: ['big_spender_i'] },
    { id: 'big_spender_iii', name: 'Big Spender III', description: 'Spend 50M or more on a single player', icon: '🏆', points: 50, category: 'spending', condition: { type: 'spend_amount', value: 50000000 }, rarity: 'epic', prerequisiteAchievements: ['big_spender_ii'] },
    { id: 'decathlon_champion', name: 'Decathlon Champion', description: 'Win 10 auctions', icon: '🏅', points: 75, category: 'winning', condition: { type: 'win_count', value: 10 }, rarity: 'epic' },
    { id: 'bidding_machine', name: 'Bidding Machine', description: 'Place 100 bids in total', icon: '🤖', points: 40, category: 'bidding', condition: { type: 'bid_count', value: 100 }, rarity: 'rare' },
    { id: 'auction_legend', name: 'Auction Legend', description: 'Win 25 auctions', icon: '⭐', points: 150, category: 'winning', condition: { type: 'win_count', value: 25 }, rarity: 'legendary' },
    { id: 'millionaire_club', name: 'Millionaire Club', description: 'Spend 100M in total across all auctions', icon: '🏛️', points: 100, category: 'spending', condition: { type: 'spend_amount', value: 100000000 }, rarity: 'legendary' }
  ];
};

// Instance method: check if user qualifies
achievementSchema.methods.checkUserQualifies = function(userStats) {
  const cond = this.condition;
  const val = userStats[cond.type] || 0;
  switch (cond.operator) {
    case '>=': return val >= cond.value;
    case '<=': return val <= cond.value;
    case '=':  return val === cond.value;
    case '>':  return val > cond.value;
    case '<':  return val < cond.value;
    default:   return false;
  }
};

export default mongoose.model('Achievement', achievementSchema);