// src/models/Bid.js

import mongoose from 'mongoose';

const bidSchema = new mongoose.Schema({
  auction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Auction',
    required: true,
    index: true
  },
  player: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true,
    index: true
  },
  bidder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'Bid amount is required'],
    min: [1, 'Bid amount must be at least 1']
  },
  previousBid: {
    type: Number,
    default: 0
  },
  increment: {
    type: Number,
    default: 1
  },
  placedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  timerRemaining: {
    type: Number,
    default: null
  },
  isWinning: {
    type: Boolean,
    default: false
  },
  isValid: {
    type: Boolean,
    default: true
  },
  bidSequence: {
    type: Number,
    required: true
  },
  category: {
    type: String,
    enum: ['GK', 'DEF', 'MID', 'ATT'],
    required: true
  },
  source: {
    type: String,
    enum: ['web', 'socket', 'auto'],
    default: 'web'
  },
  userAgent: {
    type: String,
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  },
  processedAt: {
    type: Date,
    default: null
  },
  processingTime: {
    type: Number,
    default: null
  }
}, {
  timestamps: true
});

// Compound indexes
bidSchema.index({ auction: 1, player: 1, placedAt: -1 });
bidSchema.index({ bidder: 1, placedAt: -1 });
bidSchema.index({ auction: 1, placedAt: -1 });
bidSchema.index({ player: 1, amount: -1 });
bidSchema.index({ isWinning: 1, placedAt: -1 });

// Virtual for bid display
bidSchema.virtual('displayAmount').get(function() {
  return `₹${this.amount.toLocaleString()}`;
});

// Method to mark as winning bid
bidSchema.methods.markAsWinning = async function() {
  await this.constructor.updateMany(
    { player: this.player, _id: { $ne: this._id } },
    { isWinning: false }
  );
  this.isWinning = true;
  return this.save();
};

// Method to invalidate bid
bidSchema.methods.invalidate = async function(reason = 'manual') {
  this.isValid = false;
  this.invalidationReason = reason;
  this.invalidatedAt = new Date();
  return this.save();
};

// Static: get bid history for a player
bidSchema.statics.getPlayerBidHistory = function(playerId, limit = 50) {
  return this.find({ player: playerId })
    .populate('bidder', 'name username')
    .sort({ placedAt: -1 })
    .limit(limit);
};

// Static: get user's bid history
bidSchema.statics.getUserBidHistory = function(userId, limit = 100) {
  return this.find({ bidder: userId })
    .populate('player', 'name category')
    .populate('auction', 'name')
    .sort({ placedAt: -1 })
    .limit(limit);
};

// Static: auction statistics
bidSchema.statics.getAuctionStats = function(auctionId) {
  return this.aggregate([
    { $match: { auction: mongoose.Types.ObjectId(auctionId) } },
    { $group: {
        _id: null,
        totalBids: { $sum: 1 },
        totalValue: { $sum: '$amount' },
        averageBid: { $avg: '$amount' },
        highestBid: { $max: '$amount' },
        uniqueBidders: { $addToSet: '$bidder' }
    }},
    { $project: {
        _id: 0,
        totalBids: 1,
        totalValue: 1,
        averageBid: { $round: ['$averageBid', 2] },
        highestBid: 1,
        uniqueBiddersCount: { $size: '$uniqueBidders' }
    }}
  ]);
};

// Static: top bidders
bidSchema.statics.getTopBidders = function(auctionId = null, limit = 10) {
  const match = auctionId ? { auction: mongoose.Types.ObjectId(auctionId) } : {};
  return this.aggregate([
    { $match: match },
    { $group: {
        _id: '$bidder',
        totalBids: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        averageBid: { $avg: '$amount' },
        highestBid: { $max: '$amount' }
    }},
    { $lookup: {
        from: 'users', localField: '_id', foreignField: '_id', as: 'user'
    }},
    { $unwind: '$user' },
    { $project: {
        _id: 1,
        name: '$user.name',
        username: '$user.username',
        totalBids: 1,
        totalAmount: 1,
        averageBid: { $round: ['$averageBid', 2] },
        highestBid: 1
    }},
    { $sort: { totalBids: -1, totalAmount: -1 }},
    { $limit: limit }
  ]);
};

// Static: bid timeline
bidSchema.statics.getBidTimeline = function(playerId) {
  return this.find({ player: playerId })
    .populate('bidder', 'name username avatarUrl')
    .select('amount placedAt timerRemaining bidSequence')
    .sort({ placedAt: 1 });
};

// Static: rapid bidding analysis
bidSchema.statics.getRapidBiddingAnalysis = function(auctionId, timeWindow = 30) {
  const cutoff = new Date(Date.now() - timeWindow * 1000);
  return this.aggregate([
    { $match: { auction: mongoose.Types.ObjectId(auctionId), placedAt: { $gte: cutoff } }},
    { $group: {
        _id: { player: '$player', minute: { $dateToString: { format: '%Y-%m-%d %H:%M', date: '$placedAt' } } },
        bidCount: { $sum: 1 },
        bids: { $push: '$$ROOT' }
    }},
    { $sort: { bidCount: -1 }}
  ]);
};

// Pre-save middleware: sequence and increments
bidSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const last = await this.constructor.findOne({ player: this.player }).sort({ bidSequence: -1 });
      this.bidSequence = last ? last.bidSequence + 1 : 1;
      this.increment = last ? this.amount - last.amount : this.amount;
      this.previousBid = last ? last.amount : 0;
      next();
    } catch (err) { next(err); }
  } else next();
});

// Post-save middleware: update player stats
bidSchema.post('save', async function(doc) {
  try {
    const Player = await import('./Player.js').then(m => m.default);
    await Player.findByIdAndUpdate(doc.player, {
      currentBid: doc.amount,
      currentBidder: doc.bidder,
      $inc: { totalBids: 1 }
    });
  } catch (err) {
    console.error('Error updating player after bid save:', err);
  }
});

export default mongoose.model('Bid', bidSchema);