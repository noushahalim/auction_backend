// src/models/Broadcast.js

const mongoose = require('mongoose');

const broadcastSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Broadcast title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  message: {
    type: String,
    required: [true, 'Broadcast message is required'],
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  type: {
    type: String,
    enum: ['general', 'announcement', 'auction', 'system', 'achievement'],
    default: 'general'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  // Targeting
  targetAudience: {
    type: String,
    enum: ['all', 'managers', 'admins', 'active_users', 'specific_users'],
    default: 'all'
  },
  targetUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Scheduling
  scheduleType: {
    type: String,
    enum: ['immediate', 'scheduled'],
    default: 'immediate'
  },
  scheduledFor: {
    type: Date,
    default: null
  },
  // Status
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sent', 'failed'],
    default: 'draft'
  },
  sentAt: {
    type: Date,
    default: null
  },
  // Sender information
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderName: {
    type: String,
    required: true
  },
  // Delivery tracking
  recipientCount: {
    type: Number,
    default: 0
  },
  deliveredCount: {
    type: Number,
    default: 0
  },
  readCount: {
    type: Number,
    default: 0
  },
  failedDeliveries: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: {
      type: String,
      maxlength: [200, 'Failure reason cannot exceed 200 characters']
    },
    attemptedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Additional options
  isUrgent: {
    type: Boolean,
    default: false
  },
  requiresAcknowledgment: {
    type: Boolean,
    default: false
  },
  acknowledgments: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    acknowledgedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Auto-expire
  expiresAt: {
    type: Date,
    default: null
  },
  // Rich content
  imageUrl: {
    type: String,
    default: null
  },
  actionButton: {
    text: {
      type: String,
      maxlength: [50, 'Action button text cannot exceed 50 characters']
    },
    url: {
      type: String,
      maxlength: [500, 'Action button URL cannot exceed 500 characters']
    },
    action: {
      type: String,
      enum: ['none', 'url', 'auction_join', 'profile_update'],
      default: 'none'
    }
  },
  // Metadata
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],
  relatedAuction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Auction',
    default: null
  },
  relatedPlayer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    default: null
  },
  // Analytics
  views: {
    type: Number,
    default: 0
  },
  clicks: {
    type: Number,
    default: 0
  },
  // System generated flags
  isSystemGenerated: {
    type: Boolean,
    default: false
  },
  systemTemplate: {
    type: String,
    enum: ['auction_start', 'auction_end', 'player_sold', 'achievement_unlock', 'maintenance'],
    default: null
  }
}, {
  timestamps: true
});

// Indexes
broadcastSchema.index({ status: 1, scheduledFor: 1 });
broadcastSchema.index({ sentBy: 1, createdAt: -1 });
broadcastSchema.index({ type: 1, priority: 1 });
broadcastSchema.index({ targetAudience: 1 });
broadcastSchema.index({ sentAt: -1 });
broadcastSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for delivery rate
broadcastSchema.virtual('deliveryRate').get(function() {
  if (this.recipientCount === 0) return 0;
  return Math.round((this.deliveredCount / this.recipientCount) * 100);
});

// Virtual for read rate
broadcastSchema.virtual('readRate').get(function() {
  if (this.deliveredCount === 0) return 0;
  return Math.round((this.readCount / this.deliveredCount) * 100);
});

// Virtual for acknowledgment rate
broadcastSchema.virtual('acknowledgmentRate').get(function() {
  if (!this.requiresAcknowledgment || this.deliveredCount === 0) return null;
  return Math.round((this.acknowledgments.length / this.deliveredCount) * 100);
});

// Method to send broadcast
broadcastSchema.methods.send = async function() {
  if (this.status !== 'draft' && this.status !== 'scheduled') {
    throw new Error('Only draft or scheduled broadcasts can be sent');
  }
  
  // Get target recipients
  const recipients = await this.getTargetRecipients();
  
  if (recipients.length === 0) {
    throw new Error('No recipients found for this broadcast');
  }
  
  this.recipientCount = recipients.length;
  this.status = 'sent';
  this.sentAt = new Date();
  
  await this.save();
  
  // Return recipients for actual delivery by the calling service
  return {
    broadcast: this,
    recipients: recipients
  };
};

// Method to get target recipients
broadcastSchema.methods.getTargetRecipients = async function() {
  const User = require('./User');
  let query = {};
  
  switch (this.targetAudience) {
    case 'all':
      query = { isActive: true };
      break;
    case 'managers':
      query = { role: 'manager', isActive: true };
      break;
    case 'admins':
      query = { role: 'admin', isActive: true };
      break;
    case 'active_users':
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      query = { 
        isActive: true,
        lastLogin: { $gte: thirtyDaysAgo }
      };
      break;
    case 'specific_users':
      query = { 
        _id: { $in: this.targetUsers },
        isActive: true 
      };
      break;
  }
  
  return User.find(query).select('_id name username');
};

// Method to mark as delivered to user
broadcastSchema.methods.markDelivered = async function(userId) {
  this.deliveredCount += 1;
  return this.save();
};

// Method to mark as read by user
broadcastSchema.methods.markRead = async function(userId) {
  this.readCount += 1;
  return this.save();
};

// Method to add acknowledgment
broadcastSchema.methods.addAcknowledgment = async function(userId) {
  if (!this.requiresAcknowledgment) {
    throw new Error('This broadcast does not require acknowledgment');
  }
  
  const existingAck = this.acknowledgments.find(ack => ack.userId.equals(userId));
  if (existingAck) {
    return this; // Already acknowledged
  }
  
  this.acknowledgments.push({
    userId: userId,
    acknowledgedAt: new Date()
  });
  
  return this.save();
};

// Method to track failure
broadcastSchema.methods.trackFailure = async function(userId, reason) {
  this.failedDeliveries.push({
    userId: userId,
    reason: reason,
    attemptedAt: new Date()
  });
  
  return this.save();
};

// Method to increment views
broadcastSchema.methods.incrementViews = async function() {
  this.views += 1;
  return this.save();
};

// Method to increment clicks
broadcastSchema.methods.incrementClicks = async function() {
  this.clicks += 1;
  return this.save();
};

// Method to schedule broadcast
broadcastSchema.methods.schedule = async function(scheduledFor) {
  if (this.status !== 'draft') {
    throw new Error('Only draft broadcasts can be scheduled');
  }
  
  this.scheduleType = 'scheduled';
  this.scheduledFor = new Date(scheduledFor);
  this.status = 'scheduled';
  
  return this.save();
};

// Method to cancel scheduled broadcast
broadcastSchema.methods.cancel = async function() {
  if (this.status !== 'scheduled') {
    throw new Error('Only scheduled broadcasts can be cancelled');
  }
  
  this.status = 'draft';
  this.scheduleType = 'immediate';
  this.scheduledFor = null;
  
  return this.save();
};

// Static method to get broadcasts for user
broadcastSchema.statics.getForUser = function(userId, limit = 50) {
  return this.find({
    $or: [
      { targetAudience: 'all' },
      { 
        targetAudience: 'specific_users',
        targetUsers: userId
      }
    ],
    status: 'sent',
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  })
  .populate('sentBy', 'name username')
  .sort({ sentAt: -1 })
  .limit(limit);
};

// Static method to get scheduled broadcasts
broadcastSchema.statics.getScheduled = function() {
  return this.find({
    status: 'scheduled',
    scheduledFor: { $lte: new Date() }
  });
};

// Static method to get broadcast statistics
broadcastSchema.statics.getStats = function(dateRange = null) {
  const matchStage = { status: 'sent' };
  
  if (dateRange) {
    matchStage.sentAt = {
      $gte: new Date(dateRange.start),
      $lte: new Date(dateRange.end)
    };
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalBroadcasts: { $sum: 1 },
        totalRecipients: { $sum: '$recipientCount' },
        totalDelivered: { $sum: '$deliveredCount' },
        totalRead: { $sum: '$readCount' },
        totalFailed: { $sum: { $size: '$failedDeliveries' } },
        averageViews: { $avg: '$views' },
        averageClicks: { $avg: '$clicks' }
      }
    },
    {
      $project: {
        _id: 0,
        totalBroadcasts: 1,
        totalRecipients: 1,
        totalDelivered: 1,
        totalRead: 1,
        totalFailed: 1,
        averageViews: { $round: ['$averageViews', 2] },
        averageClicks: { $round: ['$averageClicks', 2] },
        deliveryRate: {
          $round: [
            { $multiply: [{ $divide: ['$totalDelivered', '$totalRecipients'] }, 100] },
            2
          ]
        },
        readRate: {
          $round: [
            { $multiply: [{ $divide: ['$totalRead', '$totalDelivered'] }, 100] },
            2
          ]
        }
      }
    }
  ]);
};

// Static method to create system broadcast
broadcastSchema.statics.createSystemBroadcast = async function(template, data = {}) {
  const templates = {
    auction_start: {
      title: 'Auction Started!',
      message: `Auction "${data.auctionName}" has started. Join now to participate!`,
      type: 'auction',
      priority: 'high',
      actionButton: {
        text: 'Join Auction',
        action: 'auction_join'
      }
    },
    auction_end: {
      title: 'Auction Completed',
      message: `Auction "${data.auctionName}" has been completed. Check out the results!`,
      type: 'auction',
      priority: 'medium'
    },
    player_sold: {
      title: 'Player Sold!',
      message: `${data.playerName} has been sold to ${data.managerName} for ₹${data.amount?.toLocaleString()}`,
      type: 'auction',
      priority: 'medium'
    },
    achievement_unlock: {
      title: 'Achievement Unlocked!',
      message: `Congratulations! You've unlocked "${data.achievementName}" and earned ${data.points} points!`,
      type: 'achievement',
      priority: 'medium',
      targetAudience: 'specific_users',
      targetUsers: [data.userId]
    },
    maintenance: {
      title: 'System Maintenance',
      message: data.message || 'The system will undergo maintenance. Please save your work.',
      type: 'system',
      priority: 'urgent'
    }
  };
  
  const templateData = templates[template];
  if (!templateData) {
    throw new Error(`Unknown system template: ${template}`);
  }
  
  const broadcastData = {
    ...templateData,
    sentBy: data.adminId || null,
    senderName: data.adminName || 'System',
    isSystemGenerated: true,
    systemTemplate: template,
    relatedAuction: data.auctionId || null,
    relatedPlayer: data.playerId || null,
    ...data.overrides || {}
  };
  
  const broadcast = new this(broadcastData);
  await broadcast.save();
  
  if (broadcastData.scheduleType !== 'scheduled') {
    await broadcast.send();
  }
  
  return broadcast;
};

module.exports = mongoose.model('Broadcast', broadcastSchema);