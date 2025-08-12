// src/services/imageService.js

import axios from 'axios';
import { logger } from '../utils/logger.js';

class ImageService {
  constructor() {
    this.imgurClientId = process.env.IMGUR_CLIENT_ID;
    this.imgurApiUrl   = 'https://api.imgur.com/3/upload';
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

      const base64Image = buffer.toString('base64');
      const response = await axios.post(
        this.imgurApiUrl,
        { image: base64Image, type: 'base64', name: filename, title: filename },
        {
          headers: {
            Authorization: `Client-ID ${this.imgurClientId}`,
            'Content-Type': 'application/json'
          },
          timeout: 30_000
        }
      );

      const data = response.data;
      if (data.success && data.data?.link) {
        logger.info(`Image uploaded successfully to Imgur: ${data.data.link}`);
        return data.data.link;
      }
      throw new Error('Failed to upload image to Imgur');

    } catch (error) {
      logger.error('Imgur upload error:', error.message);
      if (error.response) {
        logger.error('Imgur API response:', {
          status: error.response.status,
          data:   error.response.data
        });
        if (error.response.status === 429) {
          throw new Error('Upload rate limit exceeded. Please try again later.');
        }
        if (error.response.status === 400) {
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

      const response = await axios.post(
        this.imgurApiUrl,
        { image: imageUrl, type: 'url' },
        {
          headers: {
            Authorization: `Client-ID ${this.imgurClientId}`,
            'Content-Type': 'application/json'
          },
          timeout: 30_000
        }
      );

      const data = response.data;
      if (data.success && data.data?.link) {
        logger.info(`Image uploaded from URL to Imgur: ${data.data.link}`);
        return data.data.link;
      }
      throw new Error('Failed to upload image from URL to Imgur');

    } catch (error) {
      logger.error('Imgur URL upload error:', error.message);
      throw new Error('Failed to upload image from URL. Please try again.');
    }
  }

  // Validate file type and size
  validateImageFile(file) {
    const allowed = ['image/jpeg','image/jpg','image/png','image/gif','image/webp'];
    const maxSize = 10 * 1024 * 1024;
    if (!file) {
      throw new Error('No file provided');
    }
    if (!allowed.includes(file.mimetype)) {
      throw new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.');
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
      const response = await axios.get(
        `https://api.imgur.com/3/image/${imageId}`,
        { headers: { Authorization: `Client-ID ${this.imgurClientId}` } }
      );
      if (response.data.success) {
        return response.data.data;
      }
      throw new Error('Failed to get image info');
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
      const response = await axios.delete(
        `https://api.imgur.com/3/image/${imageId}`,
        { headers: { Authorization: `Client-ID ${this.imgurClientId}` } }
      );
      if (response.data.success) {
        logger.info(`Image deleted from Imgur: ${imageId}`);
        return true;
      }
      throw new Error('Failed to delete image');
    } catch (error) {
      logger.error('Delete image error:', error.message);
      throw new Error('Failed to delete image');
    }
  }

  // Extract image ID from Imgur URL
  extractImageId(imgurUrl) {
    try {
      const m = imgurUrl.match(/imgur\.com\/([a-zA-Z0-9]+)/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }

  // Validate URL format
  isValidUrl(str) {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  }

  // Generate thumbnail URL
  generateThumbnail(imgurUrl, size = 'm') {
    const id = this.extractImageId(imgurUrl);
    if (!id) return imgurUrl;
    const ext = imgurUrl.split('.').pop();
    return `https://i.imgur.com/${id}${size}.${ext}`;
  }

  // Batch upload
  async uploadMultiple(buffers, filenames = []) {
    const results = await Promise.allSettled(
      buffers.map((buf, i) => this.uploadBuffer(buf, filenames[i] || `upload_${i}`))
    );

    const successful = [], failed = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        successful.push({ index: i, url: r.value, filename: filenames[i] });
      } else {
        failed.push({ index: i, error: r.reason.message, filename: filenames[i] });
      }
    });
    return { successful, failed };
  }

  // Service health check
  async checkServiceHealth() {
    try {
      const resp = await axios.get('https://api.imgur.com/3/credits', {
        headers: { Authorization: `Client-ID ${this.imgurClientId}` },
        timeout: 5_000
      });
      return { available: true, credits: resp.data.data };
    } catch (error) {
      logger.error('Imgur service health check failed:', error.message);
      return { available: false, error: error.message };
    }
  }
}

export default new ImageService();