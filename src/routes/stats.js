// src/routes/stats.js

const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const { auth, adminAuth } = require('../middleware/auth');
const { 
  validatePagination,
  validateObjectId
} = require('../middleware/validation');

/**
 * @route   GET /api/stats/leaderboards
 * @desc    Get leaderboards (top managers, spenders, etc.)
 * @access  Private
 */
router.get('/leaderboards', auth, statsController.getLeaderboards);

/**
 * @route   GET /api/stats/overview
 * @desc    Get overall statistics
 * @access  Private
 */
router.get('/overview', auth, statsController.getOverallStats);

/**
 * @route   GET /api/stats/auctions/:auctionId
 * @desc    Get auction statistics
 * @access  Private
 */
router.get('/auctions/:auctionId', auth, validateObjectId('auctionId'), statsController.getAuctionStats);

/**
 * @route   GET /api/stats/managers/:managerId
 * @desc    Get manager statistics
 * @access  Private
 */
router.get('/managers/:managerId', auth, validateObjectId('managerId'), statsController.getManagerStats);

module.exports = router;
