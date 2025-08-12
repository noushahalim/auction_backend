// src/routes/managers.js
import { Router } from 'express';
import userController from '../controllers/userController.js';
import { auth } from '../middleware/auth.js';
import {
  validatePagination,
  validateSearch,
  validateObjectId
} from '../middleware/validation.js';

const router = Router();

/**
 * @route   GET /api/managers
 * @desc    Get all managers (public view)
 * @access  Private
 */
router.get(
  '/',
  auth,
  validatePagination,
  validateSearch,
  userController.getAllManagers
);

/**
 * @route   GET /api/managers/:id
 * @desc    Get single manager details (public view)
 * @access  Private
 */
router.get(
  '/:id',
  auth,
  validateObjectId('id'),
  userController.getManager
);

export default router;