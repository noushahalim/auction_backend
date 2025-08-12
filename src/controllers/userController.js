// src/controllers/userController.js

import { validationResult } from 'express-validator';
import User from '../models/User.js';
import Player from '../models/Player.js';
import Broadcast from '../models/Broadcast.js';
import imageService from '../services/imageService.js';
import { logger } from '../utils/logger.js';

// Get current user profile
export const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');

    // Get user's players
    const players = await Player.find({ 
      soldTo: user._id,
      status: 'sold'
    }).sort({ soldPrice: -1 });

    // Calculate stats
    const totalSpent = players.reduce((sum, player) => sum + (player.soldPrice || 0), 0);
    const playersByCategory = players.reduce((acc, player) => {
      acc[player.category] = (acc[player.category] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        user,
        players,
        stats: {
          totalPlayers: players.length,
          totalSpent,
          remainingBalance: user.balance,
          playersByCategory,
          achievements: user.achievements.length
        }
      }
    });

  } catch (error) {
    logger.error('Get profile error:', error);
    next(error);
  }
};

// Update user profile
export const updateProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, teamName } = req.body;
    const updates = {};

    if (name) updates.name = name.trim();
    if (teamName) updates.teamName = teamName.trim();

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    logger.info(`Profile updated for user ${user.username}`);

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    logger.error('Update profile error:', error);
    next(error);
  }
};

// Upload avatar
export const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }

    // Upload to Imgur
    const imageUrl = await imageService.uploadBuffer(req.file.buffer);

    // Update user avatar
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatarUrl: imageUrl },
      { new: true }
    ).select('-password');

    logger.info(`Avatar updated for user ${user.username}`);

    res.json({
      success: true,
      data: {
        avatarUrl: imageUrl,
        user
      }
    });

  } catch (error) {
    logger.error('Upload avatar error:', error);
    next(error);
  }
};

// Get user's team
export const getTeam = async (req, res, next) => {
  try {
    const players = await Player.find({ 
      soldTo: req.user._id,
      status: 'sold'
    }).sort({ category: 1, soldPrice: -1 });

    // Group by category
    const playersByCategory = players.reduce((acc, player) => {
      if (!acc[player.category]) {
        acc[player.category] = [];
      }
      acc[player.category].push(player);
      return acc;
    }, {});

    // Calculate spending stats
    const totalSpent = players.reduce((sum, player) => sum + (player.soldPrice || 0), 0);
    const spendingByCategory = Object.keys(playersByCategory).reduce((acc, category) => {
      acc[category] = playersByCategory[category].reduce((sum, player) => sum + (player.soldPrice || 0), 0);
      return acc;
    }, {});

    const user = await User.findById(req.user._id);

    res.json({
      success: true,
      data: {
        players,
        playersByCategory,
        stats: {
          totalPlayers: players.length,
          totalSpent,
          remainingBalance: user.balance,
          spendingByCategory,
          averagePlayerPrice: players.length > 0 ? totalSpent / players.length : 0
        }
      }
    });

  } catch (error) {
    logger.error('Get team error:', error);
    next(error);
  }
};

// Get all managers (public view)
export const getAllManagers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, sortBy = 'points' } = req.query;
    const skip = (page - 1) * limit;

    const query = { role: 'manager', isActive: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { teamName: { $regex: search, $options: 'i' } }
      ];
    }

    let sortQuery = {};
    switch (sortBy) {
      case 'points':
        sortQuery = { points: -1, name: 1 };
        break;
      case 'name':
        sortQuery = { name: 1 };
        break;
      case 'balance':
        sortQuery = { balance: -1 };
        break;
      default:
        sortQuery = { points: -1, name: 1 };
    }

    const managers = await User.find(query)
                              .select('name username teamName balance points avatarUrl auctionsWon createdAt')
                              .sort(sortQuery)
                              .limit(parseInt(limit))
                              .skip(skip);

    const total = await User.countDocuments(query);

    // Get player counts for each manager
    const managersWithStats = await Promise.all(
      managers.map(async (manager) => {
        const playerCount = await Player.countDocuments({ 
          soldTo: manager._id,
          status: 'sold'
        });

        const totalSpent = await Player.aggregate([
          { $match: { soldTo: manager._id, status: 'sold' } },
          { $group: { _id: null, total: { $sum: '$soldPrice' } } }
        ]);

        return {
          ...manager.toJSON(),
          playerCount,
          totalSpent: totalSpent[0]?.total || 0
        };
      })
    );

    res.json({
      success: true,
      data: {
        managers: managersWithStats,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    logger.error('Get all managers error:', error);
    next(error);
  }
};

// Get single manager details (public view)
export const getManager = async (req, res, next) => {
  try {
    const { id } = req.params;

    const manager = await User.findOne({ 
      _id: id, 
      role: 'manager',
      isActive: true 
    }).select('name username teamName balance points avatarUrl auctionsWon createdAt');

    if (!manager) {
      return res.status(404).json({
        success: false,
        error: 'Manager not found'
      });
    }

    // Get manager's players (public view)
    const players = await Player.find({ 
      soldTo: manager._id,
      status: 'sold'
    }).select('name category baseValue soldPrice imageUrl')
      .sort({ soldPrice: -1 });

    // Calculate stats
    const totalSpent = players.reduce((sum, player) => sum + (player.soldPrice || 0), 0);
    const playersByCategory = players.reduce((acc, player) => {
      if (!acc[player.category]) {
        acc[player.category] = {
          count: 0,
          totalSpent: 0,
          players: []
        };
      }
      acc[player.category].count++;
      acc[player.category].totalSpent += player.soldPrice || 0;
      acc[player.category].players.push(player);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        manager,
        players,
        playersByCategory,
        stats: {
          totalPlayers: players.length,
          totalSpent,
          remainingBalance: manager.balance,
          averagePlayerPrice: players.length > 0 ? totalSpent / players.length : 0
        }
      }
    });

  } catch (error) {
    logger.error('Get manager error:', error);
    next(error);
  }
};

// Get user notifications
export const getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const userRole = req.user.role === 'admin' ? 'admin' : 'manager';

    const broadcasts = await Broadcast.getActiveForUser(userRole);

    // Mark notifications as read (optional - you might want to handle this separately)
    // broadcasts.forEach(broadcast => {
    //   broadcast.markAsRead(req.user._id);
    //   broadcast.save();
    // });

    const paginatedBroadcasts = broadcasts.slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      data: {
        notifications: paginatedBroadcasts,
        unreadCount: broadcasts.filter(b => 
          !b.readBy.some(r => r.userId.toString() === req.user._id.toString())
        ).length,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(broadcasts.length / limit),
          total: broadcasts.length
        }
      }
    });

  } catch (error) {
    logger.error('Get notifications error:', error);
    next(error);
  }
};

// Mark notification as read
export const markNotificationRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    const broadcast = await Broadcast.findById(id);
    if (!broadcast) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    broadcast.markAsRead(req.user._id);
    await broadcast.save();

    res.json({
      success: true,
      message: 'Notification marked as read'
    });

  } catch (error) {
    logger.error('Mark notification read error:', error);
    next(error);
  }
};

// Get user achievements
export const getAchievements = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('achievements points bidCount auctionsWon');
    const settings = await import('../models/Settings.js').getSettings();

    // Get available achievements from settings
    const availableAchievements = settings.achievements.map(achievement => {
      const userAchievement = user.achievements.find(ua => ua.id === achievement.id);

      return {
        ...achievement.toJSON(),
        achieved: !!userAchievement,
        achievedAt: userAchievement?.achievedAt,
        progress: calculateAchievementProgress(achievement, user)
      };
    });

    res.json({
      success: true,
      data: {
        achievements: availableAchievements,
        totalPoints: user.points,
        totalAchievements: user.achievements.length,
        stats: {
          bidCount: user.bidCount,
          auctionsWon: user.auctionsWon
        }
      }
    });

  } catch (error) {
    logger.error('Get achievements error:', error);
    next(error);
  }
};

// Helper function to calculate achievement progress
function calculateAchievementProgress(achievement, user) {
  switch (achievement.criteria.type) {
    case 'first_bid':
      return user.bidCount > 0 ? 100 : 0;
    case 'auction_win':
      return user.auctionsWon > 0 ? 100 : 0;
    case 'per_bid':
      return Math.min(100, (user.bidCount / 100) * 100); // Show progress up to 100 bids
    case 'auction_wins':
      return Math.min(100, (user.auctionsWon / achievement.criteria.count) * 100);
    case 'high_bid':
      // This would need to be calculated based on actual bid history
      return 0; // Placeholder
    default:
      return 0;
  }
}

export default { getProfile, updateProfile, uploadAvatar, getTeam, getAllManagers, getManager, getNotifications, markNotificationRead, getAchievements };