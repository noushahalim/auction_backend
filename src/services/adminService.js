// src/services/adminService.js

import User from '../models/User.js';
import Request from '../models/Request.js';
import Player from '../models/Player.js';
import Auction from '../models/Auction.js';
import Settings from '../models/Settings.js';
import Broadcast from '../models/Broadcast.js';
import Achievement from '../models/Achievement.js';
import { logger } from '../utils/logger.js';
import { withTransaction, paginate } from '../utils/database.js';
import argon2 from 'argon2';

class AdminService {
  // User Registration Requests Management
  async getRegistrationRequests(page = 1, limit = 10, status = 'pending') {
    try {
      const { skip, limit: pageLimit } = paginate(page, limit);
      const filter = status === 'all' ? {} : { status };

      const [requests, total] = await Promise.all([
        Request.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageLimit)
          .select('-password'), // Don't return passwords
        Request.countDocuments(filter)
      ]);

      return {
        requests,
        pagination: {
          current: parseInt(page, 10),
          total: Math.ceil(total / pageLimit),
          count: total,
          hasNext: skip + pageLimit < total,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      logger.error('Error fetching registration requests:', error);
      throw new Error('Failed to fetch registration requests');
    }
  }

  async approveRegistrationRequest(requestId, approvalData) {
    return withTransaction(async (session) => {
      const request = await Request.findById(requestId).session(session);
      if (!request) throw new Error('Registration request not found');
      if (request.status !== 'pending') throw new Error('Request has already been processed');

      // Check username availability
      const existingUser = await User.findOne({ username: request.username }).session(session);
      if (existingUser) throw new Error('Username is already taken');

      // Create new user
      const settings = await Settings.findOne().session(session);
      const defaultBalance =
        settings?.budget?.baseBudget ||
        parseInt(process.env.BASE_BUDGET, 10) ||
        200_000_000;

      const newUser = new User({
        name: request.name,
        username: request.username,
        password: request.password, // already hashed
        role: 'manager',
        balance: approvalData.initialBalance ?? defaultBalance,
        teamName: approvalData.teamName || `Team ${request.name}`,
        isActive: true,
        isApproved: true,
        approvedBy: approvalData.approvedBy,
        approvedAt: new Date()
      });

      const savedUser = await newUser.save({ session });

      // Mark request approved
      request.status = 'approved';
      request.processedAt = new Date();
      request.processedBy = approvalData.approvedBy;
      await request.save({ session });

      logger.info('Registration request approved', {
        requestId,
        userId: savedUser._id.toString(),
        username: savedUser.username,
        approvedBy: approvalData.approvedBy
      });

      return { user: savedUser, request };
    });
  }

  async rejectRegistrationRequest(requestId, rejectionData) {
    const request = await Request.findById(requestId);
    if (!request) throw new Error('Registration request not found');
    if (request.status !== 'pending') throw new Error('Request has already been processed');

    request.status = 'rejected';
    request.rejectionReason = rejectionData.reason;
    request.processedAt = new Date();
    request.processedBy = rejectionData.rejectedBy;

    const updatedRequest = await request.save();

    logger.info('Registration request rejected', {
      requestId,
      reason: rejectionData.reason,
      rejectedBy: rejectionData.rejectedBy
    });

    return updatedRequest;
  }

  // Manager Management
  async getAllManagers(page = 1, limit = 20, search = '', sortBy = 'createdAt', sortOrder = 'desc') {
    const { skip, limit: pageLimit } = paginate(page, limit);

    const searchFilter = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { username: { $regex: search, $options: 'i' } },
            { teamName: { $regex: search, $options: 'i' } }
          ]
        }
      : {};

    const filter = { role: 'manager', ...searchFilter };
    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [managers, total] = await Promise.all([
      User.find(filter)
        .select('-password')
        .sort(sortOptions)
        .skip(skip)
        .limit(pageLimit)
        .populate('achievements.id', 'name icon points'),
      User.countDocuments(filter)
    ]);

    return {
      managers,
      pagination: {
        current: parseInt(page, 10),
        total: Math.ceil(total / pageLimit),
        count: total,
        hasNext: skip + pageLimit < total,
        hasPrev: page > 1
      }
    };
  }

  async getManagerById(managerId) {
    const manager = await User.findById(managerId)
      .select('-password')
      .populate('achievements.id', 'name icon points description');
    if (!manager || manager.role !== 'manager') throw new Error('Manager not found');

    const players = await Player.find({ soldTo: managerId })
      .select('name category baseValue soldPrice imageUrl');

    const totalSpent = players.reduce((sum, p) => sum + (p.soldPrice || 0), 0);
    const playersByCategory = players.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1;
      return acc;
    }, {});

    return {
      manager,
      players,
      stats: {
        totalPlayers: players.length,
        totalSpent,
        remainingBalance: manager.balance,
        playersByCategory,
        achievementCount: manager.achievements.length,
        totalPoints: manager.points
      }
    };
  }

  async updateManager(managerId, updateData) {
    const allowed = ['name', 'teamName', 'balance', 'isActive'];
    const updates = {};
    for (const key of allowed) {
      if (key in updateData) updates[key] = updateData[key];
    }
    if (Object.keys(updates).length === 0) throw new Error('No valid updates provided');

    const manager = await User.findByIdAndUpdate(
      managerId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    if (!manager || manager.role !== 'manager') throw new Error('Manager not found');

    logger.info('Manager updated', { managerId, updates: Object.keys(updates) });
    return manager;
  }

  // Player assignment / removal
  async assignPlayerToManager(managerId, playerId) {
    return withTransaction(async (session) => {
      const [manager, player] = await Promise.all([
        User.findById(managerId).session(session),
        Player.findById(playerId).session(session)
      ]);

      if (!manager || manager.role !== 'manager') throw new Error('Manager not found');
      if (!player) throw new Error('Player not found');
      if (player.status === 'sold' && player.soldTo) throw new Error('Player already assigned');

      player.status = 'sold';
      player.soldTo = managerId;
      player.soldPrice = player.baseValue;
      await player.save({ session });

      logger.info('Player assigned to manager', {
        managerId,
        playerId: player._id.toString(),
        playerName: player.name
      });

      return player;
    });
  }

  async removePlayerFromManager(managerId, playerId) {
    return withTransaction(async (session) => {
      const player = await Player.findOne({ _id: playerId, soldTo: managerId }).session(session);
      if (!player) throw new Error('Player not found or not assigned');

      player.status = 'available';
      player.soldTo = null;
      player.soldPrice = null;
      await player.save({ session });

      logger.info('Player removed from manager', {
        managerId,
        playerId: player._id.toString(),
        playerName: player.name
      });

      return player;
    });
  }

  // Settings
  async getSettings() {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings({});
      await settings.save();
    }
    return settings;
  }

  async updateSettings(updateData) {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings(updateData);
    } else {
      Object.assign(settings, updateData);
    }
    const updated = await settings.save();
    logger.info('Settings updated', { updates: Object.keys(updateData) });
    return updated;
  }

  // Broadcasts
  async createBroadcast(broadcastData) {
    const b = new Broadcast({
      message: broadcastData.message,
      type: broadcastData.type || 'general',
      createdBy: broadcastData.createdBy,
      isActive: true
    });
    const saved = await b.save();
    logger.info('Broadcast created', {
      broadcastId: saved._id.toString(),
      message: saved.message.slice(0, 50) + '...',
      createdBy: broadcastData.createdBy
    });
    return saved;
  }

  async getAllBroadcasts(page = 1, limit = 20) {
    const { skip, limit: pageLimit } = paginate(page, limit);
    const [broadcasts, total] = await Promise.all([
      Broadcast.find()
        .populate('createdBy', 'name username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit),
      Broadcast.countDocuments()
    ]);
    return {
      broadcasts,
      pagination: {
        current: parseInt(page, 10),
        total: Math.ceil(total / pageLimit),
        count: total,
        hasNext: skip + pageLimit < total,
        hasPrev: page > 1
      }
    };
  }

  async deleteBroadcast(broadcastId) {
    const b = await Broadcast.findByIdAndDelete(broadcastId);
    if (!b) throw new Error('Broadcast not found');
    logger.info('Broadcast deleted', {
      broadcastId,
      message: b.message.slice(0, 50) + '...'
    });
    return b;
  }

  // System stats
  async getSystemStats() {
    const [
      totalManagers,
      activeManagers,
      totalPlayers,
      soldPlayers,
      totalAuctions,
      activeAuctions,
      totalBroadcasts,
      pendingRequests
    ] = await Promise.all([
      User.countDocuments({ role: 'manager' }),
      User.countDocuments({ role: 'manager', isActive: true }),
      Player.countDocuments(),
      Player.countDocuments({ status: 'sold' }),
      Auction.countDocuments(),
      Auction.countDocuments({ status: 'ongoing' }),
      Broadcast.countDocuments(),
      Request.countDocuments({ status: 'pending' })
    ]);

    const managers = await User.find({ role: 'manager' }).select('balance');
    const totalBalance = managers.reduce((sum, u) => sum + u.balance, 0);

    const spentAgg = await Player.aggregate([
      { $match: { status: 'sold', soldPrice: { $exists: true } } },
      { $group: { _id: null, total: { $sum: '$soldPrice' } } }
    ]);

    return {
      users: {
        totalManagers,
        activeManagers,
        inactiveManagers: totalManagers - activeManagers
      },
      players: {
        totalPlayers,
        soldPlayers,
        availablePlayers: totalPlayers - soldPlayers,
        unsoldPlayers: await Player.countDocuments({ status: 'unsold' })
      },
      auctions: {
        totalAuctions,
        activeAuctions,
        completedAuctions: await Auction.countDocuments({ status: 'completed' }),
        upcomingAuctions: await Auction.countDocuments({ status: 'upcoming' })
      },
      finance: {
        totalBalance,
        totalSpent: spentAgg[0]?.total || 0,
        totalCirculation: totalBalance + (spentAgg[0]?.total || 0)
      },
      system: {
        totalBroadcasts,
        pendingRequests,
        totalAchievements: await Achievement.countDocuments()
      }
    };
  }
}

export default new AdminService();