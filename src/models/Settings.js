// src/models/Settings.js

const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  // Auction Settings
  auctionTimer: {
    type: Number,
    default: 60,
    min: [10, 'Auction timer must be at least 10 seconds'],
    max: [300, 'Auction timer cannot exceed 5 minutes']
  },
  breakTimer: {
    type: Number,
    default: 30,
    min: [0, 'Break timer cannot be negative'],
    max: [300, 'Break timer cannot exceed 5 minutes']
  },
  
  // Budget Settings
  baseBudget: {
    type: Number,
    default: 200000000, // 200M
    min: [1, 'Base budget must be at least 1']
  },
  
  // Base Value Options
  baseValueOptions: [{
    type: Number,
    min: [1, 'Base value must be at least 1']
  }],
  
  // Player Categories
  playerCategories: [{
    code: {
      type: String,
      required: true,
      uppercase: true
    },
    name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ''
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  // Bidding Rules
  ruleTillEnabled: {
    type: Boolean,
    default: true
  },
  ruleTillValue: {
    type: Number,
    default: 20,
    min: [1, 'Rule till value must be at least 1']
  },
  restartTimerAfterFirstBid: {
    type: Boolean,
    default: true
  },
  restartTimerReduction: {
    type: Number,
    default: 5,
    min: [0, 'Timer reduction cannot be negative'],
    max: [30, 'Timer reduction cannot exceed 30 seconds']
  },
  
  // Skip Feature Settings
  allowSkipping: {
    type: Boolean,
    default: true
  },
  skipThreshold: {
    type: Number,
    default: 0.8, // 80% of participants
    min: [0.1, 'Skip threshold must be at least 10%'],
    max: [1.0, 'Skip threshold cannot exceed 100%']
  },
  
  // Quick Bid Settings
  quickBidIncrements: [{
    type: Number,
    min: [1, 'Quick bid increment must be at least 1']
  }],
  
  // Achievement Settings
  achievements: [{
    id: {
      type: String,
      required: true,
      unique: true
    },
    name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    points: {
      type: Number,
      required: true,
      min: [0, 'Achievement points cannot be negative']
    },
    criteria: {
      type: {
        type: String,
        enum: ['first_bid', 'auction_win', 'per_bid', 'auction_wins', 'high_bid', 'total_spent'],
        required: true
      },
      count: {
        type: Number,
        default: 1
      },
      amount: {
        type: Number,
        default: null
      }
    },
    icon: {
      type: String,
      default: 'trophy'
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  // Notification Settings
  notifications: {
    auctionStart: {
      enabled: {
        type: Boolean,
        default: true
      },
      title: {
        type: String,
        default: 'Auction Started!'
      },
      message: {
        type: String,
        default: 'A new auction has started. Join now!'
      }
    },
    playerSold: {
      enabled: {
        type: Boolean,
        default: true
      },
      title: {
        type: String,
        default: 'Player Sold!'
      },
      message: {
        type: String,
        default: '{playerName} sold to {managerName} for ₹{amount}'
      }
    },
    achievementUnlocked: {
      enabled: {
        type: Boolean,
        default: true
      },
      title: {
        type: String,
        default: 'Achievement Unlocked!'
      },
      message: {
        type: String,
        default: 'You earned "{achievementName}" and gained {points} points!'
      }
    }
  },
  
  // Security Settings
  maxLoginAttempts: {
    type: Number,
    default: 5,
    min: [1, 'Max login attempts must be at least 1']
  },
  lockoutDuration: {
    type: Number,
    default: 900, // 15 minutes in seconds
    min: [60, 'Lockout duration must be at least 1 minute']
  },
  
  // File Upload Settings
  maxFileSize: {
    type: Number,
    default: 10485760, // 10MB in bytes
    min: [1024, 'Max file size must be at least 1KB']
  },
  maxAvatarSize: {
    type: Number,
    default: 5242880, // 5MB in bytes
    min: [1024, 'Max avatar size must be at least 1KB']
  },
  allowedImageTypes: [{
    type: String,
    default: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
  }],
  
  // Rate Limiting
  rateLimiting: {
    enabled: {
      type: Boolean,
      default: true
    },
    windowMs: {
      type: Number,
      default: 900000, // 15 minutes
      min: [60000, 'Rate limit window must be at least 1 minute']
    },
    maxRequests: {
      type: Number,
      default: 100,
      min: [1, 'Max requests must be at least 1']
    },
    bidWindowMs: {
      type: Number,
      default: 60000, // 1 minute
      min: [1000, 'Bid rate limit window must be at least 1 second']
    },
    maxBidsPerWindow: {
      type: Number,
      default: 30,
      min: [1, 'Max bids per window must be at least 1']
    }
  },
  
  // Contact Information
  adminContact: {
    name: {
      type: String,
      default: 'Admin'
    },
    phone: {
      type: String,
      default: ''
    },
    email: {
      type: String,
      default: ''
    }
  },
  
  // Application Metadata
  appVersion: {
    type: String,
    default: '1.0.0'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
settingsSchema.index({}, { unique: true });

// Pre-save middleware to update lastUpdated
settingsSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Static method to get settings (singleton pattern)
settingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  
  if (!settings) {
    // Create default settings if none exist
    settings = await this.create({});
  }
  
  return settings;
};

// Static method to update settings
settingsSchema.statics.updateSettings = async function(updates, updatedBy = null) {
  let settings = await this.getSettings();
  
  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined) {
      settings[key] = updates[key];
    }
  });
  
  if (updatedBy) {
    settings.updatedBy = updatedBy;
  }
  
  return settings.save();
};

// Method to add achievement
settingsSchema.methods.addAchievement = function(achievement) {
  const existingIndex = this.achievements.findIndex(a => a.id === achievement.id);
  
  if (existingIndex >= 0) {
    this.achievements[existingIndex] = achievement;
  } else {
    this.achievements.push(achievement);
  }
  
  return this.save();
};

// Method to remove achievement
settingsSchema.methods.removeAchievement = function(achievementId) {
  this.achievements = this.achievements.filter(a => a.id !== achievementId);
  return this.save();
};

// Method to add player category
settingsSchema.methods.addPlayerCategory = function(category) {
  const existingIndex = this.playerCategories.findIndex(c => c.code === category.code);
  
  if (existingIndex >= 0) {
    this.playerCategories[existingIndex] = category;
  } else {
    this.playerCategories.push(category);
  }
  
  return this.save();
};

// Method to remove player category
settingsSchema.methods.removePlayerCategory = function(categoryCode) {
  this.playerCategories = this.playerCategories.filter(c => c.code !== categoryCode);
  return this.save();
};

// Method to get active achievements
settingsSchema.methods.getActiveAchievements = function() {
  return this.achievements.filter(a => a.isActive);
};

// Method to get active player categories
settingsSchema.methods.getActivePlayerCategories = function() {
  return this.playerCategories.filter(c => c.isActive);
};

// Default data initialization
settingsSchema.statics.initializeDefaults = async function() {
  const settings = await this.getSettings();
  
  // Initialize default achievements if empty
  if (settings.achievements.length === 0) {
    const defaultAchievements = [
      {
        id: 'first_blood',
        name: 'First Blood',
        description: 'Place your first bid in any auction',
        points: 10,
        criteria: { type: 'first_bid' },
        icon: 'star'
      },
      {
        id: 'auction_victor',
        name: 'Auction Victor',
        description: 'Win your first auction',
        points: 20,
        criteria: { type: 'auction_win' }
      },
      {
        id: 'persistent_bidder',
        name: 'Persistent Bidder',
        description: 'Earn 1 point for each bid placed',
        points: 1,
        criteria: { type: 'per_bid' }
      },
      {
        id: 'decathlon_champion',
        name: 'Decathlon Champion',
        description: 'Win 10 auctions',
        points: 100,
        criteria: { type: 'auction_wins', count: 10 }
      },
      {
        id: 'big_spender_i',
        name: 'Big Spender I',
        description: 'Spend 30M or more on a single player',
        points: 30,
        criteria: { type: 'high_bid', amount: 30000000 }
      },
      {
        id: 'big_spender_ii',
        name: 'Big Spender II',
        description: 'Spend 40M or more on a single player',
        points: 40,
        criteria: { type: 'high_bid', amount: 40000000 }
      },
      {
        id: 'big_spender_iii',
        name: 'Big Spender III',
        description: 'Spend 50M or more on a single player',
        points: 50,
        criteria: { type: 'high_bid', amount: 50000000 }
      }
    ];
    
    settings.achievements = defaultAchievements;
  }
  
  // Initialize default player categories if empty
  if (settings.playerCategories.length === 0) {
    const defaultCategories = [
      { code: 'GK', name: 'Goalkeeper', description: 'Goalkeepers' },
      { code: 'DEF', name: 'Defender', description: 'Defenders' },
      { code: 'MID', name: 'Midfielder', description: 'Midfielders' },
      { code: 'ATT', name: 'Attacker', description: 'Attackers' },
      { code: 'UNSOLD', name: 'Unsold', description: 'Unsold players', isActive: false }
    ];
    
    settings.playerCategories = defaultCategories;
  }
  
  // Initialize default base values if empty
  if (settings.baseValueOptions.length === 0) {
    settings.baseValueOptions = [1000000, 2000000, 3000000, 5000000, 8000000, 10000000, 15000000, 20000000];
  }
  
  // Initialize default quick bid increments if empty
  if (settings.quickBidIncrements.length === 0) {
    settings.quickBidIncrements = [1000000, 2000000, 5000000, 10000000];
  }
  
  return settings.save();
};

module.exports = mongoose.model('Settings', settingsSchema);