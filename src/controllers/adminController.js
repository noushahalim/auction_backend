// src/controllers/adminController.js

import { validationResult } from 'express-validator';
import User from '../models/User.js';
import Player from '../models/Player.js';
import Auction from '../models/Auction.js';
import Request from '../models/Request.js';
import Settings from '../models/Settings.js';
import Broadcast from '../models/Broadcast.js';
import imageService from '../services/imageService.js';
import { logger } from '../utils/logger.js';

// Registration Requests Management

// Get all registration requests
export const getRequests = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status = 'pending' } = req.query;
    const offset = (page - 1) * limit;

    const requests = await Request.find({ status })
      .populate('reviewedBy', 'name username')
      .select('-password -code')
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(parseInt(limit));

    const total = await Request.countDocuments({ status });

    res.json({
      success: true,
      data: {
        requests,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          hasNext: offset + requests.length < total,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    logger.error('Get requests error:', error.message);
    next(error);
  }
};

// Approve registration request
export const approveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { teamName, balance, role = 'manager' } = req.body;
    const adminId = req.user._id;

    const request = await Request.findById(id);
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Registration request not found'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Only pending requests can be approved'
      });
    }

    // Approve the request
    const result = await request.approve(adminId, {
      teamName,
      balance,
      role
    });

    logger.info(`Registration request approved: ${request.username} by admin ${req.user.username}`);

    res.json({
      success: true,
      message: 'Registration request approved successfully',
      data: {
        request: result.request,
        user: result.user
      }
    });

  } catch (error) {
    logger.error('Approve request error:', error.message);
    
    if (error.message === 'Username is no longer available') {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }
    
    next(error);
  }
};

// Reject registration request
export const rejectRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;

    const request = await Request.findById(id);
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Registration request not found'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Only pending requests can be rejected'
      });
    }

    // Reject the request
    await request.reject(adminId, reason);

    logger.info(`Registration request rejected: ${request.username} by admin ${req.user.username}`);

    res.json({
      success: true,
      message: 'Registration request rejected successfully',
      data: request
    });

  } catch (error) {
    logger.error('Reject request error:', error.message);
    next(error);
  }
};

// Manager Management

// Get all managers
export const getAllManagers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;

    let query = { role: 'manager' };
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { teamName: { $regex: search, $options: 'i' } }
      ];
    }

    const managers = await User.find(query)
      .select('name username teamName balance points auctionsWon totalSpent isActive avatarUrl createdAt lastLogin')
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(parseInt(limit));

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

    res.json({
      success: true,
      data: {
        managers: managersWithStats,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          hasNext: offset + managers.length < total,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    logger.error('Get all managers error:', error.message);
    next(error);
  }
};

// Get single manager details
export const getManager = async (req, res, next) => {
  try {
    const { id } = req.params;

    const manager = await User.findOne({ _id: id, role: 'manager' })
      .select('-password');

    if (!manager) {
      return res.status(404).json({
        success: false,
        error: 'Manager not found'
      });
    }

    // Get manager's players
    const players = await Player.find({ 
      soldTo: manager._id, 
      status: 'sold' 
    }).sort({ soldPrice: -1 });

    // Get manager statistics
    const stats = await manager.getStatistics();

    res.json({
      success: true,
      data: {
        manager,
        players,
        stats
      }
    });

  } catch (error) {
    logger.error('Get manager error:', error.message);
    next(error);
  }
};

// Update manager details
export const updateManager = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, teamName, balance, isActive } = req.body;

    const manager = await User.findOne({ _id: id, role: 'manager' });
    if (!manager) {
      return res.status(404).json({
        success: false,
        error: 'Manager not found'
      });
    }

    // Update fields
    if (name !== undefined) manager.name = name.trim();
    if (teamName !== undefined) manager.teamName = teamName.trim();
    if (balance !== undefined) {
      if (balance < 0) {
        return res.status(400).json({
          success: false,
          error: 'Balance cannot be negative'
        });
      }
      manager.balance = balance;
    }
    if (isActive !== undefined) manager.isActive = isActive;

    await manager.save();

    logger.info(`Manager updated: ${manager.username} by admin ${req.user.username}`);

    res.json({
      success: true,
      message: 'Manager updated successfully',
      data: manager
    });

  } catch (error) {
    logger.error('Update manager error:', error.message);
    next(error);
  }
};

// Player Management

// Get all players
export const getAllPlayers = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, category, status, search } = req.query;
    const offset = (page - 1) * limit;

    let query = {};
    
    if (category) query.category = category.toUpperCase();
    if (status) query.status = status;
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const players = await Player.find(query)
      .populate('soldTo', 'name username teamName')
      .populate('auctionId', 'name')
      .sort({ category: 1, name: 1 })
      .skip(offset)
      .limit(parseInt(limit));

    const total = await Player.countDocuments(query);

    res.json({
      success: true,
      data: {
        players,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          hasNext: offset + players.length < total,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    logger.error('Get all players error:', error.message);
    next(error);
  }
};

// Create new player
export const createPlayer = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, category, baseValue, description, position, nationality, age, rating } = req.body;

    // Handle image upload if present
    let imageUrl = null;
    if (req.file) {
      imageUrl = await imageService.uploadBuffer(req.file.buffer, `player_${name}`);
    }

    const player = new Player({
      name: name.trim(),
      category: category.toUpperCase(),
      baseValue,
      imageUrl,
      description,
      position,
      nationality,
      age,
      rating,
      isActive: true
    });

    await player.save();

    logger.info(`Player created: ${player.name} (${player.category}) by admin ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Player created successfully',
      data: player
    });

  } catch (error) {
    logger.error('Create player error:', error.message);
    next(error);
  }
};

// Update player
export const updatePlayer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, category, baseValue, description, position, nationality, age, rating, isActive } = req.body;

    const player = await Player.findById(id);
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    // Handle image upload if present
    if (req.file) {
      const imageUrl = await imageService.uploadBuffer(req.file.buffer, `player_${name || player.name}`);
      player.imageUrl = imageUrl;
    }

    // Update fields
    if (name !== undefined) player.name = name.trim();
    if (category !== undefined) player.category = category.toUpperCase();
    if (baseValue !== undefined) player.baseValue = baseValue;
    if (description !== undefined) player.description = description;
    if (position !== undefined) player.position = position;
    if (nationality !== undefined) player.nationality = nationality;
    if (age !== undefined) player.age = age;
    if (rating !== undefined) player.rating = rating;
    if (isActive !== undefined) player.isActive = isActive;

    await player.save();

    logger.info(`Player updated: ${player.name} by admin ${req.user.username}`);

    res.json({
      success: true,
      message: 'Player updated successfully',
      data: player
    });

  } catch (error) {
    logger.error('Update player error:', error.message);
    next(error);
  }
};

// Delete player
export const deletePlayer = async (req, res, next) => {
  try {
    const { id } = req.params;

    const player = await Player.findById(id);
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    if (player.status === 'sold') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete sold players. Please unsell them first.'
      });
    }

    await Player.findByIdAndDelete(id);

    logger.info(`Player deleted: ${player.name} by admin ${req.user.username}`);

    res.json({
      success: true,
      message: 'Player deleted successfully'
    });

  } catch (error) {
    logger.error('Delete player error:', error.message);
    next(error);
  }
};

// Bulk operations for players
export const bulkUpdatePlayers = async (req, res, next) => {
  try {
    const { action, playerIds, category } = req.body;

    if (!action || !Array.isArray(playerIds) || playerIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bulk operation parameters'
      });
    }

    let updateData = {};
    let result;

    switch (action) {
      case 'enable':
        updateData = { isActive: true };
        break;
      case 'disable':
        updateData = { isActive: false };
        break;
      case 'reset':
        updateData = {
          status: 'available',
          soldTo: null,
          soldPrice: null,
          soldAt: null,
          currentBid: 0,
          currentBidder: null,
          totalBids: 0,
          biddingStarted: false,
          votes: { likes: [], dislikes: [] },
          isSkipped: false
        };
        break;
      case 'move_category':
        if (!category) {
          return res.status(400).json({
            success: false,
            error: 'Category is required for move operation'
          });
        }
        updateData = { category: category.toUpperCase() };
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action'
        });
    }

    result = await Player.updateMany(
      { _id: { $in: playerIds } },
      updateData
    );

    logger.info(`Bulk player operation: ${action} on ${playerIds.length} players by admin ${req.user.username}`);

    res.json({
      success: true,
      message: `Bulk operation ${action} completed successfully`,
      data: {
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount
      }
    });

  } catch (error) {
    logger.error('Bulk update players error:', error.message);
    next(error);
  }
};

// Auction Management

// Create new auction
export const createAuction = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, description, startTime, categories, categoryFlow, mode = 'auto', timerDuration } = req.body;

    // Check if there's already an ongoing auction
    const existingAuction = await Auction.findOne({ 
      status: { $in: ['ongoing', 'paused'] } 
    });

    if (existingAuction) {
      return res.status(400).json({
        success: false,
        error: 'There is already an ongoing auction. Complete or stop it first.'
      });
    }

    const auction = new Auction({
      name: name.trim(),
      description: description?.trim(),
      startTime: new Date(startTime),
      categories: categories.map(c => c.toUpperCase()),
      categoryFlow: categoryFlow.map(c => c.toUpperCase()),
      mode,
      timerDuration: timerDuration || 60,
      createdBy: req.user._id,
      status: 'upcoming'
    });

    await auction.save();

    logger.info(`Auction created: ${auction.name} by admin ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Auction created successfully',
      data: auction
    });

  } catch (error) {
    logger.error('Create auction error:', error.message);
    next(error);
  }
};

// Settings Management

// Get application settings
export const getSettings = async (req, res, next) => {
  try {
    const settings = await Settings.getSettings();

    res.json({
      success: true,
      data: settings
    });

  } catch (error) {
    logger.error('Get settings error:', error.message);
    next(error);
  }
};

// Update application settings
export const updateSettings = async (req, res, next) => {
  try {
    const updates = req.body;
    const adminId = req.user._id;

    const settings = await Settings.updateSettings(updates, adminId);

    logger.info(`Settings updated by admin ${req.user.username}`);

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: settings
    });

  } catch (error) {
    logger.error('Update settings error:', error.message);
    next(error);
  }
};

// Broadcast Management

// Get all broadcasts
export const getAllBroadcasts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, type } = req.query;
    const offset = (page - 1) * limit;

    let query = {};
    if (status) query.status = status;
    if (type) query.type = type;

    const broadcasts = await Broadcast.find(query)
      .populate('sentBy', 'name username')
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(parseInt(limit));

    const total = await Broadcast.countDocuments(query);

    res.json({
      success: true,
      data: {
        broadcasts,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          hasNext: offset + broadcasts.length < total,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    logger.error('Get all broadcasts error:', error.message);
    next(error);
  }
};

// Create and send broadcast
export const createBroadcast = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { title, message, type = 'general', priority = 'medium', targetAudience = 'all', targetUsers } = req.body;

    const broadcast = new Broadcast({
      title: title.trim(),
      message: message.trim(),
      type,
      priority,
      targetAudience,
      targetUsers: targetUsers || [],
      sentBy: req.user._id,
      senderName: req.user.name,
      status: 'draft'
    });

    await broadcast.save();

    // Send the broadcast
    const result = await broadcast.send();

    // Emit socket event to all users
    if (req.app.get('io')) {
      req.app.get('io').emit('broadcast', {
        id: broadcast._id,
        title: broadcast.title,
        message: broadcast.message,
        type: broadcast.type,
        priority: broadcast.priority,
        sentAt: broadcast.sentAt
      });
    }

    logger.info(`Broadcast sent: "${title}" to ${result.recipients.length} recipients by admin ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Broadcast sent successfully',
      data: {
        broadcast: result.broadcast,
        recipientCount: result.recipients.length
      }
    });

  } catch (error) {
    logger.error('Create broadcast error:', error.message);
    next(error);
  }
};

// Delete broadcast
export const deleteBroadcast = async (req, res, next) => {
  try {
    const { id } = req.params;

    const broadcast = await Broadcast.findById(id);
    if (!broadcast) {
      return res.status(404).json({
        success: false,
        error: 'Broadcast not found'
      });
    }

    await Broadcast.findByIdAndDelete(id);

    logger.info(`Broadcast deleted: ${broadcast.title} by admin ${req.user.username}`);

    res.json({
      success: true,
      message: 'Broadcast deleted successfully'
    });

  } catch (error) {
    logger.error('Delete broadcast error:', error.message);
    next(error);
  }
};

// Get admin dashboard statistics
export const getDashboardStats = async (req, res, next) => {
  try {
    const [
      totalManagers,
      activeManagers,
      totalPlayers,
      soldPlayers,
      pendingRequests,
      ongoingAuctions,
      totalBroadcasts
    ] = await Promise.all([
      User.countDocuments({ role: 'manager' }),
      User.countDocuments({ role: 'manager', isActive: true }),
      Player.countDocuments(),
      Player.countDocuments({ status: 'sold' }),
      Request.countDocuments({ status: 'pending' }),
      Auction.countDocuments({ status: { $in: ['ongoing', 'paused'] } }),
      Broadcast.countDocuments({ status: 'sent' })
    ]);

    const stats = {
      users: {
        total: totalManagers,
        active: activeManagers,
        inactive: totalManagers - activeManagers
      },
      players: {
        total: totalPlayers,
        sold: soldPlayers,
        available: totalPlayers - soldPlayers
      },
      requests: {
        pending: pendingRequests
      },
      auctions: {
        ongoing: ongoingAuctions
      },
      broadcasts: {
        total: totalBroadcasts
      }
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('Get dashboard stats error:', error.message);
    next(error);
  }
};

export default { getRequests, approveRequest, rejectRequest, getAllManagers, getManager, updateManager, getAllPlayers, createPlayer, updatePlayer, deletePlayer, bulkUpdatePlayers, createAuction, getSettings, updateSettings, getAllBroadcasts, createBroadcast, deleteBroadcast, getDashboardStats };