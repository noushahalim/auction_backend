// src/middleware/upload.js

import multer from 'multer';
import imageService from '../services/imageService.js';
import { logger } from '../utils/logger.js';

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req, file, cb) => {
  try {
    // Check file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'), false);
    }
  } catch (error) {
    cb(error, false);
  }
};

// Configure multer for single and multiple uploads
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Single file upload
  },
  fileFilter
});

const multipleUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5 // Maximum 5 files
  },
  fileFilter
});

// Single file upload middleware
export const uploadSingle = (fieldName = 'image') => {
  return (req, res, next) => {
    const singleUpload = upload.single(fieldName);

    singleUpload(req, res, (err) => {
      if (err) {
        logger.error('File upload error:', err.message);

        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: 'File too large. Maximum size is 10MB.'
          });
        }

        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            error: 'Unexpected field in file upload.'
          });
        }

        return res.status(400).json({
          success: false,
          error: err.message || 'File upload failed'
        });
      }

      // Validate uploaded file if present
      if (req.file) {
        try {
          imageService.validateImageFile(req.file);
        } catch (validationError) {
          return res.status(400).json({
            success: false,
            error: validationError.message
          });
        }
      }

      next();
    });
  };
};

// Multiple files upload middleware
export const uploadMultiple = (fieldName = 'images', maxCount = 5) => {
  return (req, res, next) => {
    const arrayUpload = multipleUpload.array(fieldName, maxCount);

    arrayUpload(req, res, (err) => {
      if (err) {
        logger.error('Multiple file upload error:', err.message);

        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: 'One or more files are too large. Maximum size is 10MB per file.'
          });
        }

        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            error: `Too many files. Maximum allowed is ${maxCount}.`
          });
        }

        return res.status(400).json({
          success: false,
          error: err.message || 'File upload failed'
        });
      }

      // Validate uploaded files if present
      if (req.files && req.files.length > 0) {
        try {
          req.files.forEach(file => {
            imageService.validateImageFile(file);
          });
        } catch (validationError) {
          return res.status(400).json({
            success: false,
            error: validationError.message
          });
        }
      }

      next();
    });
  };
};

// Avatar upload middleware with additional validation
export const uploadAvatar = (req, res, next) => {
  const singleUpload = upload.single('avatar');

  singleUpload(req, res, (err) => {
    if (err) {
      logger.error('Avatar upload error:', err.message);
      return res.status(400).json({
        success: false,
        error: err.message || 'Avatar upload failed'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No avatar file provided'
      });
    }

    // Additional avatar-specific validation
    try {
      imageService.validateImageFile(req.file);

      // Avatar-specific size limit (smaller than general uploads)
      const maxAvatarSize = 5 * 1024 * 1024; // 5MB
      if (req.file.size > maxAvatarSize) {
        return res.status(400).json({
          success: false,
          error: 'Avatar file too large. Maximum size is 5MB.'
        });
      }

    } catch (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError.message
      });
    }

    next();
  });
};

// Player image upload middleware
export const uploadPlayerImage = (req, res, next) => {
  const singleUpload = upload.single('playerImage');

  singleUpload(req, res, (err) => {
    if (err) {
      logger.error('Player image upload error:', err.message);
      return res.status(400).json({
        success: false,
        error: err.message || 'Player image upload failed'
      });
    }

    // Player image is optional, so we don't require a file
    if (req.file) {
      try {
        imageService.validateImageFile(req.file);
      } catch (validationError) {
        return res.status(400).json({
          success: false,
          error: validationError.message
        });
      }
    }

    next();
  });
};

// Error handling middleware specifically for multer
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    logger.error('Multer error:', err.message);

    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({ success: false, error: 'File too large' });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({ success: false, error: 'Too many files' });
      case 'LIMIT_FIELD_KEY':
        return res.status(400).json({ success: false, error: 'Field name too long' });
      case 'LIMIT_FIELD_VALUE':
        return res.status(400).json({ success: false, error: 'Field value too long' });
      case 'LIMIT_FIELD_COUNT':
        return res.status(400).json({ success: false, error: 'Too many fields' });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({ success: false, error: 'Unexpected field' });
      default:
        return res.status(400).json({ success: false, error: 'File upload error' });
    }
  }

  next(err);
};

// Export all methods
export default {
  uploadSingle,
  uploadMultiple,
  uploadAvatar,
  uploadPlayerImage,
  handleMulterError
};
