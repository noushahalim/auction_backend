// src/utils/helpers.js
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.js';

/**
 * Generate JWT token
 */
export const generateToken = (payload, expiresIn = '24h') => {
  try {
    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn,
      issuer: 'auction-platform',
      audience: 'auction-users'
    });
  } catch (error) {
    logger.error('Token generation failed:', error);
    throw new Error('Failed to generate token');
  }
};

/**
 * Verify JWT token
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'auction-platform',
      audience: 'auction-users'
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    }
    throw error;
  }
};

/**
 * Generate correlation ID for request tracking
 */
export const generateCorrelationId = () => uuidv4();

/**
 * Format currency amount
 */
export const formatCurrency = (amount, currency = 'credits') => {
  if (typeof amount !== 'number') return '0';
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
  return `${formatted} ${currency}`;
};

/**
 * Format large numbers with suffixes (K, M, B)
 */
export const formatNumber = (num) => {
  if (typeof num !== 'number') return '0';
  const abs = Math.abs(num), sign = num < 0 ? '-' : '';
  if (abs >= 1e9)   return sign + (abs/1e9).toFixed(1) + 'B';
  if (abs >= 1e6)   return sign + (abs/1e6).toFixed(1) + 'M';
  if (abs >= 1e3)   return sign + (abs/1e3).toFixed(1) + 'K';
  return sign + abs.toString();
};

/**
 * Validate email format
 */
export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/**
 * Validate username format
 */
export const isValidUsername = (username) =>
  /^[a-zA-Z0-9_]{3,20}$/.test(username);

/**
 * Validate password strength
 */
export const isValidPassword = (password) => password.length >= 8;

/**
 * Sanitize user input
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '').slice(0, 1000);
};

/**
 * Calculate time remaining in seconds
 */
export const getTimeRemaining = (endTime) => {
  const now = Date.now(), end = new Date(endTime).getTime();
  return Math.max(0, Math.floor((end - now)/1000));
};

/**
 * Format time duration
 */
export const formatDuration = (seconds) => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds/60), s = seconds%60;
    return s>0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds/3600),
        m = Math.floor((seconds%3600)/60);
  return m>0 ? `${h}h ${m}m` : `${h}h`;
};

/**
 * Generate random string
 */
export const generateRandomString = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i=0; i<length; i++) {
    s += chars.charAt(Math.floor(Math.random()*chars.length));
  }
  return s;
};

/**
 * Deep clone object
 */
export const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (Array.isArray(obj)) return obj.map(deepClone);
  const cloned = {};
  for (const k in obj) {
    if (Object.hasOwn(obj, k)) cloned[k] = deepClone(obj[k]);
  }
  return cloned;
};

/**
 * Merge objects deeply
 */
export const deepMerge = (target, source) => {
  const result = { ...target };
  for (const k in source) {
    if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
      result[k] = deepMerge(result[k] || {}, source[k]);
    } else {
      result[k] = source[k];
    }
  }
  return result;
};

/**
 * Debounce function
 */
export const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * Throttle function
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Sleep function for delays
 */
export const sleep = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * Retry function with exponential backoff
 */
export const retry = async (fn, maxAttempts = 3, baseDelay = 1000) => {
  let lastError;
  for (let i=1; i<=maxAttempts; i++) {
    try { return await fn(); }
    catch (err) {
      lastError = err;
      if (i < maxAttempts) {
        const delay = baseDelay * 2**(i-1);
        logger.warn(`Attempt ${i} failed, retrying in ${delay}ms:`, err.message);
        await sleep(delay);
      }
    }
  }
  throw lastError;
};

/**
 * Check if value is empty
 */
export const isEmpty = (v) => {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim().length===0;
  if (Array.isArray(v)) return v.length===0;
  if (typeof v === 'object') return Object.keys(v).length===0;
  return false;
};

/**
 * Get client IP address
 */
export const getClientIp = (req) => {
  return (
    req.ip ||
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
};

/**
 * Calculate percentage
 */
export const calculatePercentage = (part, total) =>
  total===0 ? 0 : Math.round((part/total)*10000)/100;

/**
 * Generate slug from text
 */
export const generateSlug = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Parse sort string for MongoDB
 */
export const parseSort = (sortString) => {
  if (!sortString) return {};
  return sortString.split(',').reduce((acc, part) => {
    const t = part.trim();
    acc[t.startsWith('-') ? t.slice(1) : t] = t.startsWith('-') ? -1 : 1;
    return acc;
  }, {});
};

/**
 * Create response object
 */
export const createResponse = (success = true, data = null, message = '', error = null) => {
  const r = { success };
  if (data  !== null) r.data    = data;
  if (message)      r.message = message;
  if (error)        r.error   = error;
  return r;
};

/**
 * Mask sensitive information
 */
export const maskSensitiveData = (obj, fields = ['password','token','secret']) => {
  const m = { ...obj };
  fields.forEach(f => { if (m[f]) m[f] = '***MASKED***'; });
  return m;
};

// Export default bundle
export default {
  generateToken,
  verifyToken,
  generateCorrelationId,
  formatCurrency,
  formatNumber,
  isValidEmail,
  isValidUsername,
  isValidPassword,
  sanitizeInput,
  getTimeRemaining,
  formatDuration,
  generateRandomString,
  deepClone,
  deepMerge,
  debounce,
  throttle,
  sleep,
  retry,
  isEmpty,
  getClientIp,
  calculatePercentage,
  generateSlug,
  parseSort,
  createResponse,
  maskSensitiveData
};