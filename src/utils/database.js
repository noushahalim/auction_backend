// src/utils/database.js

// Helper functions for database operations and data seeding

import mongoose from 'mongoose';
import logger from './logger.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import Achievement from '../models/Achievement.js';
import argon2 from 'argon2';

/**
 * Database connection health check
 */
export const checkDatabaseHealth = () => {
  const state = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  return {
    status: states[state],
    isHealthy: state === 1,
    host: mongoose.connection.host,
    port: mongoose.connection.port,
    name: mongoose.connection.name
  };
};

/**
 * Clean database collections (use with caution)
 */
export const cleanDatabase = async (collections = []) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production environment');
    }
    
    const collectionsToClean = collections.length > 0 
      ? collections 
      : Object.keys(mongoose.connection.collections);
    
    for (const collection of collectionsToClean) {
      if (mongoose.connection.collections[collection]) {
        await mongoose.connection.collections[collection].deleteMany({});
        logger.info(`Cleaned collection: ${collection}`);
      }
    }
    
    return { success: true, cleaned: collectionsToClean };
  } catch (error) {
    logger.error('Database cleaning failed:', error);
    throw error;
  }
};

/**
 * Seed default settings
 */
export const seedDefaultSettings = async () => {
  try {
    const existingSettings = await Settings.findOne();
    if (existingSettings) {
      logger.info('Settings already exist, skipping seed');
      return existingSettings;
    }
    
    const defaultSettings = new Settings({
      auction: {
        timer: parseInt(process.env.BID_TIMER) || 60,
        breakTimer: 10,
        mode: 'auto',
        ruleTill: {
          enabled: true,
          value: 20
        },
        restartTimerAfterFirstBid: {
          enabled: true,
          reduction: 5
        }
      },
      budget: {
        baseBudget: parseInt(process.env.BASE_BUDGET) || 200000000,
        currency: 'credits'
      },
      baseValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      categories: [
        'GK', 'DEF', 'MID', 'FWD', 'UNSOLD'
      ],
      achievements: {
        enabled: true,
        pointsMultiplier: 1
      },
      notifications: {
        enabled: true,
        broadcastRetention: 30 // days
      }
    });
    
    const savedSettings = await defaultSettings.save();
    logger.info('Default settings seeded successfully');
    return savedSettings;
  } catch (error) {
    logger.error('Failed to seed default settings:', error);
    throw error;
  }
};

/**
 * Seed default achievements
 */
export const seedDefaultAchievements = async () => {
  try {
    const existingCount = await Achievement.countDocuments();
    if (existingCount > 0) {
      logger.info('Achievements already exist, skipping seed');
      return;
    }
    
    const defaultAchievements = Achievement.getDefaultAchievements();
    const achievements = await Achievement.insertMany(defaultAchievements);
    
    logger.info(`Seeded ${achievements.length} default achievements`);
    return achievements;
  } catch (error) {
    logger.error('Failed to seed default achievements:', error);
    throw error;
  }
};

/**
 * Create admin user if not exists
 */
export const createAdminUser = async () => {
  try {
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      logger.info('Admin user already exists, skipping creation');
      return existingAdmin;
    }
    
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await argon2.hash(adminPassword);
    
    const adminUser = new User({
      name: 'System Administrator',
      username: 'admin',
      password: hashedPassword,
      role: 'admin',
      balance: 0, // Admin doesn't participate in bidding
      teamName: 'Admin',
      isActive: true,
      isApproved: true
    });
    
    const savedAdmin = await adminUser.save();
    logger.info('Admin user created successfully', {
      username: savedAdmin.username,
      role: savedAdmin.role
    });
    
    return savedAdmin;
  } catch (error) {
    logger.error('Failed to create admin user:', error);
    throw error;
  }
};

/**
 * Initialize database with default data
 */
export const initializeDatabase = async () => {
  try {
    logger.info('Initializing database with default data...');
    
    // Check database connection
    const healthCheck = checkDatabaseHealth();
    if (!healthCheck.isHealthy) {
      throw new Error(`Database is not healthy: ${healthCheck.status}`);
    }
    
    // Seed default data
    const [settings, achievements, admin] = await Promise.all([
      seedDefaultSettings(),
      seedDefaultAchievements(),
      createAdminUser()
    ]);
    
    logger.info('Database initialization completed successfully', {
      settings: !!settings,
      achievements: achievements?.length || 0,
      admin: !!admin
    });
    
    return {
      success: true,
      data: {
        settings,
        achievements: achievements?.length || 0,
        admin: admin?.username
      }
    };
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
};

/**
 * Database transaction wrapper
 */
export const withTransaction = async (callback) => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Pagination helper
 */
export const paginate = (page = 1, limit = 10) => {
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  return {
    skip: Math.max(0, skip),
    limit: Math.min(parseInt(limit, 10), 100) // Max 100 items per page
  };
};

/**
 * Build aggregation pipeline for complex queries
 */
export const buildAggregationPipeline = (options = {}) => {
  const pipeline = [];
  
  // Match stage
  if (options.match) {
    pipeline.push({ $match: options.match });
  }
  
  // Lookup stages for population
  if (options.populate) {
    options.populate.forEach(pop => {
      pipeline.push({
        $lookup: {
          from: pop.from,
          localField: pop.localField,
          foreignField: pop.foreignField || '_id',
          as: pop.as
        }
      });
      
      if (pop.unwind) {
        pipeline.push({ $unwind: pop.unwind });
      }
    });
  }
  
  // Sort stage
  if (options.sort) {
    pipeline.push({ $sort: options.sort });
  }
  
  // Pagination
  if (options.skip !== undefined) {
    pipeline.push({ $skip: options.skip });
  }
  
  if (options.limit !== undefined) {
    pipeline.push({ $limit: options.limit });
  }
  
  // Project stage
  if (options.project) {
    pipeline.push({ $project: options.project });
  }
  
  return pipeline;
};

/**
 * Database backup utilities (for development)
 */
export const createBackup = async (collections = []) => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Backup function not available in production');
  }
  
  try {
    const backup = {};
    const collectionsToBackup = collections.length > 0 
      ? collections 
      : Object.keys(mongoose.connection.collections);
    
    for (const collectionName of collectionsToBackup) {
      const collection = mongoose.connection.collections[collectionName];
      if (collection) {
        backup[collectionName] = await collection.find({}).toArray();
      }
    }
    
    return backup;
  } catch (error) {
    logger.error('Backup creation failed:', error);
    throw error;
  }
};

export default {
  checkDatabaseHealth,
  cleanDatabase,
  seedDefaultSettings,
  seedDefaultAchievements,
  createAdminUser,
  initializeDatabase,
  withTransaction,
  paginate,
  buildAggregationPipeline,
  createBackup
};