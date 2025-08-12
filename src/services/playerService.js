// src/services/playerService.js

// Business logic for player management operations

import Player from '../models/Player.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import { logger } from '../utils/logger.js';
import { withTransaction, paginate } from '../utils/database.js';
import { sanitizeInput, generateSlug } from '../utils/helpers.js';

class PlayerService {
  // Get all players with filtering and pagination
  async getAllPlayers(options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        category = 'all',
        status = 'all',
        search = '',
        sortBy = 'name',
        sortOrder = 'asc'
      } = options;

      const { skip, limit: pageLimit } = paginate(page, limit);

      // Build filter
      const filter = {};
      
      if (category !== 'all') {
        filter.category = category;
      }
      
      if (status !== 'all') {
        filter.status = status;
      }

      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } }
        ];
      }

      // Build sort
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const [players, total] = await Promise.all([
        Player.find(filter)
          .populate('soldTo', 'name username teamName')
          .sort(sortOptions)
          .skip(skip)
          .limit(pageLimit),
        Player.countDocuments(filter)
      ]);

      return {
        players,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / pageLimit),
          count: total,
          hasNext: skip + pageLimit < total,
          hasPrev: page > 1
        },
        filters: {
          category,
          status,
          search,
          sortBy,
          sortOrder
        }
      };
    } catch (error) {
      logger.error('Error fetching players:', error);
      throw new Error('Failed to fetch players');
    }
  }

  // Get players by category
  async getPlayersByCategory(category, page = 1, limit = 20) {
    try {
      const { skip, limit: pageLimit } = paginate(page, limit);

      const [players, total] = await Promise.all([
        Player.find({ category })
          .populate('soldTo', 'name username teamName')
          .sort({ name: 1 })
          .skip(skip)
          .limit(pageLimit),
        Player.countDocuments({ category })
      ]);

      return {
        players,
        category,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / pageLimit),
          count: total,
          hasNext: skip + pageLimit < total,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      logger.error('Error fetching players by category:', error);
      throw new Error('Failed to fetch players by category');
    }
  }

  // Get player by ID
  async getPlayerById(playerId) {
    try {
      const player = await Player.findById(playerId)
        .populate('soldTo', 'name username teamName balance');

      if (!player) {
        throw new Error('Player not found');
      }

      return player;
    } catch (error) {
      logger.error('Error fetching player:', error);
      throw error;
    }
  }

  // Create new player
  async createPlayer(playerData) {
    try {
      const { name, category, baseValue, imageUrl } = playerData;

      // Validate required fields
      if (!name || !category || baseValue === undefined) {
        throw new Error('Name, category, and base value are required');
      }

      // Validate category exists in settings
      const settings = await Settings.findOne();
      const validCategories = settings?.categories || ['GK', 'DEF', 'MID', 'FWD'];
      
      if (!validCategories.includes(category)) {
        throw new Error(`Invalid category. Valid categories: ${validCategories.join(', ')}`);
      }

      // Check if player name already exists
      const existingPlayer = await Player.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') } 
      });
      
      if (existingPlayer) {
        throw new Error('Player with this name already exists');
      }

      const player = new Player({
        name: sanitizeInput(name),
        category,
        baseValue: parseInt(baseValue),
        imageUrl: imageUrl || null,
        status: 'available',
        slug: generateSlug(name)
      });

      const savedPlayer = await player.save();

      logger.info('Player created', {
        playerId: savedPlayer._id,
        name: savedPlayer.name,
        category: savedPlayer.category,
        baseValue: savedPlayer.baseValue
      });

      return savedPlayer;
    } catch (error) {
      logger.error('Error creating player:', error);
      throw error;
    }
  }

  // Update player
  async updatePlayer(playerId, updateData) {
    try {
      const allowedUpdates = ['name', 'category', 'baseValue', 'imageUrl', 'status'];
      const updates = {};

      // Filter only allowed updates
      Object.keys(updateData).forEach(key => {
        if (allowedUpdates.includes(key)) {
          if (key === 'name') {
            updates[key] = sanitizeInput(updateData[key]);
            updates.slug = generateSlug(updateData[key]);
          } else {
            updates[key] = updateData[key];
          }
        }
      });

      if (Object.keys(updates).length === 0) {
        throw new Error('No valid updates provided');
      }

      // Validate category if being updated
      if (updates.category) {
        const settings = await Settings.findOne();
        const validCategories = settings?.categories || ['GK', 'DEF', 'MID', 'FWD'];
        
        if (!validCategories.includes(updates.category)) {
          throw new Error(`Invalid category. Valid categories: ${validCategories.join(', ')}`);
        }
      }

      // Check for duplicate name if updating name
      if (updates.name) {
        const existingPlayer = await Player.findOne({ 
          _id: { $ne: playerId },
          name: { $regex: new RegExp(`^${updates.name}$`, 'i') } 
        });
        
        if (existingPlayer) {
          throw new Error('Player with this name already exists');
        }
      }

      const player = await Player.findByIdAndUpdate(
        playerId,
        { $set: updates },
        { new: true, runValidators: true }
      ).populate('soldTo', 'name username teamName');

      if (!player) {
        throw new Error('Player not found');
      }

      logger.info('Player updated', {
        playerId,
        updates: Object.keys(updates)
      });

      return player;
    } catch (error) {
      logger.error('Error updating player:', error);
      throw error;
    }
  }

  // Delete player
  async deletePlayer(playerId) {
    try {
      const player = await Player.findById(playerId);
      
      if (!player) {
        throw new Error('Player not found');
      }

      // Check if player is sold - might want to prevent deletion
      if (player.status === 'sold' && player.soldTo) {
        throw new Error('Cannot delete player that has been sold. Consider moving to unsold instead.');
      }

      await Player.findByIdAndDelete(playerId);

      logger.info('Player deleted', {
        playerId,
        name: player.name,
        category: player.category
      });

      return player;
    } catch (error) {
      logger.error('Error deleting player:', error);
      throw error;
    }
  }

  // Enable/Disable player
  async togglePlayerStatus(playerId, isEnabled) {
    try {
      const status = isEnabled ? 'available' : 'disabled';
      
      const player = await Player.findByIdAndUpdate(
        playerId,
        { status },
        { new: true }
      );

      if (!player) {
        throw new Error('Player not found');
      }

      logger.info('Player status toggled', {
        playerId,
        name: player.name,
        newStatus: status
      });

      return player;
    } catch (error) {
      logger.error('Error toggling player status:', error);
      throw error;
    }
  }

  // Bulk operations
  async bulkEnablePlayers(playerIds) {
    try {
      const result = await Player.updateMany(
        { _id: { $in: playerIds } },
        { status: 'available' }
      );

      logger.info('Players bulk enabled', {
        playerIds,
        modifiedCount: result.modifiedCount
      });

      return result;
    } catch (error) {
      logger.error('Error bulk enabling players:', error);
      throw error;
    }
  }

  async bulkDisablePlayers(playerIds) {
    try {
      const result = await Player.updateMany(
        { _id: { $in: playerIds } },
        { status: 'disabled' }
      );

      logger.info('Players bulk disabled', {
        playerIds,
        modifiedCount: result.modifiedCount
      });

      return result;
    } catch (error) {
      logger.error('Error bulk disabling players:', error);
      throw error;
    }
  }

  async bulkDeletePlayers(playerIds) {
    return withTransaction(async (session) => {
      try {
        // Check if any players are sold
        const soldPlayers = await Player.find({
          _id: { $in: playerIds },
          status: 'sold',
          soldTo: { $exists: true }
        }).session(session);

        if (soldPlayers.length > 0) {
          throw new Error(`Cannot delete sold players: ${soldPlayers.map(p => p.name).join(', ')}`);
        }

        const result = await Player.deleteMany(
          { _id: { $in: playerIds } },
          { session }
        );

        logger.info('Players bulk deleted', {
          playerIds,
          deletedCount: result.deletedCount
        });

        return result;
      } catch (error) {
        logger.error('Error bulk deleting players:', error);
        throw error;
      }
    });
  }

  // Category management
  async enableAllPlayersInCategory(category) {
    try {
      const result = await Player.updateMany(
        { category },
        { status: 'available' }
      );

      logger.info('All players in category enabled', {
        category,
        modifiedCount: result.modifiedCount
      });

      return result;
    } catch (error) {
      logger.error('Error enabling all players in category:', error);
      throw error;
    }
  }

  async disableAllPlayersInCategory(category) {
    try {
      const result = await Player.updateMany(
        { category },
        { status: 'disabled' }
      );

      logger.info('All players in category disabled', {
        category,
        modifiedCount: result.modifiedCount
      });

      return result;
    } catch (error) {
      logger.error('Error disabling all players in category:', error);
      throw error;
    }
  }

  async deleteAllPlayersInCategory(category) {
    return withTransaction(async (session) => {
      try {
        // Check if any players in category are sold
        const soldPlayers = await Player.find({
          category,
          status: 'sold',
          soldTo: { $exists: true }
        }).session(session);

        if (soldPlayers.length > 0) {
          throw new Error(`Cannot delete category with sold players. Found ${soldPlayers.length} sold players.`);
        }

        const result = await Player.deleteMany(
          { category },
          { session }
        );

        logger.info('All players in category deleted', {
          category,
          deletedCount: result.deletedCount
        });

        return result;
      } catch (error) {
        logger.error('Error deleting all players in category:', error);
        throw error;
      }
    });
  }

  // Move player to unsold category
  async movePlayerToUnsold(playerId) {
    return withTransaction(async (session) => {
      try {
        const player = await Player.findById(playerId).session(session);
        
        if (!player) {
          throw new Error('Player not found');
        }

        // Reset player data
        player.category = 'UNSOLD';
        player.status = 'unsold';
        player.soldTo = null;
        player.soldPrice = null;
        player.currentBid = null;
        player.currentBidder = null;

        await player.save({ session });

        logger.info('Player moved to unsold', {
          playerId,
          name: player.name
        });

        return player;
      } catch (error) {
        logger.error('Error moving player to unsold:', error);
        throw error;
      }
    });
  }

  // Get player statistics
  async getPlayerStats() {
    try {
      const [
        totalPlayers,
        playersByStatus,
        playersByCategory,
        priceStats
      ] = await Promise.all([
        Player.countDocuments(),
        Player.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        Player.aggregate([
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ]),
        Player.aggregate([
          {
            $group: {
              _id: null,
              avgBaseValue: { $avg: '$baseValue' },
              minBaseValue: { $min: '$baseValue' },
              maxBaseValue: { $max: '$baseValue' },
              avgSoldPrice: { $avg: { $ifNull: ['$soldPrice', 0] } },
              totalSoldValue: { $sum: { $ifNull: ['$soldPrice', 0] } }
            }
          }
        ])
      ]);

      // Format the results
      const statusStats = playersByStatus.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {});

      const categoryStats = playersByCategory.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {});

      const prices = priceStats[0] || {};

      return {
        total: totalPlayers,
        byStatus: {
          available: statusStats.available || 0,
          sold: statusStats.sold || 0,
          unsold: statusStats.unsold || 0,
          disabled: statusStats.disabled || 0
        },
        byCategory: categoryStats,
        pricing: {
          averageBaseValue: Math.round(prices.avgBaseValue || 0),
          minBaseValue: prices.minBaseValue || 0,
          maxBaseValue: prices.maxBaseValue || 0,
          averageSoldPrice: Math.round(prices.avgSoldPrice || 0),
          totalSoldValue: prices.totalSoldValue || 0
        }
      };
    } catch (error) {
      logger.error('Error fetching player stats:', error);
      throw new Error('Failed to fetch player statistics');
    }
  }

  // Search players
  async searchPlayers(query, limit = 10) {
    try {
      const searchRegex = new RegExp(query, 'i');
      
      const players = await Player.find({
        $or: [
          { name: searchRegex },
          { category: searchRegex }
        ]
      })
        .populate('soldTo', 'name teamName')
        .limit(limit)
        .sort({ name: 1 });

      return players;
    } catch (error) {
      logger.error('Error searching players:', error);
      throw new Error('Failed to search players');
    }
  }

  // Get available players for auction
  async getAvailablePlayersForAuction(category = null) {
    try {
      const filter = { status: 'available' };
      
      if (category) {
        filter.category = category;
      }

      const players = await Player.find(filter)
        .sort({ category: 1, name: 1 });

      return players;
    } catch (error) {
      logger.error('Error fetching available players for auction:', error);
      throw new Error('Failed to fetch available players');
    }
  }

  // Reset all players (for new auction season)
  async resetAllPlayers() {
    return withTransaction(async (session) => {
      try {
        const result = await Player.updateMany(
          {},
          {
            $set: {
              status: 'available',
              soldTo: null,
              soldPrice: null,
              currentBid: null,
              currentBidder: null
            },
            $unset: {
              auctionHistory: 1
            }
          },
          { session }
        );

        // Move all UNSOLD back to their original categories if needed
        // This would require storing original category somewhere

        logger.info('All players reset for new season', {
          modifiedCount: result.modifiedCount
        });

        return result;
      } catch (error) {
        logger.error('Error resetting all players:', error);
        throw error;
      }
    });
  }
}

export default new PlayerService();