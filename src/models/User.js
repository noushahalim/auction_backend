// src/models/User.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    lowercase: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [50, 'Username cannot exceed 50 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
    index: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  role: {
    type: String,
    enum: ['manager', 'admin'],
    default: 'manager'
  },
  balance: {
    type: Number,
    default: process.env.BASE_BUDGET || 200000000,
    min: [0, 'Balance cannot be negative']
  },
  teamName: {
    type: String,
    trim: true,
    maxlength: [100, 'Team name cannot exceed 100 characters']
  },
  avatarUrl: {
    type: String,
    default: null
  },
  points: {
    type: Number,
    default: 0,
    min: [0, 'Points cannot be negative']
  },
  achievements: [{
    id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    achievedAt: {
      type: Date,
      default: Date.now
    },
    points: {
      type: Number,
      default: 0
    }
  }],
  // Statistics
  bidCount: {
    type: Number,
    default: 0
  },
  auctionsWon: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  },
  highestBid: {
    type: Number,
    default: 0
  },
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  // Notifications
  notificationSettings: {
    auctionStart: { type: Boolean, default: true },
    bidUpdates: { type: Boolean, default: true },
    achievements: { type: Boolean, default: true },
    broadcasts: { type: Boolean, default: true }
  }
}, {
  timestamps: true,
  toJSON: { 
    transform: function(doc, ret) {
      delete ret.password;
      return ret;
    }
  }
});

// Indexes
userSchema.index({ username: 1 });
userSchema.index({ role: 1 });
userSchema.index({ points: -1 });
userSchema.index({ auctionsWon: -1 });
userSchema.index({ isActive: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Update balance method
userSchema.methods.updateBalance = async function(amount, operation = 'subtract') {
  if (operation === 'subtract') {
    if (this.balance < amount) {
      throw new Error('Insufficient balance');
    }
    this.balance -= amount;
    this.totalSpent += amount;
  } else if (operation === 'add') {
    this.balance += amount;
  }
  
  return this.save();
};

// Add achievement method
userSchema.methods.addAchievement = async function(achievementData) {
  const existingAchievement = this.achievements.find(a => a.id === achievementData.id);
  
  if (!existingAchievement) {
    this.achievements.push(achievementData);
    this.points += achievementData.points || 0;
    return this.save();
  }
  
  return this;
};

// Increment bid count
userSchema.methods.incrementBidCount = async function() {
  this.bidCount += 1;
  return this.save();
};

// Increment auctions won
userSchema.methods.incrementAuctionsWon = async function() {
  this.auctionsWon += 1;
  return this.save();
};

// Get user statistics
userSchema.methods.getStatistics = async function() {
  const Player = require('./Player');
  
  const players = await Player.find({ soldTo: this._id, status: 'sold' });
  const playersByCategory = players.reduce((acc, player) => {
    acc[player.category] = (acc[player.category] || 0) + 1;
    return acc;
  }, {});
  
  return {
    totalPlayers: players.length,
    totalSpent: this.totalSpent,
    remainingBalance: this.balance,
    bidCount: this.bidCount,
    auctionsWon: this.auctionsWon,
    points: this.points,
    achievementsCount: this.achievements.length,
    playersByCategory,
    highestBid: this.highestBid,
    averageSpentPerPlayer: players.length > 0 ? this.totalSpent / players.length : 0
  };
};

// Static methods
userSchema.statics.findActiveManagers = function() {
  return this.find({ role: 'manager', isActive: true });
};

userSchema.statics.getLeaderboard = function(sortBy = 'points', limit = 10) {
  const sortOptions = {};
  sortOptions[sortBy] = -1;
  
  return this.find({ role: 'manager', isActive: true })
    .select('name username teamName points auctionsWon totalSpent avatarUrl')
    .sort(sortOptions)
    .limit(limit);
};

module.exports = mongoose.model('User', userSchema);