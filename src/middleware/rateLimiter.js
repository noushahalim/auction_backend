// src/middleware/rateLimiter.js

const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');

// General rate limiter for all requests
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests per window
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks and internal requests
    return req.path === '/health' || req.headers['x-internal-request'] === 'true';
  },
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use IP
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for ${req.user?.username || req.ip} on ${req.path}`);
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

// Strict rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: 900 // 15 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  keyGenerator: (req) => {
    // Use username + IP for more specific tracking
    const username = req.body?.username || 'unknown';
    return `auth_${username}_${req.ip}`;
  },
  handler: (req, res) => {
    logger.warn(`Auth rate limit exceeded for ${req.body?.username || 'unknown'} from ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts. Please try again in 15 minutes.',
      retryAfter: 900
    });
  }
});

// Rate limiter for bidding actions
const bidLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 bids per minute
  message: {
    success: false,
    error: 'Too many bids, please slow down.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID for bidding limits
    return `bid_${req.user?.id || req.ip}`;
  },
  handler: (req, res) => {
    logger.warn(`Bid rate limit exceeded for user ${req.user?.username || req.ip}`);
    res.status(429).json({
      success: false,
      error: 'You are bidding too quickly. Please wait a moment before bidding again.',
      retryAfter: 60
    });
  }
});

// Rate limiter for file uploads
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // 10 uploads per window
  message: {
    success: false,
    error: 'Too many file uploads, please try again later.',
    retryAfter: 600
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `upload_${req.user?.id || req.ip}`;
  },
  handler: (req, res) => {
    logger.warn(`Upload rate limit exceeded for user ${req.user?.username || req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many file uploads. Please wait before uploading again.',
      retryAfter: 600
    });
  }
});

// Rate limiter for admin actions
const adminLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // 100 admin actions per window
  message: {
    success: false,
    error: 'Too many admin actions, please slow down.',
    retryAfter: 300
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `admin_${req.user?.id || req.ip}`;
  },
  handler: (req, res) => {
    logger.warn(`Admin rate limit exceeded for user ${req.user?.username || req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many admin actions. Please slow down.',
      retryAfter: 300
    });
  }
});

// Rate limiter for registration requests
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registration attempts per hour
  message: {
    success: false,
    error: 'Too many registration attempts, please try again later.',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `register_${req.ip}`;
  },
  handler: (req, res) => {
    logger.warn(`Registration rate limit exceeded from IP ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many registration attempts. Please try again in 1 hour.',
      retryAfter: 3600
    });
  }
});

// Rate limiter for password reset
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 password reset attempts per window
  message: {
    success: false,
    error: 'Too many password reset attempts, please try again later.',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `password_reset_${req.ip}`;
  },
  handler: (req, res) => {
    logger.warn(`Password reset rate limit exceeded from IP ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many password reset attempts. Please try again in 15 minutes.',
      retryAfter: 900
    });
  }
});

// Custom rate limiter factory
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
      success: false,
      error: 'Rate limit exceeded, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id || req.ip
  };

  return rateLimit({ ...defaultOptions, ...options });
};

// Dynamic rate limiter based on user role
const dynamicRateLimiter = (req, res, next) => {
  let limiter;

  if (req.user?.role === 'admin') {
    // More lenient limits for admins
    limiter = createRateLimiter({
      windowMs: 5 * 60 * 1000,
      max: 200,
      message: {
        success: false,
        error: 'Admin rate limit exceeded, please slow down.'
      }
    });
  } else if (req.user?.role === 'manager') {
    // Standard limits for managers
    limiter = createRateLimiter({
      windowMs: 15 * 60 * 1000,
      max: 100
    });
  } else {
    // Stricter limits for unauthenticated users
    limiter = createRateLimiter({
      windowMs: 15 * 60 * 1000,
      max: 50,
      message: {
        success: false,
        error: 'Rate limit exceeded. Please login for higher limits.'
      }
    });
  }

  limiter(req, res, next);
};

// Rate limiter for socket connections
const socketRateLimiter = (socket, next) => {
  const userId = socket.user?.id || socket.handshake.address;
  const now = Date.now();
  
  // Simple in-memory rate limiting for socket connections
  if (!socket.rateLimitData) {
    socket.rateLimitData = {
      requests: [],
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 60 // 60 requests per minute
    };
  }

  const { requests, windowMs, maxRequests } = socket.rateLimitData;
  
  // Clean old requests
  while (requests.length > 0 && now - requests[0] > windowMs) {
    requests.shift();
  }

  if (requests.length >= maxRequests) {
    logger.warn(`Socket rate limit exceeded for user ${socket.user?.username || socket.handshake.address}`);
    return next(new Error('Rate limit exceeded'));
  }

  requests.push(now);
  next();
};

// Middleware to add rate limit info to response headers
const addRateLimitHeaders = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Add custom rate limit info if available
    if (req.rateLimit) {
      res.set({
        'X-RateLimit-Limit': req.rateLimit.limit,
        'X-RateLimit-Remaining': req.rateLimit.remaining,
        'X-RateLimit-Reset': req.rateLimit.resetTime
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

module.exports = {
  generalLimiter,
  authLimiter,
  bidLimiter,
  uploadLimiter,
  adminLimiter,
  registrationLimiter,
  passwordResetLimiter,
  createRateLimiter,
  dynamicRateLimiter,
  socketRateLimiter,
  addRateLimitHeaders
};