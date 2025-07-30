// src/models/Auction.js

const mongoose = require('mongoose');

const auctionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Auction name is required'],
    trim: true,
    maxlength: [200, 'Auction name cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  startTime: {
    type: Date,
    required: [true, 'Start time is required']
  },
  endTime: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['upcoming', 'ongoing', 'paused', 'completed'],
    default: 'upcoming'
  },
  // Categories and flow
  categories: [{
    type: String,
    enum: ['GK', 'DEF', 'MID', 'ATT'],
    required: true
  }],
  categoryFlow: [{
    type: String,
    enum: ['GK', 'DEF', 'MID', 'ATT'],
    required: true
  }],
  currentCategoryIndex: {
    type: Number,
    default: 0
  },
  currentCategory: {
    type: String,
    enum: ['GK', 'DEF', 'MID', 'ATT', null],
    default: null
  },
  // Current player being auctioned
  currentPlayerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    default: null
  },
  currentPlayerIndex: {
    type: Number,
    default: 0
  },
  // Auction settings
  mode: {
    type: String,
    enum: ['auto', 'manual'],
    default: 'auto'
  },
  timerDuration: {
    type: Number,
    default: 60, // seconds
    min: [10, 'Timer duration must be at least 10 seconds'],
    max: [300, 'Timer duration cannot exceed 5 minutes']
  },
  timerStartedAt: {
    type: Date,
    default: null
  },
  timerEndsAt: {
    type: Date,
    default: null
  },
  // Break settings
  breakDuration: {
    type: Number,
    default: 30, // seconds
    min: [0, 'Break duration cannot be negative']
  },
  onBreak: {
    type: Boolean,
    default: false
  },
  breakStartedAt: {
    type: Date,
    default: null
  },
  breakEndsAt: {
    type: Date,
    default: null
  },
  // Statistics
  totalPlayers: {
    type: Number,
    default: 0
  },
  playersCompleted: {
    type: Number,
    default: 0
  },
  playersSold: {
    type: Number,
    default: 0
  },
  playersUnsold: {
    type: Number,
    default: 0
  },
  totalBids: {
    type: Number,
    default: 0
  },
  totalRevenue: {
    type: Number,
    default: 0
  },
  highestBid: {
    type: Number,
    default: 0
  },
  highestBidPlayer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    default: null
  },
  // Participants
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  activeParticipants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Admin controls
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  startedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  pausedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Pause/Resume state
  pauseState: {
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      default: null
    },
    categoryIndex: {
      type: Number,
      default: null
    },
    playerIndex: {
      type: Number,
      default: null
    },
    timerRemaining: {
      type: Number,
      default: null
    },
    pausedAt: {
      type: Date,
      default: null
    }
  },
  // Rules
  rules: {
    ruleTillEnabled: {
      type: Boolean,
      default: true
    },
    ruleTillValue: {
      type: Number,
      default: 20
    },
    restartTimerAfterFirstBid: {
      type: Boolean,
      default: true
    },
    restartTimerReduction: {
      type: Number,
      default: 5
    },
    allowSkipping: {
      type: Boolean,
      default: true
    },
    skipThreshold: {
      type: Number,
      default: 0.8 // 80% of participants
    }
  },
  // Additional metadata
  isPublic: {
    type: Boolean,
    default: true
  },
  maxParticipants: {
    type: Number,
    default: null
  }
}, {
  timestamps: true
});

// Indexes
auctionSchema.index({ status: 1 });
auctionSchema.index({ startTime: 1 });
auctionSchema.index({ createdBy: 1 });
auctionSchema.index({ participants: 1 });

// Virtual for progress percentage
auctionSchema.virtual('progressPercentage').get(function() {
  if (this.totalPlayers === 0) return 0;
  return Math.round((this.playersCompleted / this.totalPlayers) * 100);
});

// Virtual for current timer remaining
auctionSchema.virtual('timerRemaining').get(function() {
  if (!this.timerEndsAt || this.status !== 'ongoing') return 0;
  const now = new Date();
  const remaining = Math.max(0, Math.floor((this.timerEndsAt - now) / 1000));
  return remaining;
});

// Method to start auction
auctionSchema.methods.start = async function(adminId) {
  if (this.status !== 'upcoming') {
    throw new Error('Auction cannot be started');
  }
  
  this.status = 'ongoing';
  this.startedBy = adminId;
  this.currentCategoryIndex = 0;
  this.currentCategory = this.categoryFlow[0];
  
  return this.save();
};

// Method to pause auction
auctionSchema.methods.pause = async function(adminId) {
  if (this.status !== 'ongoing') {
    throw new Error('Only ongoing auctions can be paused');
  }
  
  // Save current state
  this.pauseState = {
    playerId: this.currentPlayerId,
    categoryIndex: this.currentCategoryIndex,
    playerIndex: this.currentPlayerIndex,
    timerRemaining: this.timerRemaining,
    pausedAt: new Date()
  };
  
  this.status = 'paused';
  this.pausedBy = adminId;
  this.timerStartedAt = null;
  this.timerEndsAt = null;
  
  return this.save();
};

// Method to resume auction
auctionSchema.methods.resume = async function(adminId) {
  if (this.status !== 'paused') {
    throw new Error('Only paused auctions can be resumed');
  }
  
  this.status = 'ongoing';
  this.startedBy = adminId;
  
  // Restore state if needed
  if (this.pauseState.timerRemaining > 0) {
    this.startTimer(this.pauseState.timerRemaining);
  }
  
  return this.save();
};

// Method to complete auction
auctionSchema.methods.complete = async function(adminId) {
  this.status = 'completed';
  this.completedBy = adminId;
  this.endTime = new Date();
  this.timerStartedAt = null;
  this.timerEndsAt = null;
  
  return this.save();
};

// Method to start timer
auctionSchema.methods.startTimer = function(duration = null) {
  const timerDuration = duration || this.timerDuration;
  this.timerStartedAt = new Date();
  this.timerEndsAt = new Date(Date.now() + (timerDuration * 1000));
  
  return this.save();
};

// Method to restart timer
auctionSchema.methods.restartTimer = function(reduction = 0) {
  const newDuration = Math.max(10, this.timerDuration - reduction);
  return this.startTimer(newDuration);
};

// Method to stop timer
auctionSchema.methods.stopTimer = function() {
  this.timerStartedAt = null;
  this.timerEndsAt = null;
  
  return this.save();
};

// Method to move to next player
auctionSchema.methods.moveToNextPlayer = async function() {
  const Player = require('./Player');
  
  const currentCategoryPlayers = await Player.find({
    category: this.currentCategory,
    status: 'available',
    isActive: true
  }).sort({ name: 1 });
  
  this.currentPlayerIndex += 1;
  
  if (this.currentPlayerIndex >= currentCategoryPlayers.length) {
    // Move to next category
    return this.moveToNextCategory();
  } else {
    // Set next player in current category
    this.currentPlayerId = currentCategoryPlayers[this.currentPlayerIndex]._id;
    return this.save();
  }
};

// Method to move to next category
auctionSchema.methods.moveToNextCategory = async function() {
  this.currentCategoryIndex += 1;
  this.currentPlayerIndex = 0;
  
  if (this.currentCategoryIndex >= this.categoryFlow.length) {
    // Auction completed
    return this.complete(this.startedBy);
  } else {
    // Set next category
    this.currentCategory = this.categoryFlow[this.currentCategoryIndex];
    
    const Player = require('./Player');
    const nextCategoryPlayers = await Player.find({
      category: this.currentCategory,
      status: 'available',
      isActive: true
    }).sort({ name: 1 });
    
    if (nextCategoryPlayers.length > 0) {
      this.currentPlayerId = nextCategoryPlayers[0]._id;
    }
    
    // Start break if configured
    if (this.breakDuration > 0) {
      this.onBreak = true;
      this.breakStartedAt = new Date();
      this.breakEndsAt = new Date(Date.now() + (this.breakDuration * 1000));
    }
    
    return this.save();
  }
};

// Method to add participant
auctionSchema.methods.addParticipant = async function(userId) {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
  }
  
  if (!this.activeParticipants.includes(userId)) {
    this.activeParticipants.push(userId);
  }
  
  return this.save();
};

// Method to remove participant
auctionSchema.methods.removeParticipant = async function(userId) {
  this.activeParticipants = this.activeParticipants.filter(id => !id.equals(userId));
  return this.save();
};

// Method to get current state
auctionSchema.methods.getCurrentState = async function() {
  await this.populate('currentPlayerId');
  
  return {
    auction: this,
    currentPlayer: this.currentPlayerId,
    timerRemaining: this.timerRemaining,
    progressPercentage: this.progressPercentage,
    onBreak: this.onBreak,
    breakRemaining: this.onBreak && this.breakEndsAt ? 
      Math.max(0, Math.floor((this.breakEndsAt - new Date()) / 1000)) : 0
  };
};

// Static methods
auctionSchema.statics.getActive = function() {
  return this.findOne({ status: { $in: ['ongoing', 'paused'] } });
};

auctionSchema.statics.getUpcoming = function() {
  return this.find({ status: 'upcoming' }).sort({ startTime: 1 });
};

auctionSchema.statics.getCompleted = function() {
  return this.find({ status: 'completed' }).sort({ endTime: -1 });
};

module.exports = mongoose.model('Auction', auctionSchema);