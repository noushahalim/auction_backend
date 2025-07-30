// src/controllers/statsController.js

const User = require('../models/User');
const Player = require('../models/Player');
const Auction = require('../models/Auction');
const { logger } = require('../utils/logger');

// Get leaderboards
exports.getLeaderboards = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;

    // Top managers by points
    const topManagersByPoints = await User.find({ 
      role: 'manager', 
      isActive: true 
    })
    .select('name username teamName points avatarUrl auctionsWon')
    .sort({ points: -1, name: 1 })
    .limit(parseInt(limit));

    // Top managers by auctions won
    const topManagersByWins = await User.find({ 
      role: 'manager', 
      isActive: true,
      auctionsWon: { $gt: 0 }
    })
    .select('name username teamName points avatarUrl auctionsWon')
    .sort({ auctionsWon: -1, points: -1 })
    .limit(parseInt(limit));

    // Top spenders (calculate from players sold to them)
    const topSpenders = await Player.aggregate([
      {
        $match: { 
          status: 'sold',
          soldTo: { $exists: true }
        }
      },
      {
        $group: {
          _id: '$soldTo',
          totalSpent: { $sum: '$soldPrice' },
          playerCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'manager'
        }
      },
      {
        $unwind: '$manager'
      },
      {
        $match: {
          'manager.isActive': true,
          'manager.role': 'manager'
        }
      },
      {
        $project: {
          _id: '$manager._id',
          name: '$manager.name',
          username: '$manager.username',
          teamName: '$manager.teamName',
          avatarUrl: '$manager.avatarUrl',
          totalSpent: 1,
          playerCount: 1,
          averageSpent: { $divide: ['$totalSpent', '$playerCount'] }
        }
      },
      {
        $sort: { totalSpent: -1 }
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    // Most expensive players
    const mostExpensivePlayers = await Player.find({ 
      status: 'sold',
      soldPrice: { $gt: 0 }
    })
    .populate('soldTo', 'name username teamName')
    .select('name category baseValue soldPrice imageUrl soldTo')
    .sort({ soldPrice: -1 })
    .limit(parseInt(limit));

    res.json({
      success: true,
      data: {
        topManagersByPoints,
        topManagersByWins,
        topSpenders,
        mostExpensivePlayers
      }
    });

  } catch (error) {
    logger.error('Get leaderboards error:', error);
    next(error);
  }
};

// Get overall statistics
exports.getOverallStats = async (req, res, next) => {
  try {
    // Basic counts
    const totalManagers = await User.countDocuments({ role: 'manager', isActive: true });
    const totalPlayers = await Player.countDocuments({ isActive: true });
    const totalAuctions = await Auction.countDocuments();
    const activeAuctions = await Auction.countDocuments({ status: 'ongoing' });
    const completedAuctions = await Auction.countDocuments({ status: 'completed' });

    // Player statistics
    const playerStats = await Player.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const soldPlayersStats = await Player.aggregate([
      {
        $match: { status: 'sold' }
      },
      {
        $group: {
          _id: null,
          totalValue: { $sum: '$soldPrice' },
          count: { $sum: 1 },
          avgPrice: { $avg: '$soldPrice' },
          maxPrice: { $max: '$soldPrice' },
          minPrice: { $min: '$soldPrice' }
        }
      }
    ]);

    // Category distribution
    const categoryStats = await Player.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: 1 },
          sold: {
            $sum: {
              $cond: [{ $eq: ['$status', 'sold'] }, 1, 0]
            }
          },
          unsold: {
            $sum: {
              $cond: [{ $eq: ['$status', 'unsold'] }, 1, 0]
            }
          },
          available: {
            $sum: {
              $cond: [{ $eq: ['$status', 'available'] }, 1, 0]
            }
          }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Auction activity
    const auctionActivity = await Auction.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': -1, '_id.month': -1 }
      },
      {
        $limit: 12
      }
    ]);

    // Top categories by value
    const categoryValues = await Player.aggregate([
      {
        $match: { status: 'sold' }
      },
      {
        $group: {
          _id: '$category',
          totalValue: { $sum: '$soldPrice' },
          count: { $sum: 1 },
          avgValue: { $avg: '$soldPrice' }
        }
      },
      {
        $sort: { totalValue: -1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalManagers,
          totalPlayers,
          totalAuctions,
          activeAuctions,
          completedAuctions
        },
        playerStats: {
          byStatus: playerStats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {}),
          sold: soldPlayersStats[0] || {
            totalValue: 0,
            count: 0,
            avgPrice: 0,
            maxPrice: 0,
            minPrice: 0
          }
        },
        categoryStats,
        categoryValues,
        auctionActivity: auctionActivity.reverse() // Show chronologically
      }
    });

  } catch (error) {
    logger.error('Get overall stats error:', error);
    next(error);
  }
};

// Get auction statistics
exports.getAuctionStats = async (req, res, next) => {
  try {
    const { auctionId } = req.params;

    const auction = await Auction.findById(auctionId);
    if (!auction) {
      return res.status(404).json({
        success: false,
        error: 'Auction not found'
      });
    }

    // Bid statistics
    const bidStats = {
      totalBids: auction.bids.length,
      uniqueBidders: [...new Set(auction.bids.map(bid => bid.userId.toString()))].length,
      avgBidAmount: auction.bids.length > 0 
        ? auction.bids.reduce((sum, bid) => sum + bid.amount, 0) / auction.bids.length 
        : 0
    };

    // Bidder activity
    const bidderActivity = await User.aggregate([
      {
        $match: {
          _id: { 
            $in: auction.bids.map(bid => bid.userId)
          }
        }
      },
      {
        $project: {
          name: 1,
          username: 1,
          teamName: 1,
          bidCount: {
            $size: {
              $filter: {
                input: auction.bids,
                cond: { $eq: ['$$this.userId', '$_id'] }
              }
            }
          }
        }
      },
      {
        $sort: { bidCount: -1 }
      }
    ]);

    // Players sold in this auction
    const soldPlayers = await Player.find({
      auctionHistory: {
        $elemMatch: { auctionId: auction._id }
      }
    }).populate('soldTo', 'name username teamName');

    // Category completion
    const categoryProgress = auction.categories.map(category => {
      const categoryPlayers = soldPlayers.filter(p => p.category === category);
      return {
        category,
        completed: categoryPlayers.length,
        totalValue: categoryPlayers.reduce((sum, p) => sum + (p.soldPrice || 0), 0)
      };
    });

    res.json({
      success: true,
      data: {
        auction: {
          name: auction.name,
          status: auction.status,
          startTime: auction.startTime,
          currentCategoryIndex: auction.currentCategoryIndex,
          totalPlayers: auction.totalPlayers,
          playersCompleted: auction.playersCompleted
        },
        bidStats,
        bidderActivity,
        soldPlayers: soldPlayers.map(player => ({
          name: player.name,
          category: player.category,
          baseValue: player.baseValue,
          soldPrice: player.soldPrice,
          soldTo: player.soldTo
        })),
        categoryProgress
      }
    });

  } catch (error) {
    logger.error('Get auction stats error:', error);
    next(error);
  }
};

// Get manager statistics
exports.getManagerStats = async (req, res, next) => {
  try {
    const { managerId } = req.params;

    const manager = await User.findById(managerId);
    if (!manager || manager.role !== 'manager') {
      return res.status(404).json({
        success: false,
        error: 'Manager not found'
      });
    }

    // Get manager's players
    const players = await Player.find({ 
      soldTo: managerId,
      status: 'sold'
    });

    // Calculate spending statistics
    const totalSpent = players.reduce((sum, player) => sum + (player.soldPrice || 0), 0);
    const avgSpent = players.length > 0 ? totalSpent / players.length : 0;
    const maxSpent = players.length > 0 ? Math.max(...players.map(p => p.soldPrice || 0)) : 0;
    const minSpent = players.length > 0 ? Math.min(...players.map(p => p.soldPrice || 0)) : 0;

    // Category breakdown
    const categoryBreakdown = players.reduce((acc, player) => {
      if (!acc[player.category]) {
        acc[player.category] = {
          count: 0,
          totalSpent: 0,
          avgSpent: 0,
          players: []
        };
      }
      acc[player.category].count++;
      acc[player.category].totalSpent += player.soldPrice || 0;
      acc[player.category].players.push({
        name: player.name,
        price: player.soldPrice,
        baseValue: player.baseValue
      });
      return acc;
    }, {});

    // Calculate average for each category
    Object.keys(categoryBreakdown).forEach(category => {
      const cat = categoryBreakdown[category];
      cat.avgSpent = cat.count > 0 ? cat.totalSpent / cat.count : 0;
    });

    // Auction participation
    const auctionParticipation = await Auction.aggregate([
      {
        $match: {
          'bids.userId': manager._id
        }
      },
      {
        $project: {
          name: 1,
          status: 1,
          startTime: 1,
          userBids: {
            $filter: {
              input: '$bids',
              cond: { $eq: ['$$this.userId', manager._id] }
            }
          }
        }
      },
      {
        $addFields: {
          bidCount: { $size: '$userBids' },
          totalBidAmount: { $sum: '$userBids.amount' }
        }
      },
      {
        $sort: { startTime: -1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        manager: {
          name: manager.name,
          username: manager.username,
          teamName: manager.teamName,
          balance: manager.balance,
          points: manager.points,
          auctionsWon: manager.auctionsWon,
          bidCount: manager.bidCount
        },
        spending: {
          totalSpent,
          avgSpent,
          maxSpent,
          minSpent,
          remainingBalance: manager.balance
        },
        players: {
          total: players.length,
          categoryBreakdown
        },
        auctionParticipation
      }
    });

  } catch (error) {
    logger.error('Get manager stats error:', error);
    next(error);
  }
};
