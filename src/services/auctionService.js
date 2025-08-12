// src/services/auctionService.js

import mongoose from 'mongoose';
import Auction from '../models/Auction.js';
import Player from '../models/Player.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import achievementService from './achievementService.js';
import { logger } from '../utils/logger.js';

class AuctionService {
  // Start auction
  async startAuction(auctionId, adminId) {
    const auction = await Auction.findById(auctionId);
    if (!auction) throw new Error('Auction not found');
    if (auction.status !== 'upcoming') throw new Error('Auction cannot be started');

    // Ensure no other auction is running
    const ongoing = await Auction.findOne({
      status: { $in: ['ongoing', 'paused'] },
      _id: { $ne: auctionId }
    });
    if (ongoing) throw new Error('There is already an ongoing auction');

    const firstCat = auction.categoryFlow[0];
    if (!firstCat) throw new Error('No categories defined for auction');

    const catPlayers = await Player.find({
      category: firstCat,
      status: 'available',
      isActive: true
    }).sort({ name: 1 });
    if (catPlayers.length === 0) {
      throw new Error(`No available players found in category ${firstCat}`);
    }

    auction.status = 'ongoing';
    auction.currentCategoryIndex = 0;
    auction.currentPlayerId = catPlayers[0]._id;
    auction.totalPlayers = await this.calculateTotalPlayers(auction.categoryFlow);
    auction.playersCompleted = 0;
    await auction.save();

    logger.info(`Auction "${auction.name}" started by admin ${adminId}`);
    return {
      auction,
      currentPlayer: catPlayers[0],
      categoryPlayers: catPlayers
    };
  }

  // Pause auction
  async stopAuction(auctionId, adminId) {
    const auction = await Auction.findById(auctionId);
    if (!auction) throw new Error('Auction not found');
    if (auction.status !== 'ongoing') throw new Error('Auction is not currently running');

    auction.status = 'paused';
    auction.pausedAt = {
      category: auction.categoryFlow[auction.currentCategoryIndex],
      playerId: auction.currentPlayerId
    };
    await auction.save();

    logger.info(`Auction "${auction.name}" paused by admin ${adminId}`);
    return auction;
  }

  // Resume auction
  async continueAuction(auctionId, adminId) {
    const auction = await Auction.findById(auctionId);
    if (!auction) throw new Error('Auction not found');
    if (auction.status !== 'paused') throw new Error('Auction is not paused');

    auction.status = 'ongoing';
    if (auction.pausedAt?.playerId) {
      auction.currentPlayerId = auction.pausedAt.playerId;
    }
    auction.pausedAt = undefined;
    await auction.save();

    logger.info(`Auction "${auction.name}" resumed by admin ${adminId}`);
    return auction;
  }

  // Place a bid
  async placeBid({ auctionId, playerId, userId, amount }) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const auction = await Auction.findById(auctionId).session(session);
      const player  = await Player.findById(playerId).session(session);
      const user    = await User.findById(userId).session(session);

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
      if (!auction.currentPlayerId.equals(playerId)) {
        throw new Error('This player is not currently being auctioned');
      }

      const currentBid = auction.getCurrentHighestBid();
      if (amount <= currentBid.amount) {
        throw new Error(`Bid must be higher than current bid of ${currentBid.amount}`);
      }
      if (amount < player.baseValue) {
        throw new Error(`Bid must be at least the base value of ${player.baseValue}`);
      }
      if (currentBid.userId?.toString() === userId) {
        throw new Error('You are already the highest bidder');
      }

      // Record bid
      const bid = auction.addBid(userId, playerId, amount);
      await auction.save({ session });

      // Update user
      user.bidCount += 1;
      await user.save({ session });

      await session.commitTransaction();

      // Async achievement check
      setImmediate(() =>
        achievementService
          .checkBidAchievements(user, amount)
          .catch(err => logger.error('Achievement check error:', err))
      );

      return bid;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // Final call: sell or mark unsold, then advance
  async finalCall(auctionId, adminId) {
    const auction = await Auction.findById(auctionId)
      .populate('currentPlayerId')
      .populate('bids.userId');
    if (!auction || auction.status !== 'ongoing') {
      throw new Error('Auction is not active');
    }

    const player    = auction.currentPlayerId;
    const highest   = auction.getCurrentHighestBid();

    if (highest.amount > 0 && highest.userId) {
      await this.sellPlayerToUser(player._id, highest.userId._id, highest.amount, auctionId);
      auction.playersCompleted += 1;
      logger.info(`Player ${player.name} sold for ${highest.amount}`);
    } else {
      await this.markPlayerUnsold(player._id);
      logger.info(`Player ${player.name} went unsold`);
    }

    const next = await this.moveToNextPlayer(auctionId);
    await auction.save();

    return {
      soldPlayer: {
        player,
        soldTo: highest.userId || null,
        soldPrice: highest.amount || 0
      },
      nextPlayer:      next.nextPlayer,
      categoryCompleted: next.categoryCompleted,
      auctionCompleted:  next.auctionCompleted
    };
  }

  // Admin skip
  async skipPlayer(auctionId, playerId, adminId) {
    const auction = await Auction.findById(auctionId);
    if (!auction || auction.status !== 'ongoing') {
      throw new Error('Auction is not active');
    }
    if (!auction.currentPlayerId.equals(playerId)) {
      throw new Error('This player is not currently being auctioned');
    }

    const player = await Player.findById(playerId);
    await this.markPlayerUnsold(playerId);

    const next = await this.moveToNextPlayer(auctionId);
    logger.info(`Player ${player.name} skipped by admin ${adminId}`);

    return {
      skippedPlayer:    player,
      nextPlayer:       next.nextPlayer,
      categoryCompleted: next.categoryCompleted,
      auctionCompleted:  next.auctionCompleted
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

    const bidsForPlayer = auction.bids.filter(b => 
      b.playerId.toString() === auction.currentPlayerId.toString()
    );
    if (bidsForPlayer.length === 0) {
      throw new Error('No bids to undo');
    }

    const lastBid = bidsForPlayer[bidsForPlayer.length - 1];
    const idx     = auction.bids.findIndex(b => b._id.equals(lastBid._id));
    if (idx > -1) auction.bids.splice(idx, 1);

    // Recompute current bid
    const remaining = auction.bids.filter(b => 
      b.playerId.toString() === auction.currentPlayerId.toString()
    );
    if (remaining.length > 0) {
      const prev = remaining.reduce((h, c) => (c.amount > h.amount ? c : h));
      auction.currentBid = {
        amount:    prev.amount,
        userId:    prev.userId,
        timestamp: prev.timestamp
      };
    } else {
      auction.currentBid = { amount: 0, userId: null, timestamp: null };
    }

    await auction.save();

    // Decrement bidder’s count
    const user = await User.findById(lastBid.userId);
    if (user?.bidCount > 0) {
      user.bidCount -= 1;
      await user.save();
    }

    logger.info(`Last bid undone by admin ${adminId} on auction ${auction.name}`);
    return {
      undoBid:     lastBid,
      newCurrentBid: auction.currentBid
    };
  }

  // Voting stubs – real implementation would persist votes
  async handlePlayerVote(auctionId, playerId, userId, vote) {
    const auction = await Auction.findById(auctionId);
    if (!auction || auction.status !== 'ongoing') {
      throw new Error('Auction is not active');
    }
    if (!auction.currentPlayerId.equals(playerId)) {
      throw new Error('This player is not currently being auctioned');
    }
    const totalManagers = await User.countDocuments({ role: 'manager', isActive: true });
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

  async getPlayerVotes(auctionId, playerId) {
    const totalManagers = await User.countDocuments({ role: 'manager', isActive: true });
    return {
      playerId,
      likes: 0,
      dislikes: 0,
      totalVotes: 0,
      totalManagers
    };
  }

  // Helpers
  async sellPlayerToUser(playerId, userId, price, auctionId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const player = await Player.findById(playerId).session(session);
      const user   = await User.findById(userId).session(session);

      player.markAsSold(userId, price, auctionId);
      await player.save({ session });

      user.balance -= price;
      user.auctionsWon += 1;
      await user.save({ session });

      setImmediate(() =>
        achievementService.checkWinAchievements(user, price).catch(err =>
          logger.error('Achievement check error:', err)
        )
      );

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
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
    const curCat  = auction.categoryFlow[auction.currentCategoryIndex];

    const remaining = await Player.find({
      category: curCat,
      status: 'available',
      isActive: true
    }).sort({ name: 1 });

    if (remaining.length > 0) {
      auction.currentPlayerId = remaining[0]._id;
      auction.currentBid = { amount: 0, userId: null, timestamp: null };
      await auction.save();
      return { nextPlayer: remaining[0], categoryCompleted: false, auctionCompleted: false };
    }

    // advance category
    auction.currentCategoryIndex++;
    if (auction.currentCategoryIndex >= auction.categoryFlow.length) {
      auction.status = 'completed';
      auction.currentPlayerId = null;
      auction.currentBid = { amount: 0, userId: null, timestamp: null };
      await auction.save();
      return { nextPlayer: null, categoryCompleted: true, auctionCompleted: true };
    }

    // skip empty categories recursively
    const nextCat = auction.categoryFlow[auction.currentCategoryIndex];
    const nextPlayers = await Player.find({
      category: nextCat,
      status: 'available',
      isActive: true
    }).sort({ name: 1 });

    if (nextPlayers.length === 0) {
      return this.moveToNextPlayer(auctionId);
    }

    auction.currentPlayerId = nextPlayers[0]._id;
    auction.currentBid = { amount: 0, userId: null, timestamp: null };
    await auction.save();
    return { nextPlayer: nextPlayers[0], categoryCompleted: true, auctionCompleted: false };
  }

  async calculateTotalPlayers(categoryFlow) {
    let total = 0;
    for (const cat of categoryFlow) {
      // count only available, active players
      total += await Player.countDocuments({ category: cat, status: 'available', isActive: true });
    }
    return total;
  }
}

export default new AuctionService();