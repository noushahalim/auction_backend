// src/routes/stats.js
import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import {
  validatePagination,
  validateObjectId
} from '../middleware/validation.js';
import statsController from '../controllers/statsController.js';

const router = Router();

/**
 * @route   GET /api/stats/leaderboards
 * @desc    Get various leaderboards
 * @access  Private
 */
router.get(
  '/leaderboards',
  auth,
  validatePagination,
  statsController.getLeaderboards
);

/**
 * @route   GET /api/stats/overall
 * @desc    Get overall platform statistics
 * @access  Private
 */
router.get(
  '/overall',
  auth,
  statsController.getOverallStats
);

/**
 * @route   GET /api/stats/auctions/:auctionId'
 * @desc    Get stats for a specific auction
 * @access  Private
 */
router.get(
  '/auctions/:auctionId',
  auth,
  validateObjectId('auctionId'),
  statsController.getAuctionStats
);

/**
 * @route   GET /api/stats/managers/:managerId'
 * @desc    Get stats for a specific manager
 * @access  Private
 */
router.get(
  '/managers/:managerId',
  auth,
  validateObjectId('managerId'),
  statsController.getManagerStats
);

export default router;