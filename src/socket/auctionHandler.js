// src/socket/auctionHandler.js

const auctionService = require('../services/auctionService');
const Auction = require('../models/Auction');
const Player = require('../models/Player');
const { logger } = require('../utils/logger');

// Handle auction-related socket events
const handleAuctionEvents = (io, socket) => {
  const user = socket.user;

  // Join auction room
  socket.on('joinAuction', async (data) => {
    try {
      const { auctionId } = data;
      
      if (!auctionId) {
        return socket.emit('error', { message: 'Auction ID is required' });
      }

      // Verify auction exists
      const auction = await Auction.findById(auctionId);
      if (!auction) {
        return socket.emit('error', { message: 'Auction not found' });
      }

      // Leave any previous auction rooms
      const rooms = Array.from(socket.rooms);
      rooms.forEach(room => {
        if (room.startsWith('auction:')) {
          socket.leave(room);
        }
      });

      // Join new auction room
      socket.join(`auction:${auctionId}`);
      
      // Add user to auction participants
      await auction.addParticipant(user._id);

      // Send current auction state
      const currentState = await auction.getCurrentState();
      socket.emit('auctionState', currentState);

      // Notify others about new participant
      socket.to(`auction:${auctionId}`).emit('participantJoined', {
        user: {
          id: user._id,
          username: user.username,
          name: user.name,
          avatarUrl: user.avatarUrl
        }
      });

      logger.info(`User ${user.username} joined auction ${auctionId}`);

    } catch (error) {
      logger.error('Join auction error:', error.message);
      socket.emit('error', { message: 'Failed to join auction' });
    }
  });

  // Leave auction room
  socket.on('leaveAuction', async (data) => {
    try {
      const { auctionId } = data;
      
      if (!auctionId) {
        return socket.emit('error', { message: 'Auction ID is required' });
      }

      const auction = await Auction.findById(auctionId);
      if (auction) {
        await auction.removeParticipant(user._id);
      }

      socket.leave(`auction:${auctionId}`);
      
      // Notify others about participant leaving
      socket.to(`auction:${auctionId}`).emit('participantLeft', {
        user: {
          id: user._id,
          username: user.username
        }
      });

      logger.info(`User ${user.username} left auction ${auctionId}`);

    } catch (error) {
      logger.error('Leave auction error:', error.message);
      socket.emit('error', { message: 'Failed to leave auction' });
    }
  });

  // Place bid via socket
  socket.on('placeBid', async (data) => {
    try {
      const { auctionId, playerId, amount } = data;

      if (!auctionId || !playerId || !amount) {
        return socket.emit('error', { message: 'Missing required bid parameters' });
      }

      // Place bid using auction service
      const result = await auctionService.placeBid({
        auctionId,
        playerId,
        userId: user._id,
        amount,
        source: 'socket',
        ipAddress: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent']
      });

      // Emit bid update to all participants in the auction
      io.to(`auction:${auctionId}`).emit('bidUpdate', {
        auction: auctionId,
        player: result.player,
        bid: result.bid,
        bidder: {
          id: user._id,
          username: user.username,
          name: user.name
        },
        timerRestarted: result.timerRestarted,
        newTimerEnd: result.newTimerEnd
      });

      // Send success confirmation to bidder
      socket.emit('bidSuccess', {
        bid: result.bid,
        newBalance: result.user.balance
      });

      logger.info(`Socket bid placed: User ${user.username} bid ${amount} on player ${playerId}`);

    } catch (error) {
      logger.error('Socket place bid error:', error.message);
      socket.emit('bidError', { 
        message: error.message,
        code: error.code || 'BID_FAILED'
      });
    }
  });

  // Vote for player (like/dislike)
  socket.on('votePlayer', async (data) => {
    try {
      const { auctionId, playerId, voteType } = data;

      if (!auctionId || !playerId || !voteType) {
        return socket.emit('error', { message: 'Missing required vote parameters' });
      }

      const auction = await Auction.findById(auctionId);
      if (!auction || auction.status !== 'ongoing') {
        return socket.emit('error', { message: 'Auction is not ongoing' });
      }

      const player = await Player.findById(playerId);
      if (!player) {
        return socket.emit('error', { message: 'Player not found' });
      }

      // Place vote
      await player.votePlayer(user._id, voteType);
      
      const voteSummary = player.getVoteSummary();
      const totalParticipants = auction.activeParticipants.length;

      // Check for skip conditions
      let skipTriggered = false;
      let skipReason = null;

      if (voteSummary.likes === totalParticipants && totalParticipants > 0) {
        skipTriggered = true;
        skipReason = 'unanimous_like';
        
        // Emit fireworks effect
        io.to(`auction:${auctionId}`).emit('fireworks', { 
          playerId,
          message: 'Everyone loves this player!' 
        });
      } else if (voteSummary.dislikes >= Math.ceil(totalParticipants * 0.8) && !player.biddingStarted) {
        skipTriggered = true;
        skipReason = 'unanimous_dislike';
        
        // Skip player to unsold
        await auctionService.skipPlayer(auctionId, playerId, 'unanimous_dislike');
      }

      // Emit vote update
      io.to(`auction:${auctionId}`).emit('voteUpdate', {
        playerId,
        voteSummary,
        skipTriggered,
        skipReason,
        voter: {
          id: user._id,
          username: user.username,
          voteType
        }
      });

      logger.info(`Vote placed: User ${user.username} voted ${voteType} for player ${playerId}`);

    } catch (error) {
      logger.error('Vote player error:', error.message);
      socket.emit('error', { message: 'Failed to place vote' });
    }
  });

  // Request current auction state
  socket.on('getAuctionState', async (data) => {
    try {
      const { auctionId } = data;
      
      const auction = await Auction.findById(auctionId)
        .populate('currentPlayerId', 'name category baseValue currentBid currentBidder imageUrl votes');

      if (!auction) {
        return socket.emit('error', { message: 'Auction not found' });
      }

      const currentState = await auction.getCurrentState();
      socket.emit('auctionState', currentState);

    } catch (error) {
      logger.error('Get auction state error:', error.message);
      socket.emit('error', { message: 'Failed to get auction state' });
    }
  });

  // Admin-only auction control events
  if (user.role === 'admin') {
    // Start auction
    socket.on('startAuction', async (data) => {
      try {
        const { auctionId } = data;
        
        const result = await auctionService.startAuction(auctionId, user._id);
        
        // Notify all users about auction start
        io.emit('auctionStarted', {
          auction: result.auction,
          currentPlayer: result.currentPlayer,
          startedBy: user.username
        });

        logger.info(`Auction started via socket: ${auctionId} by admin ${user.username}`);

      } catch (error) {
        logger.error('Socket start auction error:', error.message);
        socket.emit('error', { message: error.message });
      }
    });

    // Stop auction
    socket.on('stopAuction', async (data) => {
      try {
        const { auctionId } = data;
        
        const auction = await auctionService.stopAuction(auctionId, user._id);
        
        io.to(`auction:${auctionId}`).emit('auctionStopped', {
          auction,
          stoppedBy: user.username
        });

        logger.info(`Auction stopped via socket: ${auctionId} by admin ${user.username}`);

      } catch (error) {
        logger.error('Socket stop auction error:', error.message);
        socket.emit('error', { message: error.message });
      }
    });

    // Continue auction
    socket.on('continueAuction', async (data) => {
      try {
        const { auctionId } = data;
        
        const auction = await auctionService.continueAuction(auctionId, user._id);
        
        io.to(`auction:${auctionId}`).emit('auctionContinued', {
          auction,
          continuedBy: user.username
        });

        logger.info(`Auction continued via socket: ${auctionId} by admin ${user.username}`);

      } catch (error) {
        logger.error('Socket continue auction error:', error.message);
        socket.emit('error', { message: error.message });
      }
    });

    // Skip player
    socket.on('skipPlayer', async (data) => {
      try {
        const { auctionId, playerId } = data;
        
        const result = await auctionService.skipPlayer(auctionId, playerId, 'admin_skip', user._id);
        
        io.to(`auction:${auctionId}`).emit('playerSkipped', {
          playerId,
          reason: 'admin_skip',
          nextPlayer: result.nextPlayer,
          skippedBy: user.username
        });

        logger.info(`Player skipped via socket: ${playerId} by admin ${user.username}`);

      } catch (error) {
        logger.error('Socket skip player error:', error.message);
        socket.emit('error', { message: error.message });
      }
    });

    // Final call
    socket.on('finalCall', async (data) => {
      try {
        const { auctionId } = data;
        
        const result = await auctionService.finalCall(auctionId, user._id);
        
        io.to(`auction:${auctionId}`).emit('finalCall', {
          soldPlayer: result.soldPlayer,
          winner: result.winner,
          finalPrice: result.finalPrice,
          calledBy: user.username
        });

        logger.info(`Final call via socket for auction ${auctionId} by admin ${user.username}`);

      } catch (error) {
        logger.error('Socket final call error:', error.message);
        socket.emit('error', { message: error.message });
      }
    });

    // Undo last bid
    socket.on('undoBid', async (data) => {
      try {
        const { auctionId } = data;
        
        const result = await auctionService.undoLastBid(auctionId, user._id);
        
        io.to(`auction:${auctionId}`).emit('bidUndone', {
          playerId: result.player._id,
          previousBid: result.previousBid,
          currentBid: result.player.currentBid,
          undoneBy: user.username
        });

        logger.info(`Bid undone via socket for auction ${auctionId} by admin ${user.username}`);

      } catch (error) {
        logger.error('Socket undo bid error:', error.message);
        socket.emit('error', { message: error.message });
      }
    });

    // Send managers info to chat
    socket.on('sendManagersInfo', async (data) => {
      try {
        const { auctionId, type = 'basic' } = data;
        
        const User = require('../models/User');
        const managers = await User.find({ role: 'manager', isActive: true })
          .select('name username balance totalSpent')
          .sort({ name: 1 });

        let message = '';
        if (type === 'basic') {
          message = '📊 **Current Managers Status:**\n\n' +
            managers.map(m => `👤 ${m.name} (@${m.username})\n💰 Balance: ₹${m.balance.toLocaleString()}`).join('\n\n');
        } else if (type === 'detailed') {
          const Player = require('../models/Player');
          const managersWithPlayers = await Promise.all(
            managers.map(async (manager) => {
              const players = await Player.find({ 
                soldTo: manager._id, 
                status: 'sold' 
              }).select('name soldPrice category');
              
              return {
                ...manager.toObject(),
                players
              };
            })
          );

          message = '📊 **Detailed Managers Report:**\n\n' +
            managersWithPlayers.map(m => 
              `👤 **${m.name}** (@${m.username})\n` +
              `💰 Balance: ₹${m.balance.toLocaleString()}\n` +
              `👥 Players: ${m.players.length}\n` +
              (m.players.length > 0 ? 
                `🏆 Team: ${m.players.map(p => `${p.name} (₹${p.soldPrice.toLocaleString()})`).join(', ')}\n` : 
                '🏆 Team: Empty\n')
            ).join('\n');
        }

        io.to(`auction:${auctionId}`).emit('systemMessage', {
          type: 'managers_info',
          message,
          sender: user.name,
          timestamp: new Date()
        });

        logger.info(`Managers info sent to auction ${auctionId} by admin ${user.username}`);

      } catch (error) {
        logger.error('Send managers info error:', error.message);
        socket.emit('error', { message: 'Failed to send managers info' });
      }
    });
  }

  // Handle auction disconnection cleanup
  socket.on('disconnect', async () => {
    try {
      // Remove user from all auction participant lists
      const rooms = Array.from(socket.rooms);
      for (const room of rooms) {
        if (room.startsWith('auction:')) {
          const auctionId = room.replace('auction:', '');
          const auction = await Auction.findById(auctionId);
          if (auction) {
            await auction.removeParticipant(user._id);
            
            // Notify others about disconnection
            socket.to(room).emit('participantLeft', {
              user: {
                id: user._id,
                username: user.username
              },
              reason: 'disconnected'
            });
          }
        }
      }

      logger.info(`User ${user.username} disconnected from auction rooms`);

    } catch (error) {
      logger.error('Auction disconnect cleanup error:', error.message);
    }
  });
};

// Timer management for auctions
const startAuctionTimer = (io, auctionId, duration) => {
  const timerId = setTimeout(async () => {
    try {
      const auction = await Auction.findById(auctionId);
      if (auction && auction.status === 'ongoing' && auction.mode === 'auto') {
        // Auto-complete current player auction
        const result = await auctionService.finalCall(auctionId, null);
        
        io.to(`auction:${auctionId}`).emit('timerExpired', {
          soldPlayer: result.soldPlayer,
          winner: result.winner,
          finalPrice: result.finalPrice,
          reason: 'timer_expired'
        });
      }
    } catch (error) {
      logger.error('Auction timer error:', error.message);
    }
  }, duration * 1000);

  return timerId;
};

module.exports = {
  handleAuctionEvents,
  startAuctionTimer
};