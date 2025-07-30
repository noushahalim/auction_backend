// src/routes/admin.js

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { auth, adminAuth } = require('../middleware/auth');
const { uploadPlayerImage } = require('../middleware/upload');
const { 
  validatePlayerCreation,
  validatePlayerUpdate,
  validateAuctionCreation,
  validateBroadcast,
  validateSettings,
  validatePagination,
  validateSearch,
  validateObjectId
} = require('../middleware/validation');

// All admin routes require authentication and admin role
router.use(auth, adminAuth);

// Registration Requests Management
/**
 * @route   GET /api/admin/requests
 * @desc    Get all registration requests
 * @access  Private (Admin)
 */
router.get('/requests', validatePagination, adminController.getRequests);

/**
 * @route   POST /api/admin/requests/:id/approve
 * @desc    Approve registration request
 * @access  Private (Admin)
 */
router.post('/requests/:id/approve', validateObjectId('id'), adminController.approveRequest);

/**
 * @route   POST /api/admin/requests/:id/reject
 * @desc    Reject registration request
 * @access  Private (Admin)
 */
router.post('/requests/:id/reject', validateObjectId('id'), adminController.rejectRequest);

// Manager Management
/**
 * @route   GET /api/admin/managers
 * @desc    Get all managers
 * @access  Private (Admin)
 */
router.get('/managers', validatePagination, validateSearch, adminController.getAllManagers);

/**
 * @route   GET /api/admin/managers/:id
 * @desc    Get single manager details
 * @access  Private (Admin)
 */
router.get('/managers/:id', validateObjectId('id'), adminController.getManager);

/**
 * @route   PUT /api/admin/managers/:id
 * @desc    Update manager details
 * @access  Private (Admin)
 */
router.put('/managers/:id', validateObjectId('id'), adminController.updateManager);

// Player Management
/**
 * @route   GET /api/admin/players
 * @desc    Get all players
 * @access  Private (Admin)
 */
router.get('/players', validatePagination, validateSearch, adminController.getAllPlayers);

/**
 * @route   POST /api/admin/players
 * @desc    Create new player
 * @access  Private (Admin)
 */
router.post('/players', uploadPlayerImage, validatePlayerCreation, adminController.createPlayer);

/**
 * @route   PUT /api/admin/players/:id
 * @desc    Update player
 * @access  Private (Admin)
 */
router.put('/players/:id', validateObjectId('id'), uploadPlayerImage, validatePlayerUpdate, adminController.updatePlayer);

/**
 * @route   DELETE /api/admin/players/:id
 * @desc    Delete player
 * @access  Private (Admin)
 */
router.delete('/players/:id', validateObjectId('id'), adminController.deletePlayer);

/**
 * @route   POST /api/admin/players/bulk
 * @desc    Bulk operations on players
 * @access  Private (Admin)
 */
router.post('/players/bulk', adminController.bulkUpdatePlayers);

// Auction Management
/**
 * @route   POST /api/admin/auctions
 * @desc    Create new auction
 * @access  Private (Admin)
 */
router.post('/auctions', validateAuctionCreation, adminController.createAuction);

// Settings Management
/**
 * @route   GET /api/admin/settings
 * @desc    Get system settings
 * @access  Private (Admin)
 */
router.get('/settings', adminController.getSettings);

/**
 * @route   PUT /api/admin/settings
 * @desc    Update system settings
 * @access  Private (Admin)
 */
router.put('/settings', validateSettings, adminController.updateSettings);

// Broadcast Management
/**
 * @route   GET /api/admin/broadcasts
 * @desc    Get all broadcast messages
 * @access  Private (Admin)
 */
router.get('/broadcasts', validatePagination, adminController.getBroadcasts);

/**
 * @route   POST /api/admin/broadcasts
 * @desc    Create broadcast message
 * @access  Private (Admin)
 */
router.post('/broadcasts', validateBroadcast, adminController.createBroadcast);

/**
 * @route   DELETE /api/admin/broadcasts/:id
 * @desc    Delete broadcast message
 * @access  Private (Admin)
 */
router.delete('/broadcasts/:id', validateObjectId('id'), adminController.deleteBroadcast);

// Additional admin endpoints for auction control
const auctionService = require('../services/auctionService');
const User = require('../models/User');

/**
 * @route   POST /api/admin/auctions/:id/managers-info
 * @desc    Send managers info to auction chat
 * @access  Private (Admin)
 */
router.post('/auctions/:id/managers-info', validateObjectId('id'), async (req, res, next) => {
  try {
    const managers = await User.find({ role: 'manager', isActive: true })
                              .select('name username teamName balance')
                              .sort({ name: 1 });

    const managersInfo = managers.map(manager => 
      `${manager.name} (${manager.username}) - Team: ${manager.teamName} - Balance: ${manager.balance.toLocaleString()}`
    ).join('\n');

    // Emit to auction chat
    const io = req.app.get('io');
    if (io) {
      io.to(`auction:${req.params.id}`).emit('chatMessage', {
        type: 'system',
        message: `📋 MANAGERS INFO\n${managersInfo}`,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Managers info sent to chat'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/admin/auctions/:id/managers-detailed
 * @desc    Send detailed managers info to auction chat
 * @access  Private (Admin)
 */
router.post('/auctions/:id/managers-detailed', validateObjectId('id'), async (req, res, next) => {
  try {
    const Player = require('../models/Player');
    const managers = await User.find({ role: 'manager', isActive: true })
                              .select('name username teamName balance')
                              .sort({ name: 1 });

    let detailedInfo = '📊 DETAILED MANAGERS INFO\n\n';

    for (const manager of managers) {
      const players = await Player.find({ soldTo: manager._id, status: 'sold' })
                                  .select('name soldPrice')
                                  .sort({ soldPrice: -1 });

      const totalSpent = players.reduce((sum, player) => sum + (player.soldPrice || 0), 0);

      detailedInfo += `👤 ${manager.name} (${manager.teamName})\n`;
      detailedInfo += `💰 Balance: ${manager.balance.toLocaleString()} | Spent: ${totalSpent.toLocaleString()}\n`;

      if (players.length > 0) {
        detailedInfo += `🏆 Players (${players.length}): `;
        detailedInfo += players.map(p => `${p.name} (${p.soldPrice?.toLocaleString()})`).join(', ');
      } else {
        detailedInfo += '🏆 No players yet';
      }

      detailedInfo += '\n\n';
    }

    // Emit to auction chat
    const io = req.app.get('io');
    if (io) {
      io.to(`auction:${req.params.id}`).emit('chatMessage', {
        type: 'system',
        message: detailedInfo,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Detailed managers info sent to chat'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get admin dashboard data
 * @access  Private (Admin)
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    const User = require('../models/User');
    const Player = require('../models/Player');
    const Auction = require('../models/Auction');
    const Request = require('../models/Request');

    // Get counts
    const totalManagers = await User.countDocuments({ role: 'manager', isActive: true });
    const totalPlayers = await Player.countDocuments({ isActive: true });
    const totalAuctions = await Auction.countDocuments();
    const activeAuctions = await Auction.countDocuments({ status: 'ongoing' });
    const pendingRequests = await Request.countDocuments({ status: 'pending' });

    // Get recent activity
    const recentRequests = await Request.find({ status: 'pending' })
                                       .sort({ createdAt: -1 })
                                       .limit(5)
                                       .select('name username createdAt');

    const recentAuctions = await Auction.find()
                                       .sort({ createdAt: -1 })
                                       .limit(5)
                                       .select('name status startTime createdAt');

    // Player status distribution
    const playerStats = await Player.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalManagers,
          totalPlayers,
          totalAuctions,
          activeAuctions,
          pendingRequests
        },
        recentActivity: {
          requests: recentRequests,
          auctions: recentAuctions
        },
        playerStats: playerStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
