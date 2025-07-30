// src/services/userService.js

const User = require('../models/User');
const Player = require('../models/Player');
const Broadcast = require('../models/Broadcast');
const { logger } = require('../utils/logger');

class UserService {
  // Get user profile with statistics
  async getUserProfile(userId) {
    try {
      const user = await User.findById(userId).select('-password');
      
      if (!user) {
        throw new Error('User not found');
      }

      // Get user's players
      const players = await Player.find({ 
        soldTo: userId,
        status: 'sold'
      }).sort({ soldPrice: -1 });

      // Calculate detailed statistics
      const stats = await user.getStatistics();

      return {
        user,
        players,
        stats
      };

    } catch (error) {
      logger.error('Get user profile error:', error.message);
      throw error;
    }
  }

  // Update user profile
  async updateUserProfile(userId, updates) {
    try {
      const allowedUpdates = ['name', 'teamName'];
      const filteredUpdates = {};

      // Filter allowed updates
      Object.keys(updates).forEach(key => {
        if (allowedUpdates.includes(key) && updates[key] !== undefined) {
          filteredUpdates[key] = updates[key];
        }
      });

      const user = await User.findByIdAndUpdate(
        userId,
        filteredUpdates,
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        throw new Error('User not found');
      }

      logger.info(`User profile updated: ${user.username} (${userId})`);
      return user;

    } catch (error) {
      logger.error('Update user profile error:', error.message);
      throw error;
    }
  }

  // Upload user avatar
  async uploadUserAvatar(userId, imageBuffer, filename) {
    try {
      const imageService = require('./imageService');
      
      // Upload to Imgur
      const imageUrl = await imageService.uploadBuffer(imageBuffer, filename);

      // Update user avatar URL
      const user = await User.findByIdAndUpdate(
        userId,
        { avatarUrl: imageUrl },
        { new: true }
      ).select('-password');

      if (!user) {
        throw new Error('User not found');
      }

      logger.info(`Avatar uploaded for user: ${user.username} (${userId})`);
      return { user, imageUrl };

    } catch (error) {
      logger.error('Upload user avatar error:', error.message);
      throw error;
    }
  }

  // Get user's team (players)
  async getUserTeam(userId) {
    try {
      const user = await User.findById(userId).select('name username teamName balance');
      
      if (!user) {
        throw new Error('User not found');
      }

      const players = await Player.find({ 
        soldTo: userId,
        status: 'sold'
      }).sort({ category: 1, soldPrice: -1 });

      // Group players by category
      const playersByCategory = players.reduce((acc, player) => {
        const category = player.category || 'OTHERS';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(player);
        return acc;
      }, {});

      // Calculate team statistics
      const totalSpent = players.reduce((sum, player) => sum + (player.soldPrice || 0), 0);
      const averagePlayerCost = players.length > 0 ? totalSpent / players.length : 0;

      const teamStats = {
        totalPlayers: players.length,
        totalSpent,
        remainingBalance: user.balance,
        averagePlayerCost: Math.round(averagePlayerCost),
        playersByCategory,
        categoryBreakdown: Object.keys(playersByCategory).map(category => ({
          category,
          count: playersByCategory[category].length,
          totalSpent: playersByCategory[category].reduce((sum, p) => sum + (p.soldPrice || 0), 0)
        }))
      };

      return {
        user,
        players,
        teamStats
      };

    } catch (error) {
      logger.error('Get user team error:', error.message);
      throw error;
    }
  }

  // Get user notifications
  async getUserNotifications(userId, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;

      // Get broadcasts targeted to this user
      const notifications = await Broadcast.getForUser(userId, limit);

      // Mark notifications as delivered (for analytics)
      for (const notification of notifications) {
        await notification.markDelivered(userId);
      }

      return {
        notifications,
        pagination: {
          currentPage: page,
          hasMore: notifications.length === limit
        }
      };

    } catch (error) {
      logger.error('Get user notifications error:', error.message);
      throw error;
    }
  }

  // Mark notification as read
  async markNotificationRead(userId, notificationId) {
    try {
      const notification = await Broadcast.findById(notificationId);
      
      if (!notification) {
        throw new Error('Notification not found');
      }

      await notification.markRead(userId);

      logger.info(`Notification marked as read: ${notificationId} by user ${userId}`);
      return notification;

    } catch (error) {
      logger.error('Mark notification read error:', error.message);
      throw error;
    }
  }

  // Get user achievements
  async getUserAchievements(userId) {
    try {
      const user = await User.findById(userId).select('achievements points');
      
      if (!user) {
        throw new Error('User not found');
      }

      const Settings = require('../models/Settings');
      const settings = await Settings.getSettings();
      const allAchievements = settings.achievements;

      // Separate earned and available achievements
      const earnedAchievements = user.achievements || [];
      const earnedIds = earnedAchievements.map(a => a.id);
      
      const availableAchievements = allAchievements.filter(a => 
        a.isActive && !earnedIds.includes(a.id)
      );

      return {
        earned: earnedAchievements,
        available: availableAchievements,
        totalPoints: user.points,
        completionRate: Math.round((earnedAchievements.length / allAchievements.length) * 100)
      };

    } catch (error) {
      logger.error('Get user achievements error:', error.message);
      throw error;
    }
  }

  // Get all managers (public view)
  async getAllManagers(page = 1, limit = 20, search = null) {
    try {
      const offset = (page - 1) * limit;
      
      let query = { role: 'manager', isActive: true };
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } },
          { teamName: { $regex: search, $options: 'i' } }
        ];
      }

      const managers = await User.find(query)
        .select('name username teamName balance points auctionsWon avatarUrl')
        .sort({ points: -1, name: 1 })
        .skip(offset)
        .limit(limit);

      const total = await User.countDocuments(query);

      // Get player counts for each manager
      const managersWithStats = await Promise.all(
        managers.map(async (manager) => {
          const playerCount = await Player.countDocuments({ 
            soldTo: manager._id, 
            status: 'sold' 
          });
          
          return {
            ...manager.toObject(),
            playerCount
          };
        })
      );

      return {
        managers: managersWithStats,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          hasNext: offset + managers.length < total,
          hasPrev: page > 1
        }
      };

    } catch (error) {
      logger.error('Get all managers error:', error.message);
      throw error;
    }
  }

  // Get single manager details (public view)
  async getManagerDetails(managerId) {
    try {
      const manager = await User.findOne({ _id: managerId, role: 'manager', isActive: true })
        .select('name username teamName balance points auctionsWon totalSpent avatarUrl createdAt');

      if (!manager) {
        throw new Error('Manager not found');
      }

      // Get manager's players
      const players = await Player.find({ 
        soldTo: managerId, 
        status: 'sold' 
      }).sort({ soldPrice: -1 });

      // Calculate statistics
      const stats = await manager.getStatistics();

      return {
        manager,
        players,
        stats
      };

    } catch (error) {
      logger.error('Get manager details error:', error.message);
      throw error;
    }
  }

  // Change user password
  async changeUserPassword(userId, currentPassword, newPassword) {
    try {
      const user = await User.findById(userId).select('+password');
      
      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isValidPassword = await user.comparePassword(currentPassword);
      if (!isValidPassword) {
        throw new Error('Current password is incorrect');
      }

      // Update password
      user.password = newPassword;
      await user.save();

      logger.info(`Password changed for user: ${user.username} (${userId})`);
      return { success: true };

    } catch (error) {
      logger.error('Change user password error:', error.message);
      throw error;
    }
  }

  // Deactivate user account
  async deactivateUser(userId) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { isActive: false },
        { new: true }
      ).select('-password');

      if (!user) {
        throw new Error('User not found');
      }

      logger.info(`User account deactivated: ${user.username} (${userId})`);
      return user;

    } catch (error) {
      logger.error('Deactivate user error:', error.message);
      throw error;
    }
  }

  // Get user activity summary
  async getUserActivitySummary(userId) {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      const Bid = require('../models/Bid');
      const Auction = require('../models/Auction');

      // Get recent bids
      const recentBids = await Bid.find({ bidder: userId })
        .populate('player', 'name category')
        .populate('auction', 'name')
        .sort({ placedAt: -1 })
        .limit(10);

      // Get participated auctions
      const participatedAuctions = await Auction.find({ 
        participants: userId 
      })
        .select('name status startTime endTime')
        .sort({ startTime: -1 })
        .limit(5);

      // Get achievements progress
      const achievements = await this.getUserAchievements(userId);

      return {
        user: {
          id: user._id,
          name: user.name,
          username: user.username,
          points: user.points,
          balance: user.balance,
          bidCount: user.bidCount,
          auctionsWon: user.auctionsWon
        },
        recentBids,
        participatedAuctions,
        achievements: achievements.earned.slice(-5), // Last 5 achievements
        stats: await user.getStatistics()
      };

    } catch (error) {
      logger.error('Get user activity summary error:', error.message);
      throw error;
    }
  }

  // Update user notification settings
  async updateNotificationSettings(userId, settings) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { notificationSettings: settings },
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        throw new Error('User not found');
      }

      logger.info(`Notification settings updated for user: ${user.username} (${userId})`);
      return user.notificationSettings;

    } catch (error) {
      logger.error('Update notification settings error:', error.message);
      throw error;
    }
  }
}

module.exports = new UserService();