// src/routes/auctions.js
import { Router } from 'express';
import {
  getAllAuctions,
  getAuction,
  getAuctionState,
  placeBid,
  votePlayer,
  getPlayerVotes,
  getPlayerBidHistory,
  getUserBidHistory,
  startAuction,
  stopAuction,
  continueAuction,
  skipBid,
  finalCall,
  undoBid
} from '../controllers/auctionController.js';
import {
  auth,
  adminAuth,
  requireActiveUser,
  actionRateLimit
} from '../middleware/auth.js';
import {
  validateBid,
  validateVote,
  validatePagination,
  validateObjectId
} from '../middleware/validation.js';
import auctionService from '../services/auctionService.js';

const router = Router();

/**
 * @route   GET /api/auctions
 * @desc    Get all auctions
 * @access  Private
 */
router.get(
  '/',
  auth,
  validatePagination,
  getAllAuctions
);

/**
 * @route   GET /api/auctions/:id
 * @desc    Get single auction
 * @access  Private
 */
router.get(
  '/:id',
  auth,
  validateObjectId('id'),
  getAuction
);

/**
 * @route   GET /api/auctions/:id/state
 * @desc    Get auction current state (for real-time updates)
 * @access  Private
 */
router.get(
  '/:id/state',
  auth,
  validateObjectId('id'),
  getAuctionState
);

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
  actionRateLimit(30, 60 * 1000),
  placeBid
);

/**
 * @route   POST /api/auctions/:auctionId/players/:playerId/vote
 * @desc    Vote for player (skip feature)
 * @access  Private
 */
router.post(
  '/:auctionId/players/:playerId/vote',
  auth,
  requireActiveUser,
  validateObjectId('auctionId'),
  validateObjectId('playerId'),
  validateVote,
  votePlayer
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
  getPlayerVotes
);

/**
 * @route   GET /api/auctions/:playerId/bids
 * @desc    Get bid history for a player
 * @access  Private
 */
router.get(
  '/:playerId/bids',
  auth,
  validateObjectId('playerId'),
  getPlayerBidHistory
);

/**
 * @route   GET /api/auctions/me/bids
 * @desc    Get user's bidding history
 * @access  Private
 */
router.get(
  '/me/bids',
  auth,
  getUserBidHistory
);

// ——— Admin‐only auction control routes ———

/**
 * @route   POST /api/auctions/:id/start
 * @desc    Start auction (Admin only)
 * @access  Private (Admin)
 */
router.post(
  '/:id/start',
  auth,
  adminAuth,
  validateObjectId('id'),
  startAuction
);

/**
 * @route   POST /api/auctions/:id/stop
 * @desc    Stop/pause auction (Admin only)
 * @access  Private (Admin)
 */
router.post(
  '/:id/stop',
  auth,
  adminAuth,
  validateObjectId('id'),
  stopAuction
);

/**
 * @route   POST /api/auctions/:id/continue
 * @desc    Continue auction (Admin only)
 * @access  Private (Admin)
 */
router.post(
  '/:id/continue',
  auth,
  adminAuth,
  validateObjectId('id'),
  continueAuction
);

/**
 * @route   POST /api/auctions/:id/final-call
 * @desc    Final call for current player (Admin only)
 * @access  Private (Admin)
 */
router.post(
  '/:id/final-call',
  auth,
  adminAuth,
  validateObjectId('id'),
  finalCall
);

/**
 * @route   POST /api/auctions/:id/skip
 * @desc    Skip current player (Admin only)
 * @access  Private (Admin)
 */
router.post(
  '/:id/skip',
  auth,
  adminAuth,
  validateObjectId('id'),
  skipBid
);

/**
 * @route   POST /api/auctions/:id/undo
 * @desc    Undo last bid (Admin only)
 * @access  Private (Admin)
 */
router.post(
  '/:id/undo',
  auth,
  adminAuth,
  validateObjectId('id'),
  undoBid
);

export default router;