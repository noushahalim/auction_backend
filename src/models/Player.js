// src/models/Player.js

const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Player name is required'],
    trim: true,
    maxlength: [100, 'Player name cannot exceed 100 characters'],
    index: true
  },
  category: {
    type: String,
    required: [true, 'Player category is required'],
    enum: ['GK', 'DEF', 'MID', 'ATT', 'UNSOLD'],
    uppercase: true
  },
  baseValue: {
    type: Number,
    required: [true, 'Base value is required'],
    min: [1, 'Base value must be at least 1'],
    max: [100000000, 'Base value cannot exceed 100M']
  },
  imageUrl: {
    type: String,
    default: null
  },
  // Current status
  status: {
    type: String,
    enum: ['available', 'sold', 'unsold'],
    default: 'available'
  },
  // Sale information
  soldTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  soldPrice: {
    type: Number,
    default: null,
    min: [0, 'Sold price cannot be negative']
  },
  soldAt: {
    type: Date,
    default: null
  },
  auctionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Auction',
    default: null
  },
  // Bidding information
  currentBid: {
    type: Number,
    default: 0
  },
  currentBidder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  totalBids: {
    type: Number,
    default: 0
  },
  biddingStarted: {
    type: Boolean,
    default: false
  },
  biddingStartedAt: {
    type: Date,
    default: null
  },
  // Vote tracking for skip feature
  votes: {
    likes: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      votedAt: {
        type: Date,
        default: Date.now
      }
    }],
    dislikes: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      votedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  // Status flags
  isActive: {
    type: Boolean,
    default: true
  },
  isSkipped: {
    type: Boolean,
    default: false
  },
  skipReason: {
    type: String,
    enum: ['admin_skip', 'unanimous_dislike', 'no_bids'],
    default: null
  },
  // Additional metadata
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  position: {
    type: String,
    trim: true
  },
  nationality: {
    type: String,
    trim: true
  },
  age: {
    type: Number,
    min: [16, 'Age cannot be less than 16'],
    max: [50, 'Age cannot be more than 50']
  },
  rating: {
    type: Number,
    min: [40, 'Rating cannot be less than 40'],
    max: [99, 'Rating cannot be more than 99']
  }
}, {
  timestamps: true
});

// Indexes
playerSchema.index({ category: 1, status: 1 });
playerSchema.index({ soldTo: 1 });
playerSchema.index({ name: 'text' });
playerSchema.index({ isActive: 1 });
playerSchema.index({ auctionId: 1 });

// Virtual for bid increment
playerSchema.virtual('nextMinBid').get(function() {
  return this.currentBid > 0 ? this.currentBid + 1 : this.baseValue;
});

// Method to place a bid
playerSchema.methods.placeBid = async function(userId, amount) {
  if (this.status !== 'available') {
    throw new Error('Player is not available for bidding');
  }
  
  if (amount <= this.currentBid) {
    throw new Error('Bid amount must be higher than current bid');
  }
  
  if (amount < this.baseValue) {
    throw new Error('Bid amount cannot be less than base value');
  }
  
  this.currentBid = amount;
  this.currentBidder = userId;
  this.totalBids += 1;
  
  if (!this.biddingStarted) {
    this.biddingStarted = true;
    this.biddingStartedAt = new Date();
  }
  
  return this.save();
};

// Method to sell player
playerSchema.methods.sellTo = async function(userId, finalPrice, auctionId) {
  this.status = 'sold';
  this.soldTo = userId;
  this.soldPrice = finalPrice || this.currentBid;
  this.soldAt = new Date();
  this.auctionId = auctionId;
  
  return this.save();
};

// Method to mark as unsold
playerSchema.methods.markUnsold = async function(reason = 'no_bids') {
  this.status = 'unsold';
  this.category = 'UNSOLD';
  this.isSkipped = true;
  this.skipReason = reason;
  
  return this.save();
};

// Method to reset player for new auction
playerSchema.methods.resetForAuction = async function(newCategory = null) {
  this.status = 'available';
  this.soldTo = null;
  this.soldPrice = null;
  this.soldAt = null;
  this.auctionId = null;
  this.currentBid = 0;
  this.currentBidder = null;
  this.totalBids = 0;
  this.biddingStarted = false;
  this.biddingStartedAt = null;
  this.votes = { likes: [], dislikes: [] };
  this.isSkipped = false;
  this.skipReason = null;
  
  if (newCategory) {
    this.category = newCategory;
  }
  
  return this.save();
};

// Method to vote for player
playerSchema.methods.votePlayer = async function(userId, voteType) {
  // Remove any existing vote from this user
  this.votes.likes = this.votes.likes.filter(vote => !vote.userId.equals(userId));
  this.votes.dislikes = this.votes.dislikes.filter(vote => !vote.userId.equals(userId));
  
  // Add new vote
  if (voteType === 'like') {
    this.votes.likes.push({ userId, votedAt: new Date() });
  } else if (voteType === 'dislike') {
    this.votes.dislikes.push({ userId, votedAt: new Date() });
  }
  
  return this.save();
};

// Method to get vote summary
playerSchema.methods.getVoteSummary = function() {
  return {
    likes: this.votes.likes.length,
    dislikes: this.votes.dislikes.length,
    total: this.votes.likes.length + this.votes.dislikes.length,
    netVotes: this.votes.likes.length - this.votes.dislikes.length
  };
};

// Method to check if user has voted
playerSchema.methods.hasUserVoted = function(userId) {
  const hasLiked = this.votes.likes.some(vote => vote.userId.equals(userId));
  const hasDisliked = this.votes.dislikes.some(vote => vote.userId.equals(userId));
  
  if (hasLiked) return 'like';
  if (hasDisliked) return 'dislike';
  return null;
};

// Static methods
playerSchema.statics.getAvailableByCategory = function(category) {
  return this.find({
    category: category,
    status: 'available',
    isActive: true
  }).sort({ name: 1 });
};

playerSchema.statics.getPlayerStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalValue: { $sum: '$soldPrice' }
      }
    }
  ]);
};

playerSchema.statics.getMostExpensiveByCategory = function() {
  return this.aggregate([
    {
      $match: { status: 'sold' }
    },
    {
      $group: {
        _id: '$category',
        maxPrice: { $max: '$soldPrice' },
        player: { $first: '$$ROOT' }
      }
    },
    {
      $sort: { maxPrice: -1 }
    }
  ]);
};

module.exports = mongoose.model('Player', playerSchema);