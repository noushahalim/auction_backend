// src/socket/adminHandler.js

// Handles Socket.IO events for admin operations during auctions

import { logger } from '../utils/logger.js';
import auctionService from '../services/auctionService.js';
import playerService from '../services/playerService.js';
import notificationService from '../services/notificationService.js';
import broadcastService from '../services/broadcastService.js';
import { formatCurrency } from '../utils/helpers.js';

class AdminHandler {
  constructor(io) {
    this.io = io;
  }

  // Handle admin socket connection
  handleConnection(socket) {
    const user = socket.request.user;

    // Verify admin role
    if (!user || user.role !== 'admin') {
      logger.warn('Non-admin user attempted to connect to admin socket', {
        userId: user?._id,
        role: user?.role
      });
      socket.disconnect();
      return;
    }

    logger.info('Admin connected to socket', {
      adminId: user._id,
      username: user.username,
      socketId: socket.id
    });

    // Join admin room
    socket.join('admin');

    // Send current system status
    this.sendSystemStatus(socket);

    // Auction Control Events
    socket.on('auction:start', (data) => this.handleStartAuction(socket, data));
    socket.on('auction:stop', (data) => this.handleStopAuction(socket, data));
    socket.on('auction:continue', (data) => this.handleContinueAuction(socket, data));
    socket.on('auction:skip', (data) => this.handleSkipPlayer(socket, data));
    socket.on('auction:final-call', (data) => this.handleFinalCall(socket, data));
    socket.on('auction:next-player', (data) => this.handleNextPlayer(socket, data));
    socket.on('auction:undo-bid', (data) => this.handleUndoBid(socket, data));
    socket.on('auction:next-category', (data) => this.handleNextCategory(socket, data));

    // Manager Information Events
    socket.on('auction:get-managers', (data) => this.handleGetManagers(socket, data));
    socket.on('auction:get-manager-details', (data) => this.handleGetManagerDetails(socket, data));

    // Broadcast Events
    socket.on('broadcast:send', (data) => this.handleSendBroadcast(socket, data));

    // System Events
    socket.on('system:get-status', () => this.sendSystemStatus(socket));
    
    // Handle disconnection
    socket.on('disconnect', () => this.handleDisconnection(socket));
  }

  // Auction Control Handlers
  async handleStartAuction(socket, data) {
    try {
      const { auctionId } = data;
      const adminId = socket.request.user._id;

      logger.info('Admin starting auction', { auctionId, adminId });

      const result = await auctionService.startAuction(auctionId, adminId);

      // Broadcast to all users that auction started
      this.io.emit('auction:started', {
        auctionId,
        auctionName: result.auction.name,
        message: `${result.auction.name} has started! Join now!`
      });

      // Send success response to admin
      socket.emit('auction:start:success', {
        message: 'Auction started successfully',
        auction: result.auction,
        currentPlayer: result.currentPlayer
      });

      // Notify all users
      await notificationService.notifyAuctionStarted({
        id: auctionId,
        name: result.auction.name
      });

      logger.info('Auction started successfully', { auctionId, adminId });

    } catch (error) {
      logger.error('Error starting auction:', error);
      socket.emit('auction:start:error', {
        message: error.message || 'Failed to start auction'
      });
    }
  }

  async handleStopAuction(socket, data) {
    try {
      const { auctionId, reason } = data;
      const adminId = socket.request.user._id;

      logger.info('Admin stopping auction', { auctionId, adminId, reason });

      const result = await auctionService.stopAuction(auctionId, adminId, reason);

      // Broadcast to auction room
      this.io.to(`auction:${auctionId}`).emit('auction:stopped', {
        message: 'Auction has been paused by admin',
        reason,
        currentState: result.currentState
      });

      socket.emit('auction:stop:success', {
        message: 'Auction stopped successfully',
        currentState: result.currentState
      });

      logger.info('Auction stopped successfully', { auctionId, adminId });

    } catch (error) {
      logger.error('Error stopping auction:', error);
      socket.emit('auction:stop:error', {
        message: error.message || 'Failed to stop auction'
      });
    }
  }

  async handleContinueAuction(socket, data) {
    try {
      const { auctionId } = data;
      const adminId = socket.request.user._id;

      logger.info('Admin continuing auction', { auctionId, adminId });

      const result = await auctionService.continueAuction(auctionId, adminId);

      // Broadcast to auction room
      this.io.to(`auction:${auctionId}`).emit('auction:continued', {
        message: 'Auction has been resumed',
        currentPlayer: result.currentPlayer,
        timeRemaining: result.timeRemaining
      });

      socket.emit('auction:continue:success', {
        message: 'Auction continued successfully',
        currentPlayer: result.currentPlayer
      });

      logger.info('Auction continued successfully', { auctionId, adminId });

    } catch (error) {
      logger.error('Error continuing auction:', error);
      socket.emit('auction:continue:error', {
        message: error.message || 'Failed to continue auction'
      });
    }
  }

  async handleSkipPlayer(socket, data) {
    try {
      const { auctionId, playerId, reason } = data;
      const adminId = socket.request.user._id;

      logger.info('Admin skipping player', { auctionId, playerId, adminId, reason });

      const result = await auctionService.skipPlayer(auctionId, playerId, adminId, reason);

      // Broadcast to auction room
      this.io.to(`auction:${auctionId}`).emit('player:skipped', {
        message: `${result.skippedPlayer.name} has been skipped`,
        skippedPlayer: result.skippedPlayer,
        nextPlayer: result.nextPlayer,
        reason
      });

      socket.emit('auction:skip:success', {
        message: 'Player skipped successfully',
        skippedPlayer: result.skippedPlayer,
        nextPlayer: result.nextPlayer
      });

      logger.info('Player skipped successfully', { playerId, auctionId, adminId });

    } catch (error) {
      logger.error('Error skipping player:', error);
      socket.emit('auction:skip:error', {
        message: error.message || 'Failed to skip player'
      });
    }
  }

  async handleFinalCall(socket, data) {
    try {
      const { auctionId, playerId } = data;
      const adminId = socket.request.user._id;

      logger.info('Admin making final call', { auctionId, playerId, adminId });

      const result = await auctionService.finalCall(auctionId, playerId, adminId);

      // Broadcast to auction room
      this.io.to(`auction:${auctionId}`).emit('auction:final-call', {
        message: `Final call for ${result.player.name}!`,
        player: result.player,
        currentBid: result.currentBid,
        leadingBidder: result.leadingBidder,
        timeRemaining: result.timeRemaining || 10 // Final call period
      });

      socket.emit('auction:final-call:success', {
        message: 'Final call initiated',
        player: result.player,
        timeRemaining: result.timeRemaining
      });

      logger.info('Final call initiated', { playerId, auctionId, adminId });

    } catch (error) {
      logger.error('Error making final call:', error);
      socket.emit('auction:final-call:error', {
        message: error.message || 'Failed to make final call'
      });
    }
  }

  async handleNextPlayer(socket, data) {
    try {
      const { auctionId } = data;
      const adminId = socket.request.user._id;

      logger.info('Admin moving to next player', { auctionId, adminId });

      const result = await auctionService.moveToNextPlayer(auctionId, adminId);

      // Broadcast to auction room
      this.io.to(`auction:${auctionId}`).emit('auction:next-player', {
        message: result.nextPlayer ? `Next player: ${result.nextPlayer.name}` : 'Category completed',
        nextPlayer: result.nextPlayer,
        categoryCompleted: !result.nextPlayer,
        nextCategory: result.nextCategory
      });

      socket.emit('auction:next-player:success', {
        message: 'Moved to next player successfully',
        nextPlayer: result.nextPlayer,
        categoryCompleted: !result.nextPlayer
      });

      logger.info('Moved to next player', { auctionId, adminId });

    } catch (error) {
      logger.error('Error moving to next player:', error);
      socket.emit('auction:next-player:error', {
        message: error.message || 'Failed to move to next player'
      });
    }
  }

  async handleUndoBid(socket, data) {
    try {
      const { auctionId, playerId, reason } = data;
      const adminId = socket.request.user._id;

      logger.info('Admin undoing bid', { auctionId, playerId, adminId, reason });

      const result = await auctionService.undoBid(auctionId, playerId, adminId, reason);

      // Broadcast to auction room
      this.io.to(`auction:${auctionId}`).emit('bid:undone', {
        message: 'Last bid has been undone by admin',
        player: result.player,
        previousBid: result.previousBid,
        currentBid: result.currentBid,
        reason
      });

      socket.emit('auction:undo:success', {
        message: 'Bid undone successfully',
        player: result.player,
        currentBid: result.currentBid
      });

      logger.info('Bid undone successfully', { playerId, auctionId, adminId });

    } catch (error) {
      logger.error('Error undoing bid:', error);
      socket.emit('auction:undo:error', {
        message: error.message || 'Failed to undo bid'
      });
    }
  }

  async handleNextCategory(socket, data) {
    try {
      const { auctionId } = data;
      const adminId = socket.request.user._id;

      logger.info('Admin moving to next category', { auctionId, adminId });

      const result = await auctionService.moveToNextCategory(auctionId, adminId);

      // Broadcast to auction room
      this.io.to(`auction:${auctionId}`).emit('auction:next-category', {
        message: `Moving to ${result.nextCategory} category`,
        nextCategory: result.nextCategory,
        firstPlayer: result.firstPlayer,
        categoryStats: result.categoryStats
      });

      socket.emit('auction:next-category:success', {
        message: 'Moved to next category successfully',
        nextCategory: result.nextCategory,
        firstPlayer: result.firstPlayer
      });

      logger.info('Moved to next category', { auctionId, adminId });

    } catch (error) {
      logger.error('Error moving to next category:', error);
      socket.emit('auction:next-category:error', {
        message: error.message || 'Failed to move to next category'
      });
    }
  }

  // Manager Information Handlers
  async handleGetManagers(socket, data) {
    try {
      const { auctionId } = data;

      // Get all managers with their current balance and team info
      const managers = await auctionService.getAuctionManagers(auctionId);

      const managersSummary = managers.map(manager => ({
        id: manager._id,
        name: manager.name,
        teamName: manager.teamName,
        balance: manager.balance,
        playersCount: manager.playersCount || 0
      }));

      // Broadcast to auction room
      this.io.to(`auction:${auctionId}`).emit('chat:managers-list', {
        type: 'system',
        message: 'Current Managers Status:',
        data: managersSummary,
        timestamp: new Date().toISOString()
      });

      socket.emit('auction:managers:success', {
        managers: managersSummary
      });

    } catch (error) {
      logger.error('Error getting managers:', error);
      socket.emit('auction:managers:error', {
        message: error.message || 'Failed to get managers'
      });
    }
  }

  async handleGetManagerDetails(socket, data) {
    try {
      const { auctionId } = data;

      // Get detailed manager information
      const managersDetails = await auctionService.getDetailedManagerInfo(auctionId);

      const detailedInfo = managersDetails.map(manager => ({
        name: manager.name,
        teamName: manager.teamName,
        balance: formatCurrency(manager.balance),
        players: manager.players.map(player => ({
          name: player.name,
          category: player.category,
          amount: formatCurrency(player.soldPrice)
        })),
        totalSpent: formatCurrency(manager.totalSpent)
      }));

      // Broadcast to auction room
      this.io.to(`auction:${auctionId}`).emit('chat:manager-details', {
        type: 'system',
        message: 'Detailed Manager Information:',
        data: detailedInfo,
        timestamp: new Date().toISOString()
      });

      socket.emit('auction:manager-details:success', {
        details: detailedInfo
      });

    } catch (error) {
      logger.error('Error getting manager details:', error);
      socket.emit('auction:manager-details:error', {
        message: error.message || 'Failed to get manager details'
      });
    }
  }

  // Broadcast Handler
  async handleSendBroadcast(socket, data) {
    try {
      const { message, type = 'admin', priority = 'normal' } = data;
      const adminId = socket.request.user._id;

      logger.info('Admin sending broadcast', { adminId, type, priority });

      const broadcast = await broadcastService.createBroadcast({
        message,
        type,
        priority,
        createdBy: adminId
      });

      // Send to all connected users
      this.io.emit('broadcast:message', {
        id: broadcast._id,
        message: broadcast.message,
        type: broadcast.type,
        priority: broadcast.priority,
        timestamp: broadcast.createdAt
      });

      socket.emit('broadcast:send:success', {
        message: 'Broadcast sent successfully',
        broadcast
      });

      logger.info('Broadcast sent successfully', { broadcastId: broadcast._id, adminId });

    } catch (error) {
      logger.error('Error sending broadcast:', error);
      socket.emit('broadcast:send:error', {
        message: error.message || 'Failed to send broadcast'
      });
    }
  }

  // System Status
  async sendSystemStatus(socket) {
    try {
      // Get current system status
      const status = {
        timestamp: new Date().toISOString(),
        connectedUsers: this.io.engine.clientsCount,
        activeAuctions: await this.getActiveAuctionsCount(),
        systemHealth: 'healthy' // Could be more sophisticated
      };

      socket.emit('system:status', status);

    } catch (error) {
      logger.error('Error sending system status:', error);
      socket.emit('system:status', {
        timestamp: new Date().toISOString(),
        error: 'Failed to get system status'
      });
    }
  }

  // Helper Methods
  async getActiveAuctionsCount() {
    try {
      // This would typically come from auction service
      return await auctionService.getActiveAuctionsCount();
    } catch (error) {
      logger.error('Error getting active auctions count:', error);
      return 0;
    }
  }

  // Handle disconnection
  handleDisconnection(socket) {
    const user = socket.request.user;
    
    logger.info('Admin disconnected from socket', {
      adminId: user._id,
      username: user.username,
      socketId: socket.id
    });

    // Leave admin room
    socket.leave('admin');
  }

  // Broadcast admin notification to all admin sockets
  broadcastToAdmins(event, data) {
    this.io.to('admin').emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  // Send notification to specific admin
  sendToAdmin(adminId, event, data) {
    this.io.to(`user:${adminId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
  }
}

export default AdminHandler;