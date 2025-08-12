// src/middleware/auth.js

import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { logger } from '../utils/logger.js';

// Main authentication middleware
export const auth = async (req, res, next) => {
  try {
    let token = req.headers.authorization;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    // Remove 'Bearer ' prefix if present
    if (token.startsWith('Bearer ')) {
      token = token.slice(7);
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from database
    const user = await User.findById(decoded.sub).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token - user not found'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Account is deactivated'
      });
    }

    // Attach user to request object
    req.user = user;
    next();

  } catch (error) {
    logger.error('Authentication error:', error.message);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

// Admin authentication middleware
export const adminAuth = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    next();

  } catch (error) {
    logger.error('Admin authentication error:', error.message);
    return res.status(403).json({
      success: false,
      error: 'Admin access denied'
    });
  }
};

// Require active user middleware
export const requireActiveUser = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!req.user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Account is deactivated'
      });
    }

    next();

  } catch (error) {
    logger.error('Active user check error:', error.message);
    return res.status(403).json({
      success: false,
      error: 'Account access denied'
    });
  }
};

// Optional authentication (for public endpoints that can benefit from user context)
export const optionalAuth = async (req, res, next) => {
  try {
    let token = req.headers.authorization;

    if (!token) {
      return next(); // Continue without user context
    }

    if (token.startsWith('Bearer ')) {
      token = token.slice(7);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.sub).select('-password');

    if (user && user.isActive) {
      req.user = user;
    }

    next();

  } catch (error) {
    // Continue without user context if token is invalid
    next();
  }
};

// Rate limiting for specific actions
export const actionRateLimit = (maxAttempts, windowMs) => {
  const attempts = new Map();

  return (req, res, next) => {
    const userId = req.user?._id?.toString();
    const key = `${userId || req.ip}_${req.route.path}`;
    const now = Date.now();

    // Clean old entries
    for (const [k, v] of attempts.entries()) {
      if (now - v.timestamp > windowMs) {
        attempts.delete(k);
      }
    }

    const userAttempts = attempts.get(key);

    if (userAttempts && userAttempts.count >= maxAttempts) {
      const timeLeft = Math.ceil((userAttempts.timestamp + windowMs - now) / 1000);
      return res.status(429).json({
        success: false,
        error: `Too many attempts. Try again in ${timeLeft} seconds.`
      });
    }

    // Update attempts
    if (userAttempts) {
      userAttempts.count += 1;
    } else {
      attempts.set(key, { count: 1, timestamp: now });
    }

    next();
  };
};

// Check if user can perform auction actions
export const canParticipateInAuction = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (req.user.role !== 'manager' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only managers and admins can participate in auctions'
      });
    }

    if (req.user.balance <= 0) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient balance to participate in auction'
      });
    }

    next();

  } catch (error) {
    logger.error('Auction participation check error:', error.message);
    return res.status(403).json({
      success: false,
      error: 'Cannot participate in auction'
    });
  }
};

// Socket authentication middleware
export const authenticateSocket = (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization;

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Remove 'Bearer ' prefix if present
    const cleanToken = token.replace('Bearer ', '');

    jwt.verify(cleanToken, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        return next(new Error('Invalid token'));
      }

      try {
        const user = await User.findById(decoded.sub).select('-password');

        if (!user || !user.isActive) {
          return next(new Error('Invalid or inactive user'));
        }

        socket.user = user;
        socket.userId = user._id.toString();
        next();

      } catch (error) {
        return next(new Error('Authentication failed'));
      }
    });

  } catch (error) {
    return next(new Error('Authentication error'));
  }
};

// Middleware to log authenticated requests
export const logAuthenticatedRequest = (req, res, next) => {
  if (req.user) {
    logger.info(`Authenticated request: ${req.method} ${req.path} by ${req.user.username} (${req.user._id})`);
  }
  next();
};

// Check if user has permission for specific resource
export const checkResourcePermission = (resourceType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user._id;
      const resourceId = req.params.id;

      // Admin can access everything
      if (req.user.role === 'admin') {
        return next();
      }

      // Check specific resource permissions
      switch (resourceType) {
        case 'user':
          // Users can only access their own data
          if (userId.toString() !== resourceId) {
            return res.status(403).json({
              success: false,
              error: 'Access denied to this resource'
            });
          }
          break;

        case 'team':
          // Check if user owns the team/players
          const { default: Player } = await import('../models/Player.js');
          const player = await Player.findById(resourceId);
          if (player && player.soldTo && !player.soldTo.equals(userId)) {
            return res.status(403).json({
              success: false,
              error: 'Access denied to this team resource'
            });
          }
          break;

        default:
          // Allow access for unspecified resources
          break;
      }

      next();

    } catch (error) {
      logger.error('Resource permission check error:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Permission check failed'
      });
    }
  };
};

// Default export with all middleware
export default {
  auth,
  adminAuth,
  requireActiveUser,
  optionalAuth,
  actionRateLimit,
  canParticipateInAuction,
  authenticateSocket,
  logAuthenticatedRequest,
  checkResourcePermission
};