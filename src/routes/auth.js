// src/routes/auth.js

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const { 
  validateUserLogin, 
  validateUserRegistration 
} = require('../middleware/validation');

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and get token
 * @access  Public
 */
router.post('/login', validateUserLogin, authController.login);

/**
 * @route   POST /api/auth/register
 * @desc    Register new user (creates request for admin approval)
 * @access  Public
 */
router.post('/register', validateUserRegistration, authController.register);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Private
 */
router.post('/refresh', auth, authController.refreshToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token removal)
 * @access  Private
 */
router.post('/logout', auth, authController.logout);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user info
 * @access  Private
 */
router.get('/me', auth, authController.getCurrentUser);

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

module.exports = router;
