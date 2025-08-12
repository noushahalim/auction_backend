// src/controllers/auctionController.js

import { validationResult } from 'express-validator';
import Auction from '../models/Auction.js';
import Player from '../models/Player.js';
import User from '../models/User.js';
import Bid from '../models/Bid.js';
import auctionService from '../services/auctionService.js';
import achievementService from '../services/achievementService.js';
import { logger } from '../utils/logger.js';

// Get all auctions
export const getAllAuctions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    let query = {};
    if (status) {
      query.status = status;
    }

    const auctions = await Auction.find(query)
      .populate('createdBy', 'name username')
      .populate('currentPlayerId', 'name category baseValue currentBid')
      .sort({ startTime: -1 })
      .skip(offset)
      .limit(parseInt(limit));

    const total = await Auction.countDocuments(query);

    res.json({
      success: true,
      data: {
        auctions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          hasNext: offset + auctions.length < total,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    logger.error('Get all auctions error:', error.message);
    next(error);
  }
};

// Get single auction
export const getAuction = async (req, res, next) => {
  try {
    const { id } = req.params;

    const auction = await Auction.findById(id)
      .populate('createdBy', 'name username')
      .populate('currentPlayerId', 'name category baseValue currentBid currentBidder imageUrl')
      .populate('participants', 'name username avatarUrl balance')
      .populate('activeParticipants', 'name username avatarUrl balance');

    if (!auction) {
      return res.status(404).json({
        success: false,
        error: 'Auction not found'
      });
    }

    // Add user to participants if not already present
    const userId = req.user._id;
    await auction.addParticipant(userId);

    // Get current state
    const currentState = await auction.getCurrentState();

    res.json({
      success: true,
      data: currentState
    });

  } catch (error) {
    logger.error('Get auction error:', error.message);
    next(error);
  }
};

// Get auction current state (for real-time updates)
export const getAuctionState = async (req, res, next) => {
  try {
    const { id } = req.params;

    const auction = await Auction.findById(id)
      .populate('currentPlayerId', 'name category baseValue currentBid currentBidder imageUrl votes');

    if (!auction) {
      return res.status(404).json({
        success: false,
        error: 'Auction not found'
      });
    }

    const currentState = await auction.getCurrentState();

    res.json({
      success: true,
      data: currentState
    });

  } catch (error) {
    logger.error('Get auction state error:', error.message);
    next(error);
  }
};

// Place a bid in auction
export const placeBid = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { auctionId } = req.params;
    const { amount, playerId } = req.body;
    const userId = req.user._id;

    // Place bid using auction service
    const result = await auctionService.placeBid({
      auctionId,
      playerId,
      userId,
      amount,
      source: 'web',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    logger.info(`Bid placed: User ${userId} bid ${amount} on player ${playerId} in auction ${auctionId}`);

    // Emit socket event for real-time updates
    if (req.app.get('io')) {
      req.app.get('io').to(`auction:${auctionId}`).emit('bidUpdate', {
        auction: auctionId,
        player: playerId,
        bid: result.bid,
        currentBid: result.player.currentBid,
        currentBidder: result.player.currentBidder,
        timerRestarted: result.timerRestarted
      });
    }

    res.json({
      success: true,
      message: 'Bid placed successfully',
      data: result
    });

  } catch (error) {
    logger.error('Place bid error:', error.message);

    if (error.message.includes('Insufficient balance') || 
        error.message.includes('Bid amount must be higher') ||
        error.message.includes('not available for bidding') ||
        error.message.includes('not ongoing')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    next(error);
  }
};

// Vote for player (like/dislike for skip feature)
export const votePlayer = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { auctionId, playerId } = req.params;
    const { voteType } = req.body; // 'like' or 'dislike'
    const userId = req.user._id;

    // Verify auction is ongoing
    const auction = await Auction.findById(auctionId);
    if (!auction || auction.status !== 'ongoing') {
      return res.status(400).json({
        success: false,
        error: 'Auction is not ongoing'
      });
    }

    // Verify this is the current player
    if (!auction.currentPlayerId || !auction.currentPlayerId.equals(playerId)) {
      return res.status(400).json({
        success: false,
        error: 'This is not the current player being auctioned'
      });
    }

    // Get player and vote
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    await player.votePlayer(userId, voteType);

    // Get vote summary
    const voteSummary = player.getVoteSummary();

    // Check if skip conditions are met
    const totalParticipants = auction.activeParticipants.length;
    const skipThreshold = Math.ceil(totalParticipants * 0.8); // 80% threshold

    let skipTriggered = false;
    let skipReason = null;

    // Check for unanimous like (fireworks)
    if (voteSummary.likes === totalParticipants && totalParticipants > 0) {
      skipTriggered = true;
      skipReason = 'unanimous_like';
    }
    // Check for unanimous dislike and no bids
    else if (voteSummary.dislikes >= skipThreshold && !player.biddingStarted) {
      skipTriggered = true;
      skipReason = 'unanimous_dislike';
      
      // Skip player to unsold
      await auctionService.skipPlayer(auctionId, playerId, 'unanimous_dislike');
    }

    // Emit real-time updates
    if (req.app.get('io')) {
      const socketData = {
        playerId,
        voteSummary,
        skipTriggered,
        skipReason,
        voterCount: totalParticipants
      };

      req.app.get('io').to(`auction:${auctionId}`).emit('voteUpdate', socketData);

      if (skipTriggered && skipReason === 'unanimous_like') {
        req.app.get('io').to(`auction:${auctionId}`).emit('fireworks', { playerId });
      }
    }

    logger.info(`Vote placed: User ${userId} voted ${voteType} for player ${playerId}`);

    res.json({
      success: true,
      message: 'Vote placed successfully',
      data: {
        playerId,
        voteType,
        voteSummary,
        skipTriggered,
        skipReason
      }
    });

  } catch (error) {
    logger.error('Vote player error:', error.message);
    next(error);
  }
};

// Get player vote status
export const getPlayerVotes = async (req, res, next) => {
  try {
    const { auctionId, playerId } = req.params;
    const userId = req.user._id;

    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    const voteSummary = player.getVoteSummary();
    const userVote = player.hasUserVoted(userId);

    res.json({
      success: true,
      data: {
        playerId,
        voteSummary,
        userVote
      }
    });

  } catch (error) {
    logger.error('Get player votes error:', error.message);
    next(error);
  }
};

// Get bid history for a player
export const getPlayerBidHistory = async (req, res, next) => {
  try {
    const { playerId } = req.params;
    const { limit = 20 } = req.query;

    const bidHistory = await Bid.getPlayerBidHistory(playerId, parseInt(limit));

    res.json({
      success: true,
      data: {
        playerId,
        bids: bidHistory
      }
    });

  } catch (error) {
    logger.error('Get player bid history error:', error.message);
    next(error);
  }
};

// Get user's bidding history
export const getUserBidHistory = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { limit = 50, page = 1 } = req.query;

    const bidHistory = await Bid.getUserBidHistory(userId, parseInt(limit));

    res.json({
      success: true,
      data: {
        userId,
        bids: bidHistory
      }
    });

  } catch (error) {
    logger.error('Get user bid history error:', error.message);
    next(error);
  }
};

// Admin auction control endpoints
export const startAuction = async (req, res, next) => {
  try {
    const { auctionId } = req.params;
    const adminId = req.user._id;

    const result = await auctionService.startAuction(auctionId, adminId);

    // Emit socket event
    if (req.app.get('io')) {
      req.app.get('io').emit('auctionStarted', {
        auction: result.auction,
        currentPlayer: result.currentPlayer
      });
    }

    logger.info(`Auction started: ${auctionId} by admin ${adminId}`);

    res.json({
      success: true,
      message: 'Auction started successfully',
      data: result
    });

  } catch (error) {
    logger.error('Start auction error:', error.message);
    
    if (error.message.includes('cannot be started') || 
        error.message.includes('already an ongoing auction')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    
    next(error);
  }
};

export const stopAuction = async (req, res, next) => {
  try {
    const { auctionId } = req.params;
    const adminId = req.user._id;

    const auction = await auctionService.stopAuction(auctionId, adminId);

    // Emit socket event
    if (req.app.get('io')) {
      req.app.get('io').to(`auction:${auctionId}`).emit('auctionStopped', {
        auction: auction
      });
    }

    logger.info(`Auction stopped: ${auctionId} by admin ${adminId}`);

    res.json({
      success: true,
      message: 'Auction stopped successfully',
      data: auction
    });

  } catch (error) {
    logger.error('Stop auction error:', error.message);
    next(error);
  }
};

export const continueAuction = async (req, res, next) => {
  try {
    const { auctionId } = req.params;
    const adminId = req.user._id;

    const auction = await auctionService.continueAuction(auctionId, adminId);

    // Emit socket event
    if (req.app.get('io')) {
      req.app.get('io').to(`auction:${auctionId}`).emit('auctionContinued', {
        auction: auction
      });
    }

    logger.info(`Auction continued: ${auctionId} by admin ${adminId}`);

    res.json({
      success: true,
      message: 'Auction continued successfully',
      data: auction
    });

  } catch (error) {
    logger.error('Continue auction error:', error.message);
    next(error);
  }
};

export const skipBid = async (req, res, next) => {
  try {
    const { auctionId } = req.params;
    const { playerId } = req.body;
    const adminId = req.user._id;

    const result = await auctionService.skipPlayer(auctionId, playerId, 'admin_skip', adminId);

    // Emit socket event
    if (req.app.get('io')) {
      req.app.get('io').to(`auction:${auctionId}`).emit('playerSkipped', {
        playerId: playerId,
        reason: 'admin_skip',
        nextPlayer: result.nextPlayer
      });
    }

    logger.info(`Player skipped: ${playerId} in auction ${auctionId} by admin ${adminId}`);

    res.json({
      success: true,
      message: 'Player skipped successfully',
      data: result
    });

  } catch (error) {
    logger.error('Skip bid error:', error.message);
    next(error);
  }
};

export const finalCall = async (req, res, next) => {
  try {
    const { auctionId } = req.params;
    const adminId = req.user._id;

    const result = await auctionService.finalCall(auctionId, adminId);

    // Emit socket event
    if (req.app.get('io')) {
      req.app.get('io').to(`auction:${auctionId}`).emit('finalCall', {
        playerId: result.soldPlayer._id,
        winner: result.winner,
        finalPrice: result.finalPrice
      });
    }

    logger.info(`Final call made for auction ${auctionId} by admin ${adminId}`);

    res.json({
      success: true,
      message: 'Final call executed successfully',
      data: result
    });

  } catch (error) {
    logger.error('Final call error:', error.message);
    next(error);
  }
};

export const undoBid = async (req, res, next) => {
  try {
    const { auctionId } = req.params;
    const adminId = req.user._id;

    const result = await auctionService.undoLastBid(auctionId, adminId);

    // Emit socket event
    if (req.app.get('io')) {
      req.app.get('io').to(`auction:${auctionId}`).emit('bidUndone', {
        playerId: result.player._id,
        previousBid: result.previousBid,
        currentBid: result.player.currentBid
      });
    }

    logger.info(`Bid undone for auction ${auctionId} by admin ${adminId}`);

    res.json({
      success: true,
      message: 'Last bid undone successfully',
      data: result
    });

  } catch (error) {
    logger.error('Undo bid error:', error.message);
    next(error);
  }
};

// Get managers info for display during auction
export const getManagersInfo = async (req, res, next) => {
  try {
    const managers = await User.find({ role: 'manager', isActive: true })
      .select('name username balance')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: {
        managers: managers
      }
    });

  } catch (error) {
    logger.error('Get managers info error:', error.message);
    next(error);
  }
};

// Get detailed manager info for display
export const getManagerDetails = async (req, res, next) => {
  try {
    const managers = await User.find({ role: 'manager', isActive: true })
      .select('name username balance totalSpent')
      .populate({
        path: 'Player',
        match: { soldTo: { $exists: true }, status: 'sold' },
        select: 'name soldPrice category'
      });

    // Get player details for each manager
    const managersWithPlayers = await Promise.all(
      managers.map(async (manager) => {
        const players = await Player.find({ 
          soldTo: manager._id, 
          status: 'sold' 
        }).select('name soldPrice category');

        return {
          ...manager.toObject(),
          players: players,
          totalPlayers: players.length,
          totalSpent: players.reduce((sum, p) => sum + (p.soldPrice || 0), 0)
        };
      })
    );

    res.json({
      success: true,
      data: {
        managers: managersWithPlayers
      }
    });

  } catch (error) {
    logger.error('Get manager details error:', error.message);
    next(error);
  }
};

export default { getAllAuctions, getAuction, getAuctionState, placeBid, votePlayer, getPlayerVotes, getPlayerBidHistory, getUserBidHistory, startAuction, stopAuction, continueAuction, skipBid, finalCall, undoBid, getManagersInfo, getManagerDetails };