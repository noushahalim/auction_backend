// src/middleware/errorHandler.js

import { logger } from '../utils/logger.js';

// Not found middleware
export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Error handler middleware
export const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error(err.message, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    user: req.user ? { id: req.user._id, username: req.user.username } : null
  });

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { message, statusCode: 401 };
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = 'File too large';
    error = { message, statusCode: 400 };
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    const message = 'Unexpected file field';
    error = { message, statusCode: 400 };
  }

  // Rate limiting errors
  if (err.status === 429) {
    const message = 'Too many requests, please try again later';
    error = { message, statusCode: 429 };
  }

  // Socket.IO errors
  if (err.type === 'socket_error') {
    const message = 'Socket connection error';
    error = { message, statusCode: 500 };
  }

  // Database connection errors
  if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
    const message = 'Database connection error';
    error = { message, statusCode: 503 };
  }

  // Send response
  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Async error handler wrapper
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Custom error class
export class CustomError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Error factory functions
export const createError = (message, statusCode = 500) => {
  return new CustomError(message, statusCode);
};

export const badRequest = (message = 'Bad Request') => {
  return new CustomError(message, 400);
};

export const unauthorized = (message = 'Unauthorized') => {
  return new CustomError(message, 401);
};

export const forbidden = (message = 'Forbidden') => {
  return new CustomError(message, 403);
};

export const notFoundError = (message = 'Not Found') => {
  return new CustomError(message, 404);
};

export const conflict = (message = 'Conflict') => {
  return new CustomError(message, 409);
};

export const unprocessableEntity = (message = 'Unprocessable Entity') => {
  return new CustomError(message, 422);
};

export const tooManyRequests = (message = 'Too Many Requests') => {
  return new CustomError(message, 429);
};

export const internalServerError = (message = 'Internal Server Error') => {
  return new CustomError(message, 500);
};

export const serviceUnavailable = (message = 'Service Unavailable') => {
  return new CustomError(message, 503);
};

// Default export
export default {
  notFound,
  errorHandler,
  asyncHandler,
  CustomError,
  createError,
  badRequest,
  unauthorized,
  forbidden,
  notFoundError,
  conflict,
  unprocessableEntity,
  tooManyRequests,
  internalServerError,
  serviceUnavailable
};
