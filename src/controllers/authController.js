// src/controllers/authController.js

import { validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Request from '../models/Request.js';
import authService from '../services/authService.js';
import { logger } from '../utils/logger.js';

// Login user
export const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { username, password } = req.body;

    // Authenticate user
    const user = await authService.authenticate(username, password);

    // Generate tokens
    const accessToken = authService.generateToken(user._id);
    const refreshToken = authService.generateRefreshToken(user._id);

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    logger.info(`User logged in: ${user.username} (${user._id})`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token: accessToken,
        refreshToken: refreshToken,
        user: userResponse
      }
    });

  } catch (error) {
    logger.error('Login error:', error.message);
    
    if (error.message === 'Invalid credentials' || error.message === 'Account is deactivated') {
      return res.status(401).json({
        success: false,
        error: error.message
      });
    }
    
    next(error);
  }
};

// Register new user (creates request for admin approval)
export const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, username, password, code } = req.body;

    // Verify registration code
    const expectedCode = process.env.REGISTRATION_CODE;
    if (!expectedCode || code !== expectedCode) {
      return res.status(403).json({
        success: false,
        error: 'Invalid registration code. Contact admin for the correct code.'
      });
    }

    // Check if username is already taken
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Username is already taken'
      });
    }

    // Check if username is already requested
    const existingRequest = await Request.isUsernameRequested(username);
    if (existingRequest) {
      return res.status(409).json({
        success: false,
        error: 'Registration request for this username is already pending'
      });
    }

    // Create registration request
    const requestData = {
      name: name.trim(),
      username: username.toLowerCase().trim(),
      password: password,
      code: code,
      registrationIP: req.ip,
      userAgent: req.get('User-Agent'),
      source: 'web'
    };

    const registrationRequest = new Request(requestData);
    await registrationRequest.save();

    logger.info(`Registration request created: ${username} (${registrationRequest._id})`);

    res.status(201).json({
      success: true,
      message: 'Registration request submitted successfully. Please wait for admin approval.',
      data: {
        requestId: registrationRequest._id,
        username: registrationRequest.username,
        status: registrationRequest.status
      }
    });

  } catch (error) {
    logger.error('Registration error:', error.message);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Username is already taken'
      });
    }
    
    next(error);
  }
};

// Refresh access token
export const refreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.body.refreshToken || req.headers['x-refresh-token'];

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token required'
      });
    }

    // Verify refresh token
    const user = await authService.verifyRefreshToken(refreshToken);

    // Generate new access token
    const newAccessToken = authService.generateToken(user._id);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newAccessToken,
        user: user
      }
    });

  } catch (error) {
    logger.error('Token refresh error:', error.message);
    
    return res.status(401).json({
      success: false,
      error: 'Invalid refresh token'
    });
  }
};

// Logout user (client-side token removal)
export const logout = async (req, res, next) => {
  try {
    const user = req.user;

    logger.info(`User logged out: ${user.username} (${user._id})`);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('Logout error:', error.message);
    next(error);
  }
};

// Get current user info
export const getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');

    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        error: 'User not found or inactive'
      });
    }

    // Get user statistics
    const stats = await user.getStatistics();

    res.json({
      success: true,
      data: {
        user: user,
        stats: stats
      }
    });

  } catch (error) {
    logger.error('Get current user error:', error.message);
    next(error);
  }
};

// Verify token validity
export const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    // Verify token
    const user = await authService.verifyToken(token);

    res.json({
      success: true,
      message: 'Token is valid',
      data: {
        user: user,
        tokenValid: true
      }
    });

  } catch (error) {
    logger.error('Token verification error:', error.message);
    
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      tokenValid: false
    });
  }
};

// Change password
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters long'
      });
    }

    // Get user with password
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify current password
    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    logger.info(`Password changed for user: ${user.username} (${user._id})`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    logger.error('Change password error:', error.message);
    next(error);
  }
};

// Get registration request status
export const getRegistrationStatus = async (req, res, next) => {
  try {
    const { username } = req.params;

    const request = await Request.findOne({ 
      username: username.toLowerCase() 
    }).select('-password -code');

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Registration request not found'
      });
    }

    res.json({
      success: true,
      data: {
        status: request.status,
        submittedAt: request.createdAt,
        reviewedAt: request.reviewedAt,
        daysUntilExpiry: request.daysUntilExpiry
      }
    });

  } catch (error) {
    logger.error('Get registration status error:', error.message);
    next(error);
  }
};

// Resend registration request (if expired)
export const resendRegistrationRequest = async (req, res, next) => {
  try {
    const { username, code } = req.body;

    // Verify registration code
    const expectedCode = process.env.REGISTRATION_CODE;
    if (!expectedCode || code !== expectedCode) {
      return res.status(403).json({
        success: false,
        error: 'Invalid registration code'
      });
    }

    // Find existing request
    const existingRequest = await Request.findOne({ 
      username: username.toLowerCase(),
      status: 'pending'
    });

    if (!existingRequest) {
      return res.status(404).json({
        success: false,
        error: 'No pending registration request found for this username'
      });
    }

    // Extend expiry
    await existingRequest.extendExpiry(7);

    logger.info(`Registration request extended: ${username} (${existingRequest._id})`);

    res.json({
      success: true,
      message: 'Registration request has been extended by 7 days',
      data: {
        requestId: existingRequest._id,
        newExpiryDate: existingRequest.expiresAt,
        daysUntilExpiry: existingRequest.daysUntilExpiry
      }
    });

  } catch (error) {
    logger.error('Resend registration request error:', error.message);
    next(error);
  }
};

export default { login, register, refreshToken, logout, getCurrentUser, verifyToken, changePassword, getRegistrationStatus, resendRegistrationRequest };