// src/services/notificationService.js

// Business logic for managing user notifications and real-time alerts

import User from '../models/User.js';
import Broadcast from '../models/Broadcast.js';
import logger from '../utils/logger.js';
import { paginate } from '../utils/database.js';
import { formatCurrency, generateCorrelationId } from '../utils/helpers.js';

class NotificationService {
  constructor() {
    this.socketIO = null; // Will be set by socket initialization
  }

  // Set Socket.IO instance for real-time notifications
  setSocketIO(io) {
    this.socketIO = io;
  }

  // Send real-time notification to specific user
  async sendToUser(userId, notification) {
    try {
      // Validate notification structure
      const validatedNotification = this.validateNotification(notification);
      
      // Add metadata
      validatedNotification.id = generateCorrelationId();
      validatedNotification.timestamp = new Date().toISOString();
      validatedNotification.delivered = false;

      // Send via Socket.IO if available
      if (this.socketIO) {
        this.socketIO.to(`user:${userId}`).emit('notification', validatedNotification);
        validatedNotification.delivered = true;
        
        logger.info('Real-time notification sent', {
          userId,
          type: validatedNotification.type,
          notificationId: validatedNotification.id
        });
      }

      // Store notification in user's notification array (optional persistent storage)
      await this.storeUserNotification(userId, validatedNotification);

      return validatedNotification;
    } catch (error) {
      logger.error('Error sending notification to user:', error);
      throw error;
    }
  }

  // Send notification to all users
  async sendToAll(notification) {
    try {
      const validatedNotification = this.validateNotification(notification);
      validatedNotification.id = generateCorrelationId();
      validatedNotification.timestamp = new Date().toISOString();

      // Send via Socket.IO broadcast
      if (this.socketIO) {
        this.socketIO.emit('notification', validatedNotification);
        
        logger.info('Broadcast notification sent', {
          type: validatedNotification.type,
          notificationId: validatedNotification.id
        });
      }

      // Create broadcast record
      await this.createBroadcastNotification(validatedNotification);

      return validatedNotification;
    } catch (error) {
      logger.error('Error sending broadcast notification:', error);
      throw error;
    }
  }

  // Send notification to users in specific auction room
  async sendToAuctionRoom(auctionId, notification) {
    try {
      const validatedNotification = this.validateNotification(notification);
      validatedNotification.id = generateCorrelationId();
      validatedNotification.timestamp = new Date().toISOString();
      validatedNotification.auctionId = auctionId;

      // Send via Socket.IO to auction room
      if (this.socketIO) {
        this.socketIO.to(`auction:${auctionId}`).emit('notification', validatedNotification);
        
        logger.info('Auction room notification sent', {
          auctionId,
          type: validatedNotification.type,
          notificationId: validatedNotification.id
        });
      }

      return validatedNotification;
    } catch (error) {
      logger.error('Error sending auction room notification:', error);
      throw error;
    }
  }

  // Validate notification structure
  validateNotification(notification) {
    const requiredFields = ['type', 'title', 'message'];
    
    for (const field of requiredFields) {
      if (!notification[field]) {
        throw new Error(`Notification missing required field: ${field}`);
      }
    }

    const validTypes = [
      'bid_placed',
      'auction_won',
      'auction_lost',
      'auction_started',
      'auction_ended',
      'player_sold',
      'achievement_earned',
      'broadcast',
      'system',
      'warning',
      'error',
      'info'
    ];

    if (!validTypes.includes(notification.type)) {
      throw new Error(`Invalid notification type: ${notification.type}`);
    }

    return {
      type: notification.type,
      title: notification.title.substring(0, 100), // Limit title length
      message: notification.message.substring(0, 500), // Limit message length
      priority: notification.priority || 'normal',
      icon: notification.icon || this.getDefaultIcon(notification.type),
      action: notification.action || null,
      data: notification.data || {},
      expiresAt: notification.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days default
    };
  }

  // Get default icon for notification type
  getDefaultIcon(type) {
    const iconMap = {
      bid_placed: '💰',
      auction_won: '🏆',
      auction_lost: '😔',
      auction_started: '🔥',
      auction_ended: '⏰',
      player_sold: '✅',
      achievement_earned: '🎖️',
      broadcast: '📢',
      system: '⚙️',
      warning: '⚠️',
      error: '❌',
      info: 'ℹ️'
    };

    return iconMap[type] || '🔔';
  }

  // Store notification in user's record (optional persistent storage)
  async storeUserNotification(userId, notification) {
    try {
      await User.findByIdAndUpdate(
        userId,
        {
          $push: {
            notifications: {
              $each: [notification],
              $slice: -50 // Keep only last 50 notifications
            }
          }
        }
      );
    } catch (error) {
      logger.error('Error storing user notification:', error);
      // Don't throw error here to avoid breaking the main notification flow
    }
  }

  // Create broadcast notification record
  async createBroadcastNotification(notification) {
    try {
      const broadcast = new Broadcast({
        message: `${notification.title}: ${notification.message}`,
        type: 'notification',
        priority: notification.priority,
        isSystem: true,
        isActive: true,
        metadata: {
          notificationType: notification.type,
          notificationId: notification.id
        }
      });

      await broadcast.save();
    } catch (error) {
      logger.error('Error creating broadcast notification:', error);
      // Don't throw error here
    }
  }

  // Auction-specific notification helpers
  async notifyBidPlaced(auctionId, bidData) {
    const notification = {
      type: 'bid_placed',
      title: 'New Bid Placed',
      message: `${bidData.bidderName} bid ${formatCurrency(bidData.amount)} on ${bidData.playerName}`,
      priority: 'normal',
      data: {
        auctionId,
        playerId: bidData.playerId,
        bidderId: bidData.bidderId,
        amount: bidData.amount
      }
    };

    await this.sendToAuctionRoom(auctionId, notification);
  }

  async notifyAuctionWon(winnerId, auctionData) {
    const notification = {
      type: 'auction_won',
      title: 'Congratulations! You Won!',
      message: `You won ${auctionData.playerName} for ${formatCurrency(auctionData.amount)}`,
      priority: 'high',
      data: {
        auctionId: auctionData.auctionId,
        playerId: auctionData.playerId,
        amount: auctionData.amount
      },
      action: {
        type: 'view_team',
        label: 'View Your Team'
      }
    };

    await this.sendToUser(winnerId, notification);
  }

  async notifyAuctionLost(loserId, auctionData) {
    const notification = {
      type: 'auction_lost',
      title: 'Auction Lost',
      message: `${auctionData.playerName} was sold to ${auctionData.winnerName} for ${formatCurrency(auctionData.amount)}`,
      priority: 'normal',
      data: {
        auctionId: auctionData.auctionId,
        playerId: auctionData.playerId,
        winnerId: auctionData.winnerId,
        amount: auctionData.amount
      }
    };

    await this.sendToUser(loserId, notification);
  }

  async notifyAuctionStarted(auctionData) {
    const notification = {
      type: 'auction_started',
      title: 'Auction Started!',
      message: `${auctionData.name} has started. Join now!`,
      priority: 'high',
      data: {
        auctionId: auctionData.id,
        auctionName: auctionData.name
      },
      action: {
        type: 'join_auction',
        label: 'Join Auction',
        url: `/auction/${auctionData.id}`
      }
    };

    await this.sendToAll(notification);
  }

  async notifyAuctionEnded(auctionData) {
    const notification = {
      type: 'auction_ended',
      title: 'Auction Ended',
      message: `${auctionData.name} has ended. Check the results!`,
      priority: 'normal',
      data: {
        auctionId: auctionData.id,
        auctionName: auctionData.name
      },
      action: {
        type: 'view_results',
        label: 'View Results'
      }
    };

    await this.sendToAll(notification);
  }

  async notifyPlayerSold(auctionId, playerData, winnerData) {
    const notification = {
      type: 'player_sold',
      title: 'Player Sold!',
      message: `${playerData.name} sold to ${winnerData.teamName} for ${formatCurrency(playerData.soldPrice)}`,
      priority: 'normal',
      data: {
        auctionId,
        playerId: playerData.id,
        winnerId: winnerData.id,
        amount: playerData.soldPrice
      }
    };

    await this.sendToAuctionRoom(auctionId, notification);
  }

  async notifyAchievementEarned(userId, achievementData) {
    const notification = {
      type: 'achievement_earned',
      title: 'Achievement Unlocked!',
      message: `You earned "${achievementData.name}" (+${achievementData.points} points)`,
      priority: 'high',
      icon: achievementData.icon,
      data: {
        achievementId: achievementData.id,
        points: achievementData.points
      },
      action: {
        type: 'view_achievements',
        label: 'View Achievements'
      }
    };

    await this.sendToUser(userId, notification);
  }

  // System notification helpers
  async notifySystemMaintenance(maintenanceData) {
    const notification = {
      type: 'system',
      title: 'System Maintenance',
      message: `Scheduled maintenance from ${maintenanceData.startTime} to ${maintenanceData.endTime}`,
      priority: 'high',
      data: maintenanceData
    };

    await this.sendToAll(notification);
  }

  async notifyBalanceUpdate(userId, balanceData) {
    const notification = {
      type: 'info',
      title: 'Balance Updated',
      message: `Your balance is now ${formatCurrency(balanceData.newBalance)}`,
      priority: 'low',
      data: {
        oldBalance: balanceData.oldBalance,
        newBalance: balanceData.newBalance,
        change: balanceData.change
      }
    };

    await this.sendToUser(userId, notification);
  }

  // Get user notifications (for persistent storage approach)
  async getUserNotifications(userId, page = 1, limit = 20, unreadOnly = false) {
    try {
      const user = await User.findById(userId).select('notifications');
      
      if (!user || !user.notifications) {
        return {
          notifications: [],
          pagination: { current: 1, total: 0, count: 0, hasNext: false, hasPrev: false }
        };
      }

      let notifications = user.notifications || [];
      
      // Filter unread if requested
      if (unreadOnly) {
        notifications = notifications.filter(n => !n.read);
      }

      // Sort by timestamp (newest first)
      notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Apply pagination
      const { skip, limit: pageLimit } = paginate(page, limit);
      const total = notifications.length;
      const paginatedNotifications = notifications.slice(skip, skip + pageLimit);

      return {
        notifications: paginatedNotifications,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / pageLimit),
          count: total,
          hasNext: skip + pageLimit < total,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      logger.error('Error fetching user notifications:', error);
      throw new Error('Failed to fetch notifications');
    }
  }

  // Mark notification as read
  async markNotificationAsRead(userId, notificationId) {
    try {
      await User.updateOne(
        { _id: userId, 'notifications.id': notificationId },
        { $set: { 'notifications.$.read': true, 'notifications.$.readAt': new Date() } }
      );

      return { success: true };
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      throw error;
    }
  }

  // Mark all notifications as read for user
  async markAllNotificationsAsRead(userId) {
    try {
      await User.updateOne(
        { _id: userId },
        { 
          $set: { 
            'notifications.$[].read': true,
            'notifications.$[].readAt': new Date()
          } 
        }
      );

      return { success: true };
    } catch (error) {
      logger.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  // Get notification statistics for admin
  async getNotificationStats() {
    try {
      // This would require implementing notification tracking in the database
      // For now, return basic stats from broadcasts
      const stats = await Broadcast.aggregate([
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            delivered: { $sum: '$deliveryStats.delivered' },
            failed: { $sum: '$deliveryStats.failed' }
          }
        }
      ]);

      return {
        totalNotifications: stats.reduce((sum, stat) => sum + stat.count, 0),
        deliveredNotifications: stats.reduce((sum, stat) => sum + stat.delivered, 0),
        failedNotifications: stats.reduce((sum, stat) => sum + stat.failed, 0),
        byType: stats.reduce((acc, stat) => {
          acc[stat._id] = {
            count: stat.count,
            delivered: stat.delivered,
            failed: stat.failed
          };
          return acc;
        }, {})
      };
    } catch (error) {
      logger.error('Error fetching notification stats:', error);
      throw new Error('Failed to fetch notification statistics');
    }
  }
}

export default new NotificationService();