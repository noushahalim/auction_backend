// src/socket/chatHandler.js

import { logger } from '../utils/logger.js';

// Handle chat-related socket events
const handleChatEvents = (io, socket) => {
    const user = socket.user;

    // Send chat message
    socket.on('sendMessage', async (data) => {
        try {
            const { auctionId, message, messageType = 'text' } = data;

            if (!message || !message.trim()) {
                return socket.emit('error', { message: 'Message cannot be empty' });
            }

            if (message.length > 500) {
                return socket.emit('error', { message: 'Message too long (max 500 characters)' });
            }

            // Basic profanity filter (can be enhanced)
            const profanityWords = ['spam', 'scam', 'fake']; // Add more as needed
            const containsProfanity = profanityWords.some(word =>
                message.toLowerCase().includes(word.toLowerCase())
            );

            if (containsProfanity) {
                return socket.emit('messageBlocked', {
                    message: 'Message contains inappropriate content',
                    originalMessage: message
                });
            }

            const chatMessage = {
                id: `msg_${Date.now()}_${user._id}`,
                user: {
                    id: user._id,
                    username: user.username,
                    name: user.name,
                    avatarUrl: user.avatarUrl,
                    role: user.role
                },
                message: message.trim(),
                messageType,
                timestamp: new Date(),
                auctionId
            };

            // Send to all participants in the auction room
            if (auctionId) {
                io.to(`auction:${auctionId}`).emit('newMessage', chatMessage);
            } else {
                // Global chat (if enabled)
                io.emit('newMessage', chatMessage);
            }

            // Confirm message sent to sender
            socket.emit('messageSent', {
                messageId: chatMessage.id,
                timestamp: chatMessage.timestamp
            });

            logger.info(`Chat message sent: ${user.username} in auction ${auctionId || 'global'}`);
        } catch (error) {
            logger.error('Send message error:', error.message);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    // Send emoji reaction
    socket.on('sendReaction', async (data) => {
        try {
            const { auctionId, emoji, targetMessageId } = data;

            if (!emoji) {
                return socket.emit('error', { message: 'Emoji is required' });
            }

            // Validate emoji (basic validation)
            const allowedEmojis = ['👍', '👎', '❤️', '😂', '😮', '😢', '😡', '🔥', '💰', '⚡'];
            if (!allowedEmojis.includes(emoji)) {
                return socket.emit('error', { message: 'Invalid emoji' });
            }

            const reaction = {
                id: `reaction_${Date.now()}_${user._id}`,
                user: {
                    id: user._id,
                    username: user.username,
                    name: user.name,
                    avatarUrl: user.avatarUrl
                },
                emoji,
                targetMessageId,
                timestamp: new Date(),
                auctionId
            };

            // Send to all participants
            if (auctionId) {
                io.to(`auction:${auctionId}`).emit('newReaction', reaction);
            } else {
                io.emit('newReaction', reaction);
            }

            logger.info(`Reaction sent: ${user.username} reacted with ${emoji}`);
        } catch (error) {
            logger.error('Send reaction error:', error.message);
            socket.emit('error', { message: 'Failed to send reaction' });
        }
    });

    // Send typing indicator
    socket.on('typing', (data) => {
        try {
            const { auctionId, isTyping } = data;
            
            const typingData = {
                user: {
                    id: user._id,
                    username: user.username,
                    name: user.name
                },
                isTyping,
                timestamp: new Date()
            };

            // Broadcast typing status to others in the room (but not to sender)
            if (auctionId) {
                socket.to(`auction:${auctionId}`).emit('userTyping', typingData);
            } else {
                socket.broadcast.emit('userTyping', typingData);
            }
        } catch (error) {
            logger.error('Typing indicator error:', error.message);
        }
    });

    // Request chat history
    socket.on('getChatHistory', async (data) => {
        try {
            const { auctionId, limit = 50, before } = data;
            
            // For this implementation, we'll return a simple response
            // In a production app, you'd want to store chat history in database
            const history = {
                messages: [],
                hasMore: false,
                auctionId
            };

            socket.emit('chatHistory', history);
        } catch (error) {
            logger.error('Get chat history error:', error.message);
            socket.emit('error', { message: 'Failed to load chat history' });
        }
    });

    // Admin-only chat commands
    if (user.role === 'admin') {
        // Clear chat
        socket.on('clearChat', async (data) => {
            try {
                const { auctionId } = data;
                
                const clearMessage = {
                    id: `clear_${Date.now()}`,
                    type: 'system',
                    message: `Chat cleared by ${user.name}`,
                    timestamp: new Date(),
                    auctionId
                };

                if (auctionId) {
                    io.to(`auction:${auctionId}`).emit('chatCleared', clearMessage);
                } else {
                    io.emit('chatCleared', clearMessage);
                }

                logger.info(`Chat cleared by admin ${user.username} in auction ${auctionId || 'global'}`);
            } catch (error) {
                logger.error('Clear chat error:', error.message);
                socket.emit('error', { message: 'Failed to clear chat' });
            }
        });

        // Mute user
        socket.on('muteUser', async (data) => {
            try {
                const { auctionId, userId, duration = 300 } = data; // 5 minutes default

                // In a production app, you'd store mute status in database
                const muteMessage = {
                    id: `mute_${Date.now()}`,
                    type: 'system',
                    message: `User muted by ${user.name} for ${duration} seconds`,
                    timestamp: new Date(),
                    auctionId,
                    mutedUserId: userId
                };

                if (auctionId) {
                    io.to(`auction:${auctionId}`).emit('userMuted', muteMessage);
                } else {
                    io.emit('userMuted', muteMessage);
                }

                logger.info(`User ${userId} muted by admin ${user.username} for ${duration} seconds`);
            } catch (error) {
                logger.error('Mute user error:', error.message);
                socket.emit('error', { message: 'Failed to mute user' });
            }
        });

        // Send system announcement
        socket.on('sendAnnouncement', async (data) => {
            try {
                const { auctionId, message, priority = 'normal' } = data;

                if (!message || !message.trim()) {
                    return socket.emit('error', { message: 'Announcement message cannot be empty' });
                }

                const announcement = {
                    id: `announcement_${Date.now()}`,
                    type: 'announcement',
                    message: message.trim(),
                    priority,
                    sender: {
                        id: user._id,
                        username: user.username,
                        name: user.name,
                        role: user.role
                    },
                    timestamp: new Date(),
                    auctionId
                };

                if (auctionId) {
                    io.to(`auction:${auctionId}`).emit('announcement', announcement);
                } else {
                    io.emit('announcement', announcement);
                }

                logger.info(`Announcement sent by admin ${user.username}: ${message}`);
            } catch (error) {
                logger.error('Send announcement error:', error.message);
                socket.emit('error', { message: 'Failed to send announcement' });
            }
        });
    }

    // Handle chat-specific disconnection
    socket.on('leaveChatRoom', (data) => {
        try {
            const { auctionId } = data;
            
            if (auctionId) {
                socket.leave(`chat:${auctionId}`);
                
                // Notify others that user left chat
                socket.to(`chat:${auctionId}`).emit('userLeftChat', {
                    user: {
                        id: user._id,
                        username: user.username,
                        name: user.name
                    },
                    timestamp: new Date()
                });
            }

            logger.info(`User ${user.username} left chat room ${auctionId || 'global'}`);
        } catch (error) {
            logger.error('Leave chat room error:', error.message);
        }
    });
};

// Chat message validation and filtering
const validateMessage = (message) => {
    if (!message || typeof message !== 'string') {
        return { valid: false, error: 'Invalid message format' };
    }

    if (message.length > 500) {
        return { valid: false, error: 'Message too long' };
    }

    if (message.trim().length === 0) {
        return { valid: false, error: 'Empty message' };
    }

    // Basic spam detection
    const spamPatterns = [
        /(.)\1{10,}/, // Repeated characters
        /https?:\/\/[^\s]+/g, // URLs (could be spam)
        /(.+)\1{3,}/ // Repeated phrases
    ];

    for (const pattern of spamPatterns) {
        if (pattern.test(message)) {
            return { valid: false, error: 'Message appears to be spam' };
        }
    }

    return { valid: true };
};

// Profanity filter (basic implementation)
const filterProfanity = (message) => {
    const profanityWords = [
        'spam', 'scam', 'fake', 'cheat', 'hack',
        // Add more words as needed
    ];

    let filteredMessage = message;
    profanityWords.forEach(word => {
        const regex = new RegExp(word, 'gi');
        filteredMessage = filteredMessage.replace(regex, '*'.repeat(word.length));
    });

    return {
        filtered: filteredMessage,
        containedProfanity: filteredMessage !== message
    };
};

// Rate limiting for chat messages
const chatRateLimiter = new Map();

const checkChatRateLimit = (userId) => {
    const now = Date.now();
    const userLimits = chatRateLimiter.get(userId) || { count: 0, resetTime: now + 60000 };

    // Reset if time window has passed
    if (now > userLimits.resetTime) {
        userLimits.count = 0;
        userLimits.resetTime = now + 60000; // 1 minute window
    }

    userLimits.count++;
    chatRateLimiter.set(userId, userLimits);

    // Allow 30 messages per minute
    return userLimits.count <= 30;
};

// Auto-moderation features
const autoModerate = (message, user) => {
    const moderation = {
        action: 'allow',
        reason: null,
        filteredMessage: message
    };

    // Check rate limiting
    if (!checkChatRateLimit(user._id)) {
        moderation.action = 'block';
        moderation.reason = 'Rate limit exceeded';
        return moderation;
    }

    // Validate message
    const validation = validateMessage(message);
    if (!validation.valid) {
        moderation.action = 'block';
        moderation.reason = validation.error;
        return moderation;
    }

    // Filter profanity
    const filtered = filterProfanity(message);
    moderation.filteredMessage = filtered.filtered;
    if (filtered.containedProfanity) {
        moderation.action = 'warn';
        moderation.reason = 'Message contained inappropriate content and was filtered';
    }

    return moderation;
};

export {
    handleChatEvents,
    validateMessage,
    filterProfanity,
    checkChatRateLimit,
    autoModerate
};