// src/models/Settings.js
import mongoose from 'mongoose';

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
      enabled: { type: Boolean, default: true },
      title:    { type: String,  default: 'Auction Started!' },
      message:  { type: String,  default: 'A new auction has started. Join now!' }
    },
    playerSold: {
      enabled: { type: Boolean, default: true },
      title:    { type: String,  default: 'Player Sold!' },
      message:  { type: String,  default: '{playerName} sold to {managerName} for ₹{amount}' }
    },
    achievementUnlocked: {
      enabled: { type: Boolean, default: true },
      title:    { type: String,  default: 'Achievement Unlocked!' },
      message:  { type: String,  default: 'You earned "{achievementName}" and gained {points} points!' }
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
    default: 900, // 15 minutes
    min: [60, 'Lockout duration must be at least 1 minute']
  },

  // File Upload Settings
  maxFileSize: {
    type: Number,
    default: 10485760, // 10MB
    min: [1024, 'Max file size must be at least 1KB']
  },
  maxAvatarSize: {
    type: Number,
    default: 5242880, // 5MB
    min: [1024, 'Max avatar size must be at least 1KB']
  },
  allowedImageTypes: [{
    type: String,
    default: ['image/jpeg','image/jpg','image/png','image/gif','image/webp']
  }],

  // Rate Limiting
  rateLimiting: {
    enabled:        { type: Boolean, default: true },
    windowMs:       { type: Number,  default: 900000, min: [60000,'Rate limit window must be ≥1m'] },
    maxRequests:    { type: Number,  default: 100,    min: [1,'Max requests must be ≥1'] },
    bidWindowMs:    { type: Number,  default: 60000,  min: [1000,'Bid window must be ≥1s'] },
    maxBidsPerWindow: { type: Number, default: 30,    min: [1,'Max bids must be ≥1'] }
  },

  // Contact Information
  adminContact: {
    name:  { type: String, default: 'Admin' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' }
  },

  // Application Metadata
  appVersion:  { type: String, default: '1.0.0' },
  lastUpdated: { type: Date,   default: Date.now },
  updatedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
  timestamps: true
});

// Ensure singleton
settingsSchema.index({}, { unique: true });

// Update lastUpdated on save
settingsSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Get or create the single settings document
settingsSchema.statics.getSettings = async function() {
  let s = await this.findOne();
  if (!s) s = await this.create({});
  return s;
};

// Update settings
settingsSchema.statics.updateSettings = async function(updates, updatedBy = null) {
  const s = await this.getSettings();
  Object.assign(s, updates);
  if (updatedBy) s.updatedBy = updatedBy;
  return s.save();
};

// Add / remove achievements
settingsSchema.methods.addAchievement = function(a) {
  const idx = this.achievements.findIndex(x=>x.id===a.id);
  if (idx>=0) this.achievements[idx] = a;
  else this.achievements.push(a);
  return this.save();
};
settingsSchema.methods.removeAchievement = function(id) {
  this.achievements = this.achievements.filter(x=>x.id!==id);
  return this.save();
};

// Add / remove player categories
settingsSchema.methods.addPlayerCategory = function(c) {
  const idx = this.playerCategories.findIndex(x=>x.code===c.code);
  if (idx>=0) this.playerCategories[idx] = c;
  else this.playerCategories.push(c);
  return this.save();
};
settingsSchema.methods.removePlayerCategory = function(code) {
  this.playerCategories = this.playerCategories.filter(x=>x.code!==code);
  return this.save();
};

// Get active lists
settingsSchema.methods.getActiveAchievements = function() {
  return this.achievements.filter(x=>x.isActive);
};
settingsSchema.methods.getActivePlayerCategories = function() {
  return this.playerCategories.filter(x=>x.isActive);
};

// Initialize defaults if empty
settingsSchema.statics.initializeDefaults = async function() {
  const s = await this.getSettings();
  if (!s.achievements.length) {
    s.achievements = [
      { id:'first_blood', name:'First Blood', description:'Place your first bid', points:10, criteria:{type:'first_bid',count:1},icon:'trophy',isActive:true },
      { id:'auction_victor',name:'Auction Victor',description:'Win first auction',points:20,criteria:{type:'auction_win',count:1},icon:'trophy',isActive:true },
      { id:'persistent_bidder',name:'Persistent Bidder',description:'Place 10 bids',points:15,criteria:{type:'per_bid',count:10},icon:'trophy',isActive:true },
      { id:'decathlon_champion',name:'Decathlon Champion',description:'Win 10 auctions',points:75,criteria:{type:'auction_wins',count:10},icon:'trophy',isActive:true },
      { id:'big_spender_i',name:'Big Spender I',description:'Spend ≥30M',points:30,criteria:{type:'high_bid',amount:30000000},icon:'trophy',isActive:true },
      { id:'big_spender_ii',name:'Big Spender II',description:'Spend ≥40M',points:40,criteria:{type:'high_bid',amount:40000000},icon:'trophy',isActive:true },
      { id:'big_spender_iii',name:'Big Spender III',description:'Spend ≥50M',points:50,criteria:{type:'high_bid',amount:50000000},icon:'trophy',isActive:true }
    ];
  }
  if (!s.playerCategories.length) {
    s.playerCategories = [
      { code:'GK', name:'Goalkeeper',description:'Goalkeepers',isActive:true },
      { code:'DEF',name:'Defender',description:'Defenders',isActive:true },
      { code:'MID',name:'Midfielder',description:'Midfielders',isActive:true },
      { code:'ATT',name:'Attacker',description:'Attackers',isActive:true },
      { code:'UNSOLD',name:'Unsold',description:'Unsold players',isActive:false }
    ];
  }
  if (!s.baseValueOptions.length) {
    s.baseValueOptions = [1000000,2000000,3000000,5000000,8000000,10000000,15000000,20000000];
  }
  if (!s.quickBidIncrements.length) {
    s.quickBidIncrements = [1000000,2000000,5000000,10000000];
  }
  return s.save();
};

export default mongoose.model('Settings', settingsSchema);