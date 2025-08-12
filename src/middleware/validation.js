// src/middleware/validation.js

import { body, param, query, validationResult } from 'express-validator';

// Helper function to handle validation results
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// User validation rules
export const validateUserRegistration = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 50 }).withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  body('code')
    .trim().notEmpty().withMessage('Registration code is required'),
  handleValidationErrors
];

export const validateUserLogin = [
  body('username')
    .trim().notEmpty().withMessage('Username is required'),
  body('password')
    .notEmpty().withMessage('Password is required'),
  handleValidationErrors
];

export const validateProfileUpdate = [
  body('name')
    .optional().trim()
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  body('teamName')
    .optional().trim()
    .isLength({ min: 2, max: 100 }).withMessage('Team name must be between 2 and 100 characters'),
  handleValidationErrors
];

// Player validation rules
export const validatePlayerCreation = [
  body('name')
    .trim().notEmpty().withMessage('Player name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Player name must be between 2 and 100 characters'),
  body('category')
    .trim().notEmpty().withMessage('Player category is required')
    .isIn(['GK', 'DEF', 'MID', 'ATT']).withMessage('Invalid player category'),
  body('baseValue')
    .isNumeric().withMessage('Base value must be a number')
    .isInt({ min: 1 }).withMessage('Base value must be a positive integer'),
  body('position')
    .optional().trim()
    .isLength({ max: 50 }).withMessage('Position must be less than 50 characters'),
  body('rating')
    .optional().isNumeric().withMessage('Rating must be a number')
    .isInt({ min: 0, max: 100 }).withMessage('Rating must be between 0 and 100'),
  body('age')
    .optional().isNumeric().withMessage('Age must be a number')
    .isInt({ min: 16, max: 50 }).withMessage('Age must be between 16 and 50'),
  handleValidationErrors
];

export const validatePlayerUpdate = [
  body('name')
    .optional().trim()
    .isLength({ min: 2, max: 100 }).withMessage('Player name must be between 2 and 100 characters'),
  body('category')
    .optional().trim()
    .isIn(['GK', 'DEF', 'MID', 'ATT', 'UNSOLD']).withMessage('Invalid player category'),
  body('baseValue')
    .optional().isNumeric().withMessage('Base value must be a number')
    .isInt({ min: 1 }).withMessage('Base value must be a positive integer'),
  body('position')
    .optional().trim()
    .isLength({ max: 50 }).withMessage('Position must be less than 50 characters'),
  body('rating')
    .optional().isNumeric().withMessage('Rating must be a number')
    .isInt({ min: 0, max: 100 }).withMessage('Rating must be between 0 and 100'),
  handleValidationErrors
];

// Auction validation rules
export const validateAuctionCreation = [
  body('name')
    .trim().notEmpty().withMessage('Auction name is required')
    .isLength({ min: 3, max: 200 }).withMessage('Auction name must be between 3 and 200 characters'),
  body('description')
    .optional().trim()
    .isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('startTime')
    .isISO8601().withMessage('Invalid start time format')
    .custom(value => {
      if (new Date(value) <= new Date()) {
        throw new Error('Start time must be in the future');
      }
      return true;
    }),
  body('categories')
    .isArray({ min: 1 }).withMessage('At least one category must be specified')
    .custom(categories => {
      const valid = ['GK','DEF','MID','ATT'];
      categories.forEach(c => {
        if (!valid.includes(c.toUpperCase())) {
          throw new Error(`Invalid category: ${c}`);
        }
      });
      return true;
    }),
  body('categoryFlow')
    .isArray({ min: 1 }).withMessage('Category flow must be specified'),
  body('mode')
    .optional().isIn(['auto','manual']).withMessage('Mode must be either auto or manual'),
  body('timerDuration')
    .optional().isNumeric().withMessage('Timer duration must be a number')
    .isInt({ min: 10, max: 300 }).withMessage('Timer duration must be between 10 and 300 seconds'),
  handleValidationErrors
];

// Bid validation rules
export const validateBid = [
  body('amount')
    .isNumeric().withMessage('Bid amount must be a number')
    .isInt({ min: 1 }).withMessage('Bid amount must be a positive integer'),
  body('playerId')
    .isMongoId().withMessage('Invalid player ID'),
  handleValidationErrors
];

// Broadcast validation rules
export const validateBroadcast = [
  body('message')
    .trim().notEmpty().withMessage('Message is required')
    .isLength({ min: 1, max: 1000 }).withMessage('Message must be between 1 and 1000 characters'),
  body('type')
    .optional().isIn(['general','announcement','auction','system']).withMessage('Invalid broadcast type'),
  body('priority')
    .optional().isIn(['low','medium','high','urgent']).withMessage('Invalid priority level'),
  body('targetAudience')
    .optional().isIn(['all','managers','admins']).withMessage('Invalid target audience'),
  body('expiresAt')
    .optional().isISO8601().withMessage('Invalid expiration date format')
    .custom(value => {
      if (new Date(value) <= new Date()) {
        throw new Error('Expiration date must be in the future');
      }
      return true;
    }),
  handleValidationErrors
];

// Parameter validation rules
export const validateObjectId = (paramName = 'id') => [
  param(paramName)
    .isMongoId().withMessage(`Invalid ${paramName}`),
  handleValidationErrors
];

// Query validation rules
export const validatePagination = [
  query('page')
    .optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  handleValidationErrors
];

export const validateSearch = [
  query('search')
    .optional().trim().isLength({ min: 1, max: 100 }).withMessage('Search term must be between 1 and 100 characters'),
  handleValidationErrors
];

// Settings validation rules
export const validateSettings = [
  body('auctionTimer')
    .optional().isNumeric().withMessage('Auction timer must be a number')
    .isInt({ min: 10, max: 300 }).withMessage('Auction timer must be between 10 and 300 seconds'),
  body('breakTimer')
    .optional().isNumeric().withMessage('Break timer must be a number')
    .isInt({ min: 0, max: 120 }).withMessage('Break timer must be between 0 and 120 seconds'),
  body('baseBudget')
    .optional().isNumeric().withMessage('Base budget must be a number')
    .isInt({ min: 1000000 }).withMessage('Base budget must be at least 1,000,000'),
  body('ruleTillValue')
    .optional().isNumeric().withMessage('Rule till value must be a number')
    .isInt({ min: 1 }).withMessage('Rule till value must be a positive integer'),
  handleValidationErrors
];

// Vote validation rules
export const validateVote = [
  body('vote')
    .isIn(['like','dislike']).withMessage('Vote must be either like or dislike'),
  handleValidationErrors
];

// Export all validation rules
export default {
  handleValidationErrors,
  validateUserRegistration,
  validateUserLogin,
  validateProfileUpdate,
  validatePlayerCreation,
  validatePlayerUpdate,
  validateAuctionCreation,
  validateBid,
  validateBroadcast,
  validateObjectId,
  validatePagination,
  validateSearch,
  validateSettings,
  validateVote
};
