// src/services/authService.js

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import { logger } from '../utils/logger.js';

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
    } catch {
      throw new Error('Invalid token');
    }
  }

  // Authenticate user
  async authenticate(username, password) {
    const user = await User.findOne({ username: username.toLowerCase() }).select('+password');
    if (!user) {
      throw new Error('Invalid credentials');
    }
    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }
    user.lastLogin = new Date();
    await user.save();
    return user;
  }

  // Hash a plain password
  async hashPassword(password) {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  // Compare plain vs. hashed
  async comparePassword(plain, hashed) {
    return bcrypt.compare(plain, hashed);
  }

  // Refresh-token
  generateRefreshToken(userId) {
    return jwt.sign(
      { sub: userId, type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
  }

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
    } catch {
      throw new Error('Invalid refresh token');
    }
  }

  // Password reset token
  generatePasswordResetToken(userId) {
    return jwt.sign(
      { sub: userId, type: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  }

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
    } catch {
      throw new Error('Invalid password reset token');
    }
  }

  // Role checks
  validatePermissions(user, requiredRole) {
    if (requiredRole === 'admin' && user.role !== 'admin') {
      throw new Error('Insufficient permissions');
    }
    return true;
  }

  canPerformAction(user, action, resourceOwnerId = null) {
    if (user.role === 'admin') return true;
    // user-only ownership
    if (resourceOwnerId && user._id.toString() !== resourceOwnerId.toString()) {
      return false;
    }
    const permissions = {
      manager: [
        'view_profile',
        'update_profile',
        'view_team',
        'place_bid',
        'view_auctions',
        'view_managers',
        'view_stats'
      ],
      admin: ['*']
    };
    const userPerms = permissions[user.role] || [];
    return userPerms.includes('*') || userPerms.includes(action);
  }

  extractTokenFromRequest(req) {
    const header = req.header('Authorization');
    if (header?.startsWith('Bearer ')) return header.replace('Bearer ', '');
    return null;
  }

  logSecurityEvent(event, userId = null, details = {}) {
    logger.warn('Security Event', {
      event,
      userId,
      details,
      timestamp: new Date().toISOString()
    });
  }
}

export default new AuthService();