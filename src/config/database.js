// src/config/database.js

import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

// Database connection configuration
export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Mongoose 6+ no longer needs these options, but keeping for compatibility
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    // Connection event handlers
    mongoose.connection.on('connected', () => {
      logger.info('Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('Mongoose connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('Mongoose disconnected from MongoDB');
    });

    // Handle application termination
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        logger.info('Mongoose connection closed due to application termination');
        process.exit(0);
      } catch (error) {
        logger.error('Error closing mongoose connection:', error);
        process.exit(1);
      }
    });

    return conn;
  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
};

// Database health check
export const checkDBHealth = async () => {
  try {
    const state = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    return {
      status: states[state] || 'unknown',
      connected: state === 1,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return {
      status: 'error',
      connected: false,
      error: error.message
    };
  }
};

// Initialize default data
export const initializeDefaultData = async () => {
  try {
    const { default: Settings } = await import('../models/Settings.js');

    // Initialize settings if they don't exist
    const settings = await Settings.getSettings();
    logger.info('Default settings initialized');

    // Add any other default data initialization here

  } catch (error) {
    logger.error('Failed to initialize default data:', error);
  }
};

export default {
  connectDB,
  checkDBHealth,
  initializeDefaultData
};
