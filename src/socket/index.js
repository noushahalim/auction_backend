// src/socket/index.js

import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { logger } from '../utils/logger.js';
import { SOCKET_EVENTS } from '../utils/constants.js';

// Socket.IO event handlers
import { handleAuctionEvents } from './auctionHandler.js';
import { handleChatEvents } from './chatHandler.js';
import AdminHandler from './adminHandler.js';

// Active connections tracking
const activeConnections = new Map();

// Socket authentication middleware
const authenticateSocket = async (socket, next) => {
    try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.sub);
        
        if (!user || !user.isActive) {
            return next(new Error('Invalid or inactive user'));
        }

        socket.user = user;
        socket.userId = user._id.toString();
        logger.info(`Socket authenticated: ${user.username} (${socket.id})`);
        next();
    } catch (error) {
        logger.error('Socket authentication failed:', error.message);
        next(new Error('Authentication failed'));
    }
};

// Main socket handler
const handleConnection = (io) => {
    return (socket) => {
        const user = socket.user;
        logger.info(`User connected: ${user.username} (${socket.id})`);

        // Track active connection
        activeConnections.set(socket.userId, {
            socketId: socket.id,
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role
            },
            connectedAt: new Date()
        });

        // Join user-specific room for personal notifications
        socket.join(`user:${user._id}`);

        // Join role-based room
        socket.join(`role:${user.role}`);

        // Send connection confirmation
        socket.emit(SOCKET_EVENTS.CONNECTION, {
            success: true,
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role
            },
            timestamp: new Date()
        });

        // Auction-related events
        handleAuctionEvents(io, socket);

        // Chat-related events
        handleChatEvents(io, socket);

        // Admin-related events (if user is admin)
        if (user.role === 'admin') {
            const adminHandler = new AdminHandler(io);
            adminHandler.handleConnection(socket);
        }

        // Handle joining auction room
        socket.on(SOCKET_EVENTS.JOIN_AUCTION, async (data) => {
            try {
                const { auctionId } = data;
                if (!auctionId) {
                    return socket.emit(SOCKET_EVENTS.ERROR, { message: 'Auction ID required' });
                }

                // Verify auction exists and is accessible
                const { default: Auction } = await import('../models/Auction.js');
                const auction = await Auction.findById(auctionId);
                if (!auction) {
                    return socket.emit(SOCKET_EVENTS.ERROR, { message: 'Auction not found' });
                }

                // Join auction room
                socket.join(`auction:${auctionId}`);
                logger.info(`User ${user.username} joined auction ${auctionId}`);

                // Notify others in the auction room
                socket.to(`auction:${auctionId}`).emit('userJoinedAuction', {
                    user: {
                        id: user._id,
                        username: user.username,
                        name: user.name
                    },
                    timestamp: new Date()
                });

                // Send auction state to the user
                if (auction.status === 'ongoing' && auction.currentPlayerId) {
                    const { default: Player } = await import('../models/Player.js');
                    const currentPlayer = await Player.findById(auction.currentPlayerId);
                    
                    socket.emit('auctionState', {
                        auction: {
                            id: auction._id,
                            name: auction.name,
                            status: auction.status,
                            mode: auction.mode,
                            currentPlayer,
                            currentBid: auction.currentBid,
                            timerDuration: auction.timerDuration
                        }
                    });
                }

                socket.emit('joinedAuction', { auctionId, success: true });
            } catch (error) {
                logger.error('Join auction error:', error);
                socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to join auction' });
            }
        });

        // Handle leaving auction room
        socket.on(SOCKET_EVENTS.LEAVE_AUCTION, (data) => {
            try {
                const { auctionId } = data;
                if (auctionId) {
                    socket.leave(`auction:${auctionId}`);
                    
                    // Notify others in the auction room
                    socket.to(`auction:${auctionId}`).emit('userLeftAuction', {
                        user: {
                            id: user._id,
                            username: user.username,
                            name: user.name
                        },
                        timestamp: new Date()
                    });
                    
                    logger.info(`User ${user.username} left auction ${auctionId}`);
                }

                socket.emit('leftAuction', { auctionId, success: true });
            } catch (error) {
                logger.error('Leave auction error:', error);
                socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to leave auction' });
            }
        });

        // Handle ping/pong for connection health
        socket.on('ping', () => {
            socket.emit('pong', { timestamp: new Date() });
        });

        // Handle user status updates
        socket.on('updateStatus', (data) => {
            const connection = activeConnections.get(socket.userId);
            if (connection) {
                connection.status = data.status;
                connection.lastActivity = new Date();
            }
        });

        // Handle disconnection
        socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
            logger.info(`User disconnected: ${user.username} (${socket.id}) - Reason: ${reason}`);
            
            // Remove from active connections
            activeConnections.delete(socket.userId);

            // Notify auction rooms about user leaving
            const rooms = Array.from(socket.rooms);
            rooms.forEach(room => {
                if (room.startsWith('auction:')) {
                    socket.to(room).emit('userLeftAuction', {
                        user: {
                            id: user._id,
                            username: user.username,
                            name: user.name
                        },
                        reason: 'disconnected',
                        timestamp: new Date()
                    });
                }
            });
        });

        // Error handling
        socket.on('error', (error) => {
            logger.error(`Socket error for user ${user.username}:`, error);
        });
    };
};

// Get active connections (for admin)
const getActiveConnections = () => {
    return Array.from(activeConnections.values());
};

// Broadcast to all users
const broadcastToAll = (io, event, data) => {
    io.emit(event, data);
    logger.info(`Broadcast sent to all users: ${event}`);
};

// Broadcast to specific role
const broadcastToRole = (io, role, event, data) => {
    io.to(`role:${role}`).emit(event, data);
    logger.info(`Broadcast sent to role ${role}: ${event}`);
};

// Send to specific user
const sendToUser = (io, userId, event, data) => {
    io.to(`user:${userId}`).emit(event, data);
    logger.info(`Message sent to user ${userId}: ${event}`);
};

// Send to auction participants
const sendToAuction = (io, auctionId, event, data) => {
    io.to(`auction:${auctionId}`).emit(event, data);
    logger.info(`Message sent to auction ${auctionId}: ${event}`);
};

export default (io) => {
    // Apply authentication middleware
    io.use(authenticateSocket);

    // Handle connections
    io.on(SOCKET_EVENTS.CONNECTION, handleConnection(io));

    // Store io instance for use in other parts of the app
    io.getActiveConnections = getActiveConnections;
    io.broadcastToAll = (event, data) => broadcastToAll(io, event, data);
    io.broadcastToRole = (role, event, data) => broadcastToRole(io, role, event, data);
    io.sendToUser = (userId, event, data) => sendToUser(io, userId, event, data);
    io.sendToAuction = (auctionId, event, data) => sendToAuction(io, auctionId, event, data);

    logger.info('Socket.IO server initialized');
    return io;
};

export {
    getActiveConnections,
    broadcastToAll,
    broadcastToRole,
    sendToUser,
    sendToAuction,
    authenticateSocket
};