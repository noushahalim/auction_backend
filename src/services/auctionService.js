// src/services/auctionService.js

const Auction = require('../models/Auction');
const Player = require('../models/Player');
const User = require('../models/User');
const Settings = require('../models/Settings');
const achievementService = require('./achievementService');
const { logger } = require('../utils/logger');

class AuctionService {
  // Start auction
  async startAuction(auctionId, adminId) {
    const auction = await Auction.findById(auctionId);
    if (!auction) {
      throw new Error('Auction not found');
    }

    if (auction.status !== 'upcoming') {
      throw new Error('Auction cannot be started');
    }

    // Check if there's already an ongoing auction
    const ongoingAuction = await Auction.findOne({ 
      status: { $in: ['ongoing', 'paused'] },
      _id: { $ne: auctionId }
    });

    if (ongoingAuction) {
      throw new Error('There is already an ongoing auction');
    }

    // Get first category players
    const firstCategory = auction.categoryFlow[0];
    if (!firstCategory) {
      throw new Error('No categories defined for auction');
    }

    const categoryPlayers = await Player.find({
      category: firstCategory,
      status: 'available',
      isActive: true
    }).sort({ name: 1 });

    if (categoryPlayers.length === 0) {
      throw new Error(`No available players found in category ${firstCategory}`);
    }

    // Set first player as current
    auction.status = 'ongoing';
    auction.currentCategoryIndex = 0;
    auction.currentPlayerId = categoryPlayers[0]._id;
    auction.totalPlayers = await this.calculateTotalPlayers(auction.categoryFlow);
    auction.playersCompleted = 0;

    await auction.save();

    logger.info(`Auction "${auction.name}" started by admin ${adminId}`);

    return {
      auction,
      currentPlayer: categoryPlayers[0],
      categoryPlayers
    };
  }

  // Stop/Pause auction
  async stopAuction(auctionId, adminId) {
    const auction = await Auction.findById(auctionId);
    if (!auction) {
      throw new Error('Auction not found');
    }

    if (auction.status !== 'ongoing') {
      throw new Error('Auction is not currently running');
    }

    // Save current state
    auction.status = 'paused';
    auction.pausedAt = {
      category: auction.categories[auction.currentCategoryIndex],
      playerId: auction.currentPlayerId
    };

    await auction.save();

    logger.info(`Auction "${auction.name}" paused by admin ${adminId}`);

    return auction;
  }

  // Continue auction
  async continueAuction(auctionId, adminId) {
    const auction = await Auction.findById(auctionId);
    if (!auction) {
      throw new Error('Auction not found');
    }

    if (auction.status !== 'paused') {
      throw new Error('Auction is not paused');
    }

    auction.status = 'ongoing';

    // If we have saved state, restore it
    if (auction.pausedAt.playerId) {
      auction.currentPlayerId = auction.pausedAt.playerId;
    }

    auction.pausedAt = undefined;
    await auction.save();

    logger.info(`Auction "${auction.name}" resumed by admin ${adminId}`);

    return auction;
  }

  // Place bid with business logic validation
  async placeBid({ auctionId, playerId, userId, amount }) {
    const session = await require('mongoose').startSession();
    session.startTransaction();

    try {
      const auction = await Auction.findById(auctionId).session(session);
      const player = await Player.findById(playerId).session(session);
      const user = await User.findById(userId).session(session);

      // Validation
      if (!auction || auction.status !== 'ongoing') {
        throw new Error('Auction is not active');
      }

      if (!player || player.status !== 'available') {
        throw new Error('Player is not available for bidding');
      }

      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      if (user.balance < amount) {
        throw new Error('Insufficient balance');
      }

      // Check if this is the current player
      if (auction.currentPlayerId.toString() !== playerId) {
        throw new Error('This player is not currently being auctioned');
      }

      // Get current highest bid
      const currentHighestBid = auction.getCurrentHighestBid();

      if (amount <= currentHighestBid.amount) {
        throw new Error(`Bid must be higher than current bid of ${currentHighestBid.amount}`);
      }

      if (amount < player.baseValue) {
        throw new Error(`Bid must be at least the base value of ${player.baseValue}`);
      }

      // Check if user is bidding against themselves
      if (currentHighestBid.userId && currentHighestBid.userId.toString() === userId) {
        throw new Error('You are already the highest bidder');
      }

      // Place the bid
      const bid = auction.addBid(userId, playerId, amount);
      await auction.save({ session });

      // Update user bid count
      user.bidCount += 1;
      await user.save({ session });

      await session.commitTransaction();

      // Check achievements (outside transaction)
      setImmediate(() => {
        achievementService.checkBidAchievements(user, amount).catch(err => 
          logger.error('Achievement check error:', err)
        );
      });

      return bid;

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Final call - end bidding for current player
  async finalCall(auctionId, adminId, mode = 'auto') {
    const auction = await Auction.findById(auctionId)
                                .populate('currentPlayerId')
                                .populate('currentBid.userId');

    if (!auction || auction.status !== 'ongoing') {
      throw new Error('Auction is not active');
    }

    const currentPlayer = auction.currentPlayerId;
    if (!currentPlayer) {
      throw new Error('No current player set');
    }

    const highestBid = auction.getCurrentHighestBid();

    if (highestBid.amount > 0 && highestBid.userId) {
      // Player is sold
      await this.sellPlayerToUser(currentPlayer._id, highestBid.userId, highestBid.amount, auctionId);

      // Update auction completed count
      auction.playersCompleted += 1;

      logger.info(`Player ${currentPlayer.name} sold to ${auction.currentBid.userId.username} for ${highestBid.amount}`);
    } else {
      // Player is unsold
      await this.markPlayerUnsold(currentPlayer._id);
      logger.info(`Player ${currentPlayer.name} went unsold`);
    }

    // Move to next player
    const nextPlayerResult = await this.moveToNextPlayer(auctionId);

    await auction.save();

    return {
      soldPlayer: {
        player: currentPlayer,
        soldTo: highestBid.userId ? auction.currentBid.userId : null,
        soldPrice: highestBid.amount || 0
      },
      nextPlayer: nextPlayerResult.nextPlayer,
      categoryCompleted: nextPlayerResult.categoryCompleted,
      auctionCompleted: nextPlayerResult.auctionCompleted
    };
  }

  // Skip player (admin action)
  async skipPlayer(auctionId, playerId, adminId) {
    const auction = await Auction.findById(auctionId);
    if (!auction || auction.status !== 'ongoing') {
      throw new Error('Auction is not active');
    }

    if (auction.currentPlayerId.toString() !== playerId) {
      throw new Error('This player is not currently being auctioned');
    }

    const player = await Player.findById(playerId);
    await this.markPlayerUnsold(playerId);

    // Move to next player
    const nextPlayerResult = await this.moveToNextPlayer(auctionId);

    logger.info(`Player ${player.name} skipped by admin ${adminId}`);

    return {
      skippedPlayer: player,
      nextPlayer: nextPlayerResult.nextPlayer,
      categoryCompleted: nextPlayerResult.categoryCompleted,
      auctionCompleted: nextPlayerResult.auctionCompleted
    };
  }

  // Undo last bid
  async undoLastBid(auctionId, adminId) {
    const auction = await Auction.findById(auctionId);
    if (!auction || auction.status !== 'ongoing') {
      throw new Error('Auction is not active');
    }

    if (!auction.currentPlayerId) {
      throw new Error('No current player set');
    }

    // Find bids for current player
    const playerBids = auction.bids.filter(bid => 
      bid.playerId.toString() === auction.currentPlayerId.toString()
    );

    if (playerBids.length === 0) {
      throw new Error('No bids to undo');
    }

    // Remove last bid
    const lastBid = playerBids[playerBids.length - 1];
    const bidIndex = auction.bids.findIndex(bid => 
      bid._id.toString() === lastBid._id.toString()
    );

    if (bidIndex !== -1) {
      auction.bids.splice(bidIndex, 1);
    }

    // Update current bid to previous highest
    const remainingPlayerBids = auction.bids.filter(bid => 
      bid.playerId.toString() === auction.currentPlayerId.toString()
    );

    if (remainingPlayerBids.length > 0) {
      const previousHighest = remainingPlayerBids.reduce((highest, current) => 
        current.amount > highest.amount ? current : highest
      );
      auction.currentBid = {
        amount: previousHighest.amount,
        userId: previousHighest.userId,
        timestamp: previousHighest.timestamp
      };
    } else {
      auction.currentBid = {
        amount: 0,
        userId: null,
        timestamp: null
      };
    }

    await auction.save();

    // Decrement user bid count
    const user = await User.findById(lastBid.userId);
    if (user && user.bidCount > 0) {
      user.bidCount -= 1;
      await user.save();
    }

    logger.info(`Last bid undone by admin ${adminId} for auction ${auction.name}`);

    return {
      undoBid: lastBid,
      newCurrentBid: auction.currentBid
    };
  }

  // Handle player voting (like/dislike for skip feature)
  async handlePlayerVote(auctionId, playerId, userId, vote) {
    // This would require a separate collection or field to track votes
    // For now, implementing basic structure

    const auction = await Auction.findById(auctionId);
    if (!auction || auction.status !== 'ongoing') {
      throw new Error('Auction is not active');
    }

    if (auction.currentPlayerId.toString() !== playerId) {
      throw new Error('This player is not currently being auctioned');
    }

    // Get total active managers
    const totalManagers = await User.countDocuments({ role: 'manager', isActive: true });

    // For now, return mock data structure
    // In real implementation, you'd store votes in database
    return {
      playerId,
      likes: vote === 'like' ? 1 : 0,
      dislikes: vote === 'dislike' ? 1 : 0,
      totalVotes: 1,
      totalManagers,
      userVote: vote,
      skipped: false,
      celebration: false
    };
  }

  // Get player votes
  async getPlayerVotes(auctionId, playerId) {
    // Mock implementation - in real app, retrieve from database
    return {
      playerId,
      likes: 0,
      dislikes: 0,
      totalVotes: 0,
      totalManagers: await User.countDocuments({ role: 'manager', isActive: true })
    };
  }

  // Private helper methods
  async sellPlayerToUser(playerId, userId, price, auctionId) {
    const session = await require('mongoose').startSession();
    session.startTransaction();

    try {
      const player = await Player.findById(playerId).session(session);
      const user = await User.findById(userId).session(session);

      // Mark player as sold
      player.markAsSold(userId, price, auctionId);
      await player.save({ session });

      // Deduct from user balance
      user.balance -= price;
      user.auctionsWon += 1;
      await user.save({ session });

      // Check for achievements
      setImmediate(() => {
        achievementService.checkWinAchievements(user, price).catch(err => 
          logger.error('Achievement check error:', err)
        );
      });

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async markPlayerUnsold(playerId) {
    const player = await Player.findById(playerId);
    player.markAsUnsold();
    await player.save();
  }

  async moveToNextPlayer(auctionId) {
    const auction = await Auction.findById(auctionId);
    const currentCategory = auction.categoryFlow[auction.currentCategoryIndex];

    // Get remaining players in current category
    const remainingPlayers = await Player.find({
      category: currentCategory,
      status: 'available',
      isActive: true
    }).sort({ name: 1 });

    if (remainingPlayers.length > 0) {
      // Move to next player in same category
      auction.currentPlayerId = remainingPlayers[0]._id;
      auction.currentBid = { amount: 0, userId: null, timestamp: null };
      await auction.save();

      return {
        nextPlayer: remainingPlayers[0],
        categoryCompleted: false,
        auctionCompleted: false
      };
    } else {
      // Category completed, move to next category
      auction.currentCategoryIndex += 1;

      if (auction.currentCategoryIndex >= auction.categoryFlow.length) {
        // Auction completed
        auction.status = 'completed';
        auction.currentPlayerId = null;
        auction.currentBid = { amount: 0, userId: null, timestamp: null };
        await auction.save();

        return {
          nextPlayer: null,
          categoryCompleted: true,
          auctionCompleted: true
        };
      } else {
        // Move to next category
        const nextCategory = auction.categoryFlow[auction.currentCategoryIndex];
        const nextCategoryPlayers = await Player.find({
          category: nextCategory,
          status: 'available',
          isActive: true
        }).sort({ name: 1 });

        if (nextCategoryPlayers.length === 0) {
          // Skip empty categories
          return await this.moveToNextPlayer(auctionId);
        }

        auction.currentPlayerId = nextCategoryPlayers[0]._id;
        auction.currentBid = { amount: 0, userId: null, timestamp: null };
        await auction.save();

        return {
          nextPlayer: nextCategoryPlayers[0],
          categoryCompleted: true,
          auctionCompleted: false
        };
      }
    }
  }

  async calculateTotalPlayers(categoryFlow) {
    let total = 0;
    for (const category of categoryFlow) {
      const count = await Player.countDocuments({
        category,
        status: 'available',
        isActive: true
      });
      total += count;
    }
    return total;
  }
}

module.exports = new AuctionService();
