// src/services/broadcastService.js

// Business logic for managing broadcast messages and notifications

import Broadcast from '../models/Broadcast.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { paginate } from '../utils/database.js';
import { sanitizeInput } from '../utils/helpers.js';

class BroadcastService {
  // Create new broadcast message
  async createBroadcast(broadcastData) {
    try {
      const { message, type = 'general', priority = 'normal', createdBy } = broadcastData;

      // Validate input
      if (!message || message.trim().length === 0) {
        throw new Error('Broadcast message is required');
      }

      if (message.length > 1000) {
        throw new Error('Broadcast message is too long (max 1000 characters)');
      }

      // Sanitize message
      const sanitizedMessage = sanitizeInput(message);

      const broadcast = new Broadcast({
        message: sanitizedMessage,
        type,
        priority,
        createdBy,
        isActive: true,
        deliveryStats: {
          sent: 0,
          delivered: 0,
          failed: 0
        }
      });

      const savedBroadcast = await broadcast.save();

      logger.info('Broadcast created', {
        broadcastId: savedBroadcast._id,
        type: savedBroadcast.type,
        priority: savedBroadcast.priority,
        createdBy: createdBy,
        messageLength: sanitizedMessage.length
      });

      return savedBroadcast;
    } catch (error) {
      logger.error('Error creating broadcast:', error);
      throw error;
    }
  }

  // Get all broadcasts with pagination
  async getAllBroadcasts(page = 1, limit = 20, type = 'all', isActive = null) {
    try {
      const { skip, limit: pageLimit } = paginate(page, limit);
      
      // Build filter
      const filter = {};
      if (type !== 'all') {
        filter.type = type;
      }
      if (isActive !== null) {
        filter.isActive = isActive;
      }

      const [broadcasts, total] = await Promise.all([
        Broadcast.find(filter)
          .populate('createdBy', 'name username role')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageLimit),
        Broadcast.countDocuments(filter)
      ]);

      return {
        broadcasts,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / pageLimit),
          count: total,
          hasNext: skip + pageLimit < total,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      logger.error('Error fetching broadcasts:', error);
      throw new Error('Failed to fetch broadcasts');
    }
  }

  // Get recent active broadcasts for users
  async getRecentBroadcasts(limit = 10, types = ['general', 'announcement']) {
    try {
      const broadcasts = await Broadcast.find({
        isActive: true,
        type: { $in: types },
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
      })
        .populate('createdBy', 'name username')
        .sort({ priority: -1, createdAt: -1 })
        .limit(limit);

      return broadcasts;
    } catch (error) {
      logger.error('Error fetching recent broadcasts:', error);
      throw new Error('Failed to fetch recent broadcasts');
    }
  }

  // Get broadcast by ID
  async getBroadcastById(broadcastId) {
    try {
      const broadcast = await Broadcast.findById(broadcastId)
        .populate('createdBy', 'name username role');

      if (!broadcast) {
        throw new Error('Broadcast not found');
      }

      return broadcast;
    } catch (error) {
      logger.error('Error fetching broadcast:', error);
      throw error;
    }
  }

  // Update broadcast
  async updateBroadcast(broadcastId, updateData) {
    try {
      const allowedUpdates = ['message', 'type', 'priority', 'isActive'];
      const updates = {};

      // Filter only allowed updates
      Object.keys(updateData).forEach(key => {
        if (allowedUpdates.includes(key)) {
          if (key === 'message') {
            updates[key] = sanitizeInput(updateData[key]);
          } else {
            updates[key] = updateData[key];
          }
        }
      });

      if (Object.keys(updates).length === 0) {
        throw new Error('No valid updates provided');
      }

      // Validate message length if updating message
      if (updates.message && updates.message.length > 1000) {
        throw new Error('Broadcast message is too long (max 1000 characters)');
      }

      const broadcast = await Broadcast.findByIdAndUpdate(
        broadcastId,
        { $set: updates },
        { new: true, runValidators: true }
      ).populate('createdBy', 'name username');

      if (!broadcast) {
        throw new Error('Broadcast not found');
      }

      logger.info('Broadcast updated', {
        broadcastId,
        updates: Object.keys(updates)
      });

      return broadcast;
    } catch (error) {
      logger.error('Error updating broadcast:', error);
      throw error;
    }
  }

  // Delete broadcast
  async deleteBroadcast(broadcastId) {
    try {
      const broadcast = await Broadcast.findByIdAndDelete(broadcastId);
      
      if (!broadcast) {
        throw new Error('Broadcast not found');
      }

      logger.info('Broadcast deleted', {
        broadcastId,
        type: broadcast.type,
        createdAt: broadcast.createdAt
      });

      return broadcast;
    } catch (error) {
      logger.error('Error deleting broadcast:', error);
      throw error;
    }
  }

  // Deactivate broadcast (soft delete)
  async deactivateBroadcast(broadcastId) {
    try {
      const broadcast = await Broadcast.findByIdAndUpdate(
        broadcastId,
        { isActive: false },
        { new: true }
      );

      if (!broadcast) {
        throw new Error('Broadcast not found');
      }

      logger.info('Broadcast deactivated', {
        broadcastId,
        type: broadcast.type
      });

      return broadcast;
    } catch (error) {
      logger.error('Error deactivating broadcast:', error);
      throw error;
    }
  }

  // Get broadcasts by type
  async getBroadcastsByType(type, page = 1, limit = 20) {
    try {
      const { skip, limit: pageLimit } = paginate(page, limit);
      
      const [broadcasts, total] = await Promise.all([
        Broadcast.find({ type, isActive: true })
          .populate('createdBy', 'name username')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageLimit),
        Broadcast.countDocuments({ type, isActive: true })
      ]);

      return {
        broadcasts,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / pageLimit),
          count: total,
          hasNext: skip + pageLimit < total,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      logger.error('Error fetching broadcasts by type:', error);
      throw new Error('Failed to fetch broadcasts by type');
    }
  }

  // Mark broadcast as read for a user (for future user-specific tracking)
  async markBroadcastAsRead(broadcastId, userId) {
    try {
      const broadcast = await Broadcast.findById(broadcastId);
      if (!broadcast) {
        throw new Error('Broadcast not found');
      }

      // Add user to readBy array if not already present
      if (!broadcast.readBy.includes(userId)) {
        broadcast.readBy.push(userId);
        broadcast.deliveryStats.delivered += 1;
        await broadcast.save();
      }

      return { success: true, message: 'Broadcast marked as read' };
    } catch (error) {
      logger.error('Error marking broadcast as read:', error);
      throw error;
    }
  }

  // Get unread broadcasts for a user
  async getUnreadBroadcasts(userId, limit = 20) {
    try {
      const broadcasts = await Broadcast.find({
        isActive: true,
        readBy: { $ne: userId },
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
      })
        .populate('createdBy', 'name username')
        .sort({ priority: -1, createdAt: -1 })
        .limit(limit);

      return broadcasts;
    } catch (error) {
      logger.error('Error fetching unread broadcasts:', error);
      throw new Error('Failed to fetch unread broadcasts');
    }
  }

  // Get broadcast statistics
  async getBroadcastStats() {
    try {
      const [
        totalBroadcasts,
        activeBroadcasts,
        broadcastsByType,
        recentBroadcasts
      ] = await Promise.all([
        Broadcast.countDocuments(),
        Broadcast.countDocuments({ isActive: true }),
        Broadcast.aggregate([
          { $group: { _id: '$type', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        Broadcast.countDocuments({
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
      ]);

      // Calculate delivery stats
      const deliveryStats = await Broadcast.aggregate([
        {
          $group: {
            _id: null,
            totalSent: { $sum: '$deliveryStats.sent' },
            totalDelivered: { $sum: '$deliveryStats.delivered' },
            totalFailed: { $sum: '$deliveryStats.failed' }
          }
        }
      ]);

      const delivery = deliveryStats[0] || { totalSent: 0, totalDelivered: 0, totalFailed: 0 };

      return {
        total: totalBroadcasts,
        active: activeBroadcasts,
        inactive: totalBroadcasts - activeBroadcasts,
        recent24h: recentBroadcasts,
        byType: broadcastsByType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        delivery: {
          sent: delivery.totalSent,
          delivered: delivery.totalDelivered,
          failed: delivery.totalFailed,
          deliveryRate: delivery.totalSent > 0 
            ? Math.round((delivery.totalDelivered / delivery.totalSent) * 100) 
            : 0
        }
      };
    } catch (error) {
      logger.error('Error fetching broadcast stats:', error);
      throw new Error('Failed to fetch broadcast statistics');
    }
  }

  // Clean up old broadcasts (for maintenance)
  async cleanupOldBroadcasts(daysOld = 90) {
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
      
      const result = await Broadcast.deleteMany({
        isActive: false,
        createdAt: { $lt: cutoffDate }
      });

      logger.info('Old broadcasts cleaned up', {
        deletedCount: result.deletedCount,
        cutoffDate
      });

      return {
        deletedCount: result.deletedCount,
        cutoffDate
      };
    } catch (error) {
      logger.error('Error cleaning up old broadcasts:', error);
      throw new Error('Failed to cleanup old broadcasts');
    }
  }

  // Create system broadcast (for automated messages)
  async createSystemBroadcast(message, type = 'system', priority = 'high') {
    try {
      const broadcast = new Broadcast({
        message: sanitizeInput(message),
        type,
        priority,
        isSystem: true,
        isActive: true,
        deliveryStats: {
          sent: 0,
          delivered: 0,
          failed: 0
        }
      });

      const savedBroadcast = await broadcast.save();

      logger.info('System broadcast created', {
        broadcastId: savedBroadcast._id,
        type,
        priority,
        messageLength: message.length
      });

      return savedBroadcast;
    } catch (error) {
      logger.error('Error creating system broadcast:', error);
      throw error;
    }
  }

  // Get broadcast templates (for common messages)
  getBroadcastTemplates() {
    return {
      auction_start: {
        type: 'auction',
        priority: 'high',
        message: 'Auction "{auctionName}" is starting now! Join the bidding!'
      },
      auction_end: {
        type: 'auction',
        priority: 'normal',
        message: 'Auction "{auctionName}" has ended. Check the results!'
      },
      maintenance: {
        type: 'system',
        priority: 'high',
        message: 'System maintenance scheduled. The platform will be unavailable from {startTime} to {endTime}.'
      },
      welcome: {
        type: 'general',
        priority: 'normal',
        message: 'Welcome to the Auction Platform! Your account has been approved.'
      },
      player_sold: {
        type: 'auction',
        priority: 'normal',
        message: '{playerName} sold to {teamName} for {amount}!'
      }
    };
  }

  // Create broadcast from template
  async createBroadcastFromTemplate(templateKey, variables = {}, createdBy) {
    try {
      const templates = this.getBroadcastTemplates();
      const template = templates[templateKey];

      if (!template) {
        throw new Error('Broadcast template not found');
      }

      let message = template.message;
      
      // Replace variables in template
      Object.keys(variables).forEach(key => {
        const placeholder = `{${key}}`;
        message = message.replace(new RegExp(placeholder, 'g'), variables[key]);
      });

      const broadcastData = {
        message,
        type: template.type,
        priority: template.priority,
        createdBy
      };

      return await this.createBroadcast(broadcastData);
    } catch (error) {
      logger.error('Error creating broadcast from template:', error);
      throw error;
    }
  }
}

export default new BroadcastService();