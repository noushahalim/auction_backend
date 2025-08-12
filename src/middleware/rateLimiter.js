// src/middleware/rateLimiter.js

import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger.js';
import { fileURLToPath } from 'url';
import path from 'path';

// Helper to get __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Factory for custom limiters
export function createRateLimiter(options = {}) {
  const defaultOptions = {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
      success: false,
      error: 'Rate limit exceeded, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id || req.ip
  };
  return rateLimit({ ...defaultOptions, ...options });
}

// 2. General rate limiter (default export)
const rateLimiter = createRateLimiter({
  handler: (req, res) => {
    logger.warn(`General rate limit exceeded for ${req.user?.username || req.ip} on ${req.path}`);
    const resetSec = Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000);
    res.set('Retry-After', resetSec);
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later.',
      retryAfter: resetSec
    });
  },
  skip: (req) => req.path === '/health' || req.headers['x-internal-request'] === 'true'
});
export default rateLimiter;

// 3. Strict rate limiter for sensitive endpoints
export const strictRateLimiter = createRateLimiter({
  max: 10,
  handler: (req, res) => {
    logger.warn(`Strict rate limit exceeded for ${req.ip}`, {
      path: req.path,
      method: req.method
    });
    res.set('Retry-After', Math.ceil(15 * 60));
    res.status(429).json({
      success: false,
      error: 'Too many attempts from this IP, please try again later.'
    });
  }
});

// 4. Auth limiter (login/register)
export const authLimiter = createRateLimiter({
  max: 5,
  windowMs: 15 * 60 * 1000,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    logger.warn(`Auth rate limit exceeded for ${req.ip}`, {
      path: req.path,
      method: req.method
    });
    res.set('Retry-After', Math.ceil(15 * 60));
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts, please try again later.'
    });
  }
});

// 5. Bid limiter
export const bidLimiter = createRateLimiter({
  max: 30,
  windowMs: 60 * 1000,
  message: {
    success: false,
    error: 'Too many bids, please slow down.'
  },
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res) => {
    const who = req.user ? `${req.user.username} (${req.user.id})` : req.ip;
    logger.warn(`Bid rate limit exceeded for ${who}`, {
      path: req.path,
      method: req.method
    });
    res.set('Retry-After', Math.ceil(60));
    res.status(429).json({
      success: false,
      error: 'You are bidding too quickly. Please wait a moment before bidding again.'
    });
  }
});

// 6. Upload limiter
export const uploadLimiter = createRateLimiter({
  max: 10,
  windowMs: 10 * 60 * 1000,
  message: {
    success: false,
    error: 'Too many file uploads, please try again later.'
  },
  handler: (req, res) => {
    const who = req.user?.username || req.ip;
    logger.warn(`Upload rate limit exceeded for ${who}`, {
      path: req.path,
      method: req.method
    });
    res.set('Retry-After', Math.ceil(600));
    res.status(429).json({
      success: false,
      error: 'Too many file uploads. Please wait before uploading again.'
    });
  }
});

// 7. Admin limiter
export const adminLimiter = createRateLimiter({
  max: 100,
  windowMs: 5 * 60 * 1000,
  message: {
    success: false,
    error: 'Too many admin actions, please slow down.'
  },
  handler: (req, res) => {
    const who = req.user ? `${req.user.username} (${req.user.id})` : req.ip;
    logger.warn(`Admin rate limit exceeded for ${who}`, {
      path: req.path,
      method: req.method
    });
    res.set('Retry-After', Math.ceil(300));
    res.status(429).json({
      success: false,
      error: 'Too many admin actions. Please slow down.'
    });
  }
});

// 8. Registration limiter
export const registrationLimiter = createRateLimiter({
  max: 3,
  windowMs: 60 * 60 * 1000,
  message: {
    success: false,
    error: 'Too many registration attempts, please try again later.'
  },
  handler: (req, res) => {
    logger.warn(`Registration limiter triggered from ${req.ip}`);
    res.set('Retry-After', Math.ceil(3600));
    res.status(429).json({
      success: false,
      error: 'Too many registration attempts. Please try again in 1 hour.'
    });
  }
});

// 9. Password reset limiter
export const passwordResetLimiter = createRateLimiter({
  max: 3,
  windowMs: 15 * 60 * 1000,
  message: {
    success: false,
    error: 'Too many password reset attempts, please try again later.'
  },
  handler: (req, res) => {
    logger.warn(`Password reset limiter triggered from ${req.ip}`);
    res.set('Retry-After', Math.ceil(900));
    res.status(429).json({
      success: false,
      error: 'Too many password reset attempts. Please try again in 15 minutes.'
    });
  }
});

// 10. Dynamic role-based limiter
export function dynamicRateLimiter(req, res, next) {
  let limiter;
  if (req.user?.role === 'admin') {
    limiter = adminLimiter;
  } else if (req.user?.role === 'manager') {
    limiter = rateLimiter;
  } else {
    limiter = createRateLimiter({
      max: 50,
      windowMs: 15 * 60 * 1000,
      message: {
        success: false,
        error: 'Rate limit exceeded. Please login for higher limits.'
      }
    });
  }
  return limiter(req, res, next);
}

// 11. Socket.IO rate limiter
export function socketRateLimiter(socket, next) {
  const now = Date.now();
  socket.rateLimitData = socket.rateLimitData || { requests: [], windowMs: 60 * 1000, max: 60 };

  socket.rateLimitData.requests = socket.rateLimitData.requests.filter(ts => now - ts < socket.rateLimitData.windowMs);

  if (socket.rateLimitData.requests.length >= socket.rateLimitData.max) {
    logger.warn(`Socket rate limit exceeded for ${socket.handshake.address}`);
    return next(new Error('Rate limit exceeded'));
  }

  socket.rateLimitData.requests.push(now);
  next();
}

// 12. Add rate-limit headers to responses
export function addRateLimitHeaders(req, res, next) {
  const rl = req.rateLimit;
  if (rl) {
    res.set({
      'X-RateLimit-Limit': rl.limit,
      'X-RateLimit-Remaining': rl.remaining,
      'X-RateLimit-Reset': rl.resetTime
    });
  }
  next();
}
