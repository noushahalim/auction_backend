// src/utils/helpers.js

// Common utility functions used throughout the application

import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger.js';

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
export const generateCorrelationId = () => {
  return uuidv4();
};

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
  
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  
  if (absNum >= 1e9) {
    return sign + (absNum / 1e9).toFixed(1) + 'B';
  } else if (absNum >= 1e6) {
    return sign + (absNum / 1e6).toFixed(1) + 'M';
  } else if (absNum >= 1e3) {
    return sign + (absNum / 1e3).toFixed(1) + 'K';
  }
  
  return sign + absNum.toString();
};

/**
 * Validate email format
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate username format
 */
export const isValidUsername = (username) => {
  // Username should be 3-20 characters, alphanumeric and underscore only
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
};

/**
 * Validate password strength
 */
export const isValidPassword = (password) => {
  // At least 8 characters, one uppercase, one lowercase, one number
  return password.length >= 8;
};

/**
 * Sanitize user input
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .slice(0, 1000); // Limit length
};

/**
 * Calculate time remaining in seconds
 */
export const getTimeRemaining = (endTime) => {
  const now = new Date().getTime();
  const end = new Date(endTime).getTime();
  const remaining = Math.max(0, Math.floor((end - now) / 1000));
  
  return remaining;
};

/**
 * Format time duration
 */
export const formatDuration = (seconds) => {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
};

/**
 * Generate random string
 */
export const generateRandomString = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
};

/**
 * Deep clone object
 */
export const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  
  const cloned = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  
  return cloned;
};

/**
 * Merge objects deeply
 */
export const deepMerge = (target, source) => {
  const result = { ...target };
  
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }
  
  return result;
};

/**
 * Debounce function
 */
export const debounce = (func, wait) => {
  let timeout;
  
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle function
 */
export const throttle = (func, limit) => {
  let inThrottle;
  
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Sleep function for delays
 */
export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry function with exponential backoff
 */
export const retry = async (fn, maxAttempts = 3, baseDelay = 1000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts) {
        break;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
      await sleep(delay);
    }
  }
  
  throw lastError;
};

/**
 * Check if value is empty
 */
export const isEmpty = (value) => {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

/**
 * Get client IP address
 */
export const getClientIp = (req) => {
  return req.ip ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         '127.0.0.1';
};

/**
 * Calculate percentage
 */
export const calculatePercentage = (part, total) => {
  if (total === 0) return 0;
  return Math.round((part / total) * 100 * 100) / 100; // Round to 2 decimal places
};

/**
 * Generate slug from text
 */
export const generateSlug = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

/**
 * Parse sort string for MongoDB
 */
export const parseSort = (sortString) => {
  if (!sortString) return {};
  
  const sortObj = {};
  const parts = sortString.split(',');
  
  parts.forEach(part => {
    const trimmed = part.trim();
    if (trimmed.startsWith('-')) {
      sortObj[trimmed.substring(1)] = -1;
    } else {
      sortObj[trimmed] = 1;
    }
  });
  
  return sortObj;
};

/**
 * Create response object
 */
export const createResponse = (success = true, data = null, message = '', error = null) => {
  const response = { success };
  
  if (data !== null) response.data = data;
  if (message) response.message = message;
  if (error) response.error = error;
  
  return response;
};

/**
 * Mask sensitive information
 */
export const maskSensitiveData = (obj, fields = ['password', 'token', 'secret']) => {
  const masked = { ...obj };
  
  fields.forEach(field => {
    if (masked[field]) {
      masked[field] = '***MASKED***';
    }
  });
  
  return masked;
};

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