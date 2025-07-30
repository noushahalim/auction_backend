// src/routes/managers.js

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { auth } = require('../middleware/auth');
const { 
  validatePagination,
  validateSearch,
  validateObjectId
} = require('../middleware/validation');

/**
 * @route   GET /api/managers
 * @desc    Get all managers (public view)
 * @access  Private
 */
router.get('/', auth, validatePagination, validateSearch, userController.getAllManagers);

/**
 * @route   GET /api/managers/:id
 * @desc    Get single manager details (public view)
 * @access  Private
 */
router.get('/:id', auth, validateObjectId('id'), userController.getManager);

module.exports = router;
