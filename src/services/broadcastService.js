// src/services/broadcastService.js

import Broadcast from '../models/Broadcast.js';
import User from '../models/User.js';
import { logger } from '../utils/logger.js';
import { paginate } from '../utils/database.js';
import { sanitizeInput } from '../utils/helpers.js';

class BroadcastService {
  // Create new broadcast message
  async createBroadcast(broadcastData) {
    try {
      const { message, type = 'general', priority = 'normal', createdBy } = broadcastData;

      if (!message?.trim()) {
        throw new Error('Broadcast message is required');
      }
      if (message.length > 1000) {
        throw new Error('Broadcast message is too long (max 1000 characters)');
      }

      const sanitizedMessage = sanitizeInput(message);

      const broadcast = new Broadcast({
        message: sanitizedMessage,
        type,
        priority,
        createdBy,
        isActive: true,
        deliveryStats: { sent: 0, delivered: 0, failed: 0 }
      });

      const saved = await broadcast.save();
      logger.info('Broadcast created', {
        broadcastId: saved._id,
        type: saved.type,
        priority: saved.priority,
        createdBy,
        messageLength: sanitizedMessage.length
      });
      return saved;

    } catch (error) {
      logger.error('Error creating broadcast:', error);
      throw error;
    }
  }

  // Get all broadcasts with pagination
  async getAllBroadcasts(page = 1, limit = 20, type = 'all', isActive = null) {
    try {
      const { skip, limit: pageLimit } = paginate(page, limit);
      const filter = {};
      if (type !== 'all') filter.type = type;
      if (isActive !== null) filter.isActive = isActive;

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
          current: parseInt(page, 10),
          total:   Math.ceil(total / pageLimit),
          count:   total,
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
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const broadcasts = await Broadcast.find({
        isActive:  true,
        type:      { $in: types },
        createdAt: { $gte: since }
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

  // Get single broadcast by ID
  async getBroadcastById(broadcastId) {
    try {
      const broadcast = await Broadcast.findById(broadcastId)
        .populate('createdBy', 'name username role');
      if (!broadcast) throw new Error('Broadcast not found');
      return broadcast;
    } catch (error) {
      logger.error('Error fetching broadcast:', error);
      throw error;
    }
  }

  // Update broadcast
  async updateBroadcast(broadcastId, updateData) {
    try {
      const allowed = ['message','type','priority','isActive'];
      const updates = {};

      for (const key of Object.keys(updateData)) {
        if (allowed.includes(key)) {
          updates[key] = key === 'message'
            ? sanitizeInput(updateData[key])
            : updateData[key];
        }
      }
      if (!Object.keys(updates).length) {
        throw new Error('No valid updates provided');
      }
      if (updates.message && updates.message.length > 1000) {
        throw new Error('Broadcast message is too long (max 1000 characters)');
      }

      const broadcast = await Broadcast.findByIdAndUpdate(
        broadcastId,
        { $set: updates },
        { new: true, runValidators: true }
      ).populate('createdBy', 'name username');

      if (!broadcast) throw new Error('Broadcast not found');
      logger.info('Broadcast updated', { broadcastId, updates: Object.keys(updates) });
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
      if (!broadcast) throw new Error('Broadcast not found');
      logger.info('Broadcast deleted', {
        broadcastId,
        type:      broadcast.type,
        createdAt: broadcast.createdAt
      });
      return broadcast;
    } catch (error) {
      logger.error('Error deleting broadcast:', error);
      throw error;
    }
  }

  // Soft-delete (deactivate) broadcast
  async deactivateBroadcast(broadcastId) {
    try {
      const broadcast = await Broadcast.findByIdAndUpdate(
        broadcastId,
        { isActive: false },
        { new: true }
      );
      if (!broadcast) throw new Error('Broadcast not found');
      logger.info('Broadcast deactivated', { broadcastId, type: broadcast.type });
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
          .populate('createdBy','name username')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageLimit),
        Broadcast.countDocuments({ type, isActive: true })
      ]);

      return {
        broadcasts,
        pagination: {
          current: parseInt(page, 10),
          total:   Math.ceil(total / pageLimit),
          count:   total,
          hasNext: skip + pageLimit < total,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      logger.error('Error fetching broadcasts by type:', error);
      throw new Error('Failed to fetch broadcasts by type');
    }
  }

  // Mark broadcast as read
  async markBroadcastAsRead(broadcastId, userId) {
    try {
      const broadcast = await Broadcast.findById(broadcastId);
      if (!broadcast) throw new Error('Broadcast not found');
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
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const broadcasts = await Broadcast.find({
        isActive:  true,
        readBy:    { $ne: userId },
        createdAt: { $gte: cutoff }
      })
        .populate('createdBy','name username')
        .sort({ priority: -1, createdAt: -1 })
        .limit(limit);

      return broadcasts;
    } catch (error) {
      logger.error('Error fetching unread broadcasts:', error);
      throw new Error('Failed to fetch unread broadcasts');
    }
  }

  // Broadcast statistics
  async getBroadcastStats() {
    try {
      const [
        totalBroadcasts,
        activeBroadcasts,
        byType,
        recent24hCount
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

      const deliveryStats = await Broadcast.aggregate([
        {
          $group: {
            _id: null,
            totalSent:      { $sum: '$deliveryStats.sent' },
            totalDelivered: { $sum: '$deliveryStats.delivered' },
            totalFailed:    { $sum: '$deliveryStats.failed' }
          }
        }
      ]);
      const delivery = deliveryStats[0] || { totalSent: 0, totalDelivered: 0, totalFailed: 0 };

      return {
        total:          totalBroadcasts,
        active:         activeBroadcasts,
        inactive:       totalBroadcasts - activeBroadcasts,
        recent24h:      recent24hCount,
        byType:         byType.reduce((acc, b) => { acc[b._id] = b.count; return acc; }, {}),
        delivery: {
          sent:         delivery.totalSent,
          delivered:    delivery.totalDelivered,
          failed:       delivery.totalFailed,
          deliveryRate: delivery.totalSent
            ? Math.round((delivery.totalDelivered / delivery.totalSent) * 100)
            : 0
        }
      };
    } catch (error) {
      logger.error('Error fetching broadcast stats:', error);
      throw new Error('Failed to fetch broadcast statistics');
    }
  }

  // Clean up old broadcasts
  async cleanupOldBroadcasts(daysOld = 90) {
    try {
      const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
      const result = await Broadcast.deleteMany({ isActive: false, createdAt: { $lt: cutoff } });
      logger.info('Old broadcasts cleaned up', {
        deletedCount: result.deletedCount,
        cutoffDate:   cutoff
      });
      return { deletedCount: result.deletedCount, cutoffDate: cutoff };
    } catch (error) {
      logger.error('Error cleaning up old broadcasts:', error);
      throw new Error('Failed to cleanup old broadcasts');
    }
  }

  // System broadcast creation
  async createSystemBroadcast(message, type = 'system', priority = 'high') {
    try {
      const sanitized = sanitizeInput(message);
      const broadcast = new Broadcast({
        message:       sanitized,
        type,
        priority,
        isSystem:      true,
        isActive:      true,
        deliveryStats: { sent: 0, delivered: 0, failed: 0 }
      });
      const saved = await broadcast.save();
      logger.info('System broadcast created', {
        broadcastId: saved._id,
        type,
        priority,
        messageLength: message.length
      });
      return saved;
    } catch (error) {
      logger.error('Error creating system broadcast:', error);
      throw error;
    }
  }

  // Templates and templated creation
  getBroadcastTemplates() {
    return {
      auction_start: {
        type:     'auction',
        priority: 'high',
        message:  'Auction "{auctionName}" is starting now! Join the bidding!'
      },
      auction_end: {
        type:     'auction',
        priority: 'normal',
        message:  'Auction "{auctionName}" has ended. Check the results!'
      },
      maintenance: {
        type:     'system',
        priority: 'high',
        message:  'System maintenance scheduled. The platform will be unavailable from {startTime} to {endTime}.'
      },
      welcome: {
        type:     'general',
        priority: 'normal',
        message:  'Welcome to the Auction Platform! Your account has been approved.'
      },
      player_sold: {
        type:     'auction',
        priority: 'normal',
        message:  '{playerName} sold to {teamName} for {amount}!'
      }
    };
  }

  async createBroadcastFromTemplate(templateKey, variables = {}, createdBy) {
    try {
      const templates = this.getBroadcastTemplates();
      const template  = templates[templateKey];
      if (!template) throw new Error('Broadcast template not found');

      let message = template.message;
      for (const key of Object.keys(variables)) {
        message = message.replace(new RegExp(`{${key}}`, 'g'), variables[key]);
      }
      return this.createBroadcast({
        message,
        type:       template.type,
        priority:   template.priority,
        createdBy
      });
    } catch (error) {
      logger.error('Error creating broadcast from template:', error);
      throw error;
    }
  }
}

export default new BroadcastService();