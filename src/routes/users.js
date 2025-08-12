// src/routes/users.js
import { Router } from 'express';
import userController from '../controllers/userController.js';
import { auth, requireActiveUser } from '../middleware/auth.js';
import { uploadAvatar } from '../middleware/upload.js';
import {
  validateProfileUpdate,
  validatePagination,
  validateSearch,
  validateObjectId
} from '../middleware/validation.js';

const router = Router();

/**
 * @route   GET /api/users/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get(
  '/me',
  auth,
  requireActiveUser,
  userController.getProfile
);

/**
 * @route   PUT /api/users/me
 * @desc    Update current user profile
 * @access  Private
 */
router.put(
  '/me',
  auth,
  requireActiveUser,
  validateProfileUpdate,
  userController.updateProfile
);

/**
 * @route   POST /api/users/me/avatar
 * @desc    Upload user avatar
 * @access  Private
 */
router.post(
  '/me/avatar',
  auth,
  requireActiveUser,
  uploadAvatar,
  userController.uploadAvatar
);

/**
 * @route   GET /api/users/me/team
 * @desc    Get current user's team
 * @access  Private
 */
router.get(
  '/me/team',
  auth,
  requireActiveUser,
  userController.getTeam
);

/**
 * @route   GET /api/users/me/notifications
 * @desc    Get user notifications
 * @access  Private
 */
router.get(
  '/me/notifications',
  auth,
  requireActiveUser,
  validatePagination,
  userController.getNotifications
);

/**
 * @route   PUT /api/users/me/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put(
  '/me/notifications/:id/read',
  auth,
  requireActiveUser,
  validateObjectId('id'),
  userController.markNotificationRead
);

/**
 * @route   GET /api/users/me/achievements
 * @desc    Get user achievements
 * @access  Private
 */
router.get(
  '/me/achievements',
  auth,
  requireActiveUser,
  userController.getAchievements
);

/**
 * @route   GET /api/users/managers
 * @desc    Get all managers (public view)
 * @access  Private
 */
router.get(
  '/managers',
  auth,
  validatePagination,
  validateSearch,
  userController.getAllManagers
);

/**
 * @route   GET /api/users/managers/:id
 * @desc    Get single manager details (public view)
 * @access  Private
 */
router.get(
  '/managers/:id',
  auth,
  validateObjectId('id'),
  userController.getManager
);

export default router;