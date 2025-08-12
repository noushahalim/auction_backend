// src/routes/auth.js
import { Router } from 'express';
import {
  login,
  register,
  refreshToken,
  logout,
  getCurrentUser,
  // note: authController.verifyToken exists but we’ll inline the simple verify route
} from '../controllers/authController.js';
import { auth } from '../middleware/auth.js';
import {
  validateUserLogin,
  validateUserRegistration
} from '../middleware/validation.js';

const router = Router();

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and get token
 * @access  Public
 */
router.post('/login', validateUserLogin, login);

/**
 * @route   POST /api/auth/register
 * @desc    Register new user (creates request for admin approval)
 * @access  Public
 */
router.post('/register', validateUserRegistration, register);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Private
 */
router.post('/refresh', auth, refreshToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token removal)
 * @access  Private
 */
router.post('/logout', auth, logout);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user info
 * @access  Private
 */
router.get('/me', auth, getCurrentUser);

/**
 * @route   POST /api/auth/verify
 * @desc    Verify token validity
 * @access  Private
 */
router.post('/verify', auth, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    user: req.user
  });
});

export default router;
