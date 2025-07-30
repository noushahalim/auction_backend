// src/routes/auctions.js

const express = require('express');
const router = express.Router();
const auctionController = require('../controllers/auctionController');
const { auth, adminAuth, requireActiveUser, actionRateLimit } = require('../middleware/auth');
const { 
  validateBid,
  validateVote,
  validatePagination,
  validateObjectId
} = require('../middleware/validation');

/**
 * @route   GET /api/auctions
 * @desc    Get all auctions
 * @access  Private
 */
router.get('/', auth, validatePagination, auctionController.getAllAuctions);

/**
 * @route   GET /api/auctions/:id
 * @desc    Get single auction
 * @access  Private
 */
router.get('/:id', auth, validateObjectId('id'), auctionController.getAuction);

/**
 * @route   GET /api/auctions/:id/state
 * @desc    Get auction current state (for real-time updates)
 * @access  Private
 */
router.get('/:id/state', auth, validateObjectId('id'), auctionController.getAuctionState);

/**
 * @route   POST /api/auctions/:auctionId/bid
 * @desc    Place a bid in auction
 * @access  Private
 */
router.post(
  '/:auctionId/bid', 
  auth, 
  requireActiveUser,
  validateObjectId('auctionId'),
  validateBid,
  actionRateLimit(30, 60 * 1000), // 30 bids per minute
  auctionController.placeBid
);

/**
 * @route   POST /api/auctions/:auctionId/players/:playerId/vote
 * @desc    Vote for player (like/dislike for skip feature)
 * @access  Private
 */
router.post(
  '/:auctionId/players/:playerId/vote',
  auth,
  requireActiveUser,
  validateObjectId('auctionId'),
  validateObjectId('playerId'),
  validateVote,
  auctionController.votePlayer
);

/**
 * @route   GET /api/auctions/:auctionId/players/:playerId/votes
 * @desc    Get player vote status
 * @access  Private
 */
router.get(
  '/:auctionId/players/:playerId/votes',
  auth,
  validateObjectId('auctionId'),
  validateObjectId('playerId'),
  auctionController.getPlayerVotes
);

// Admin-only auction control routes
const auctionService = require('../services/auctionService');

/**
 * @route   POST /api/auctions/:id/start
 * @desc    Start auction (Admin only)
 * @access  Private (Admin)
 */
router.post('/:id/start', auth, adminAuth, validateObjectId('id'), async (req, res, next) => {
  try {
    const result = await auctionService.startAuction(req.params.id, req.user._id);

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('auctionStarted', {
        auctionId: req.params.id,
        auction: result.auction,
        currentPlayer: result.currentPlayer
      });
    }

    res.json({
      success: true,
      data: result,
      message: 'Auction started successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auctions/:id/stop
 * @desc    Stop/pause auction (Admin only)
 * @access  Private (Admin)
 */
router.post('/:id/stop', auth, adminAuth, validateObjectId('id'), async (req, res, next) => {
  try {
    const auction = await auctionService.stopAuction(req.params.id, req.user._id);

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('auctionStopped', {
        auctionId: req.params.id,
        auction
      });
    }

    res.json({
      success: true,
      data: auction,
      message: 'Auction stopped successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auctions/:id/continue
 * @desc    Continue auction (Admin only)
 * @access  Private (Admin)
 */
router.post('/:id/continue', auth, adminAuth, validateObjectId('id'), async (req, res, next) => {
  try {
    const auction = await auctionService.continueAuction(req.params.id, req.user._id);

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('auctionContinued', {
        auctionId: req.params.id,
        auction
      });
    }

    res.json({
      success: true,
      data: auction,
      message: 'Auction continued successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auctions/:id/final-call
 * @desc    Final call - end bidding for current player (Admin only)
 * @access  Private (Admin)
 */
router.post('/:id/final-call', auth, adminAuth, validateObjectId('id'), async (req, res, next) => {
  try {
    const result = await auctionService.finalCall(req.params.id, req.user._id);

    // Emit socket events
    const io = req.app.get('io');
    if (io) {
      io.to(`auction:${req.params.id}`).emit('playerSold', {
        auctionId: req.params.id,
        soldPlayer: result.soldPlayer
      });

      if (result.nextPlayer) {
        io.to(`auction:${req.params.id}`).emit('nextPlayer', {
          auctionId: req.params.id,
          player: result.nextPlayer
        });
      }

      if (result.categoryCompleted) {
        io.to(`auction:${req.params.id}`).emit('categoryCompleted', {
          auctionId: req.params.id
        });
      }

      if (result.auctionCompleted) {
        io.emit('auctionCompleted', {
          auctionId: req.params.id
        });
      }
    }

    res.json({
      success: true,
      data: result,
      message: 'Final call completed'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auctions/:id/skip
 * @desc    Skip current player (Admin only)
 * @access  Private (Admin)
 */
router.post('/:id/skip', auth, adminAuth, validateObjectId('id'), async (req, res, next) => {
  try {
    const { playerId } = req.body;
    const result = await auctionService.skipPlayer(req.params.id, playerId, req.user._id);

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`auction:${req.params.id}`).emit('playerSkipped', {
        auctionId: req.params.id,
        skippedPlayer: result.skippedPlayer,
        nextPlayer: result.nextPlayer
      });
    }

    res.json({
      success: true,
      data: result,
      message: 'Player skipped successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auctions/:id/undo
 * @desc    Undo last bid (Admin only)
 * @access  Private (Admin)
 */
router.post('/:id/undo', auth, adminAuth, validateObjectId('id'), async (req, res, next) => {
  try {
    const result = await auctionService.undoLastBid(req.params.id, req.user._id);

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`auction:${req.params.id}`).emit('bidUndone', {
        auctionId: req.params.id,
        undoBid: result.undoBid,
        newCurrentBid: result.newCurrentBid
      });
    }

    res.json({
      success: true,
      data: result,
      message: 'Last bid undone successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
