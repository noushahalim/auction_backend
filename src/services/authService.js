// src/services/authService.js

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { logger } = require('../utils/logger');

class AuthService {
  // Generate JWT token
  generateToken(userId, expiresIn = '7d') {
    return jwt.sign(
      { sub: userId },
      process.env.JWT_SECRET,
      { expiresIn }
    );
  }

  // Verify JWT token
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.sub);

      if (!user || !user.isActive) {
        throw new Error('Invalid token');
      }

      return user;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  // Authenticate user
  async authenticate(username, password) {
    const user = await User.findOne({ 
      username: username.toLowerCase() 
    }).select('+password');

    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    return user;
  }

  // Hash password
  async hashPassword(password) {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  // Compare password
  async comparePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  // Generate refresh token
  generateRefreshToken(userId) {
    return jwt.sign(
      { sub: userId, type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
  }

  // Verify refresh token
  async verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }

      const user = await User.findById(decoded.sub);

      if (!user || !user.isActive) {
        throw new Error('Invalid refresh token');
      }

      return user;
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  // Create password reset token
  generatePasswordResetToken(userId) {
    return jwt.sign(
      { sub: userId, type: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  }

  // Verify password reset token
  async verifyPasswordResetToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.type !== 'password_reset') {
        throw new Error('Invalid password reset token');
      }

      const user = await User.findById(decoded.sub);

      if (!user || !user.isActive) {
        throw new Error('Invalid password reset token');
      }

      return user;
    } catch (error) {
      throw new Error('Invalid password reset token');
    }
  }

  // Validate user permissions
  validatePermissions(user, requiredRole) {
    if (requiredRole === 'admin' && user.role !== 'admin') {
      throw new Error('Insufficient permissions');
    }
    return true;
  }

  // Check if user can perform action
  canPerformAction(user, action, resourceOwnerId = null) {
    // Admin can do everything
    if (user.role === 'admin') {
      return true;
    }

    // Users can only modify their own resources
    if (resourceOwnerId && user._id.toString() !== resourceOwnerId.toString()) {
      return false;
    }

    // Define action permissions
    const permissions = {
      'manager': [
        'view_profile',
        'update_profile',
        'view_team',
        'place_bid',
        'view_auctions',
        'view_managers',
        'view_stats'
      ],
      'admin': ['*'] // Admin can do everything
    };

    const userPermissions = permissions[user.role] || [];
    return userPermissions.includes('*') || userPermissions.includes(action);
  }

  // Extract token from request
  extractTokenFromRequest(req) {
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.replace('Bearer ', '');
    }
    return null;
  }

  // Log security event
  logSecurityEvent(event, userId = null, details = {}) {
    logger.warn('Security Event', {
      event,
      userId,
      details,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = new AuthService();
