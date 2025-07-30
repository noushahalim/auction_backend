// src/services/imageService.js

const axios = require('axios');
const { logger } = require('../utils/logger');

class ImageService {
  constructor() {
    this.imgurClientId = process.env.IMGUR_CLIENT_ID;
    this.imgurApiUrl = 'https://api.imgur.com/3/upload';
  }

  // Upload image buffer to Imgur
  async uploadBuffer(buffer, filename = 'upload') {
    try {
      if (!this.imgurClientId) {
        throw new Error('Imgur Client ID not configured');
      }

      if (!buffer || buffer.length === 0) {
        throw new Error('Invalid image buffer');
      }

      // Convert buffer to base64
      const base64Image = buffer.toString('base64');

      const response = await axios.post(this.imgurApiUrl, {
        image: base64Image,
        type: 'base64',
        name: filename,
        title: filename
      }, {
        headers: {
          'Authorization': `Client-ID ${this.imgurClientId}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });

      if (response.data && response.data.success && response.data.data) {
        const imageUrl = response.data.data.link;

        logger.info(`Image uploaded successfully to Imgur: ${imageUrl}`);

        return imageUrl;
      } else {
        throw new Error('Failed to upload image to Imgur');
      }

    } catch (error) {
      logger.error('Imgur upload error:', error.message);

      if (error.response) {
        logger.error('Imgur API response:', {
          status: error.response.status,
          data: error.response.data
        });

        if (error.response.status === 429) {
          throw new Error('Upload rate limit exceeded. Please try again later.');
        } else if (error.response.status === 400) {
          throw new Error('Invalid image format. Please upload a valid image file.');
        }
      }

      throw new Error('Failed to upload image. Please try again.');
    }
  }

  // Upload image from URL to Imgur
  async uploadFromUrl(imageUrl) {
    try {
      if (!this.imgurClientId) {
        throw new Error('Imgur Client ID not configured');
      }

      if (!imageUrl || !this.isValidUrl(imageUrl)) {
        throw new Error('Invalid image URL');
      }

      const response = await axios.post(this.imgurApiUrl, {
        image: imageUrl,
        type: 'url'
      }, {
        headers: {
          'Authorization': `Client-ID ${this.imgurClientId}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      if (response.data && response.data.success && response.data.data) {
        const uploadedImageUrl = response.data.data.link;

        logger.info(`Image uploaded from URL successfully to Imgur: ${uploadedImageUrl}`);

        return uploadedImageUrl;
      } else {
        throw new Error('Failed to upload image from URL to Imgur');
      }

    } catch (error) {
      logger.error('Imgur URL upload error:', error.message);
      throw new Error('Failed to upload image from URL. Please try again.');
    }
  }

  // Validate file type and size
  validateImageFile(file) {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!file) {
      throw new Error('No file provided');
    }

    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.');
    }

    if (file.size > maxSize) {
      throw new Error('File too large. Maximum size is 10MB.');
    }

    return true;
  }

  // Get image info from Imgur
  async getImageInfo(imageId) {
    try {
      if (!this.imgurClientId) {
        throw new Error('Imgur Client ID not configured');
      }

      const response = await axios.get(`https://api.imgur.com/3/image/${imageId}`, {
        headers: {
          'Authorization': `Client-ID ${this.imgurClientId}`
        }
      });

      if (response.data && response.data.success) {
        return response.data.data;
      } else {
        throw new Error('Failed to get image info');
      }

    } catch (error) {
      logger.error('Get image info error:', error.message);
      throw new Error('Failed to get image information');
    }
  }

  // Delete image from Imgur
  async deleteImage(imageId) {
    try {
      if (!this.imgurClientId) {
        throw new Error('Imgur Client ID not configured');
      }

      const response = await axios.delete(`https://api.imgur.com/3/image/${imageId}`, {
        headers: {
          'Authorization': `Client-ID ${this.imgurClientId}`
        }
      });

      if (response.data && response.data.success) {
        logger.info(`Image deleted from Imgur: ${imageId}`);
        return true;
      } else {
        throw new Error('Failed to delete image');
      }

    } catch (error) {
      logger.error('Delete image error:', error.message);
      throw new Error('Failed to delete image');
    }
  }

  // Extract image ID from Imgur URL
  extractImageId(imgurUrl) {
    try {
      const regex = /imgur\.com\/([a-zA-Z0-9]+)/;
      const match = imgurUrl.match(regex);
      return match ? match[1] : null;
    } catch (error) {
      return null;
    }
  }

  // Validate URL format
  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Generate thumbnail URL from Imgur URL
  generateThumbnail(imgurUrl, size = 'm') {
    try {
      // Imgur thumbnail sizes: s (90x90), b (160x160), t (160x160), m (320x320), l (640x640), h (1024x1024)
      const imageId = this.extractImageId(imgurUrl);
      if (!imageId) {
        return imgurUrl; // Return original if can't extract ID
      }

      const extension = imgurUrl.split('.').pop();
      return `https://i.imgur.com/${imageId}${size}.${extension}`;
    } catch (error) {
      return imgurUrl; // Return original URL if thumbnail generation fails
    }
  }

  // Batch upload multiple images
  async uploadMultiple(buffers, filenames = []) {
    try {
      const uploadPromises = buffers.map((buffer, index) => 
        this.uploadBuffer(buffer, filenames[index] || `upload_${index}`)
      );

      const results = await Promise.allSettled(uploadPromises);

      const successful = [];
      const failed = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successful.push({
            index,
            url: result.value,
            filename: filenames[index] || `upload_${index}`
          });
        } else {
          failed.push({
            index,
            error: result.reason.message,
            filename: filenames[index] || `upload_${index}`
          });
        }
      });

      return { successful, failed };

    } catch (error) {
      logger.error('Batch upload error:', error.message);
      throw new Error('Batch upload failed');
    }
  }

  // Check if Imgur service is available
  async checkServiceHealth() {
    try {
      const response = await axios.get('https://api.imgur.com/3/credits', {
        headers: {
          'Authorization': `Client-ID ${this.imgurClientId}`
        },
        timeout: 5000
      });

      return {
        available: true,
        credits: response.data.data
      };
    } catch (error) {
      logger.error('Imgur service health check failed:', error.message);
      return {
        available: false,
        error: error.message
      };
    }
  }
}

module.exports = new ImageService();
