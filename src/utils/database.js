// src/utils/database.js
import mongoose from 'mongoose';
import { logger } from './logger.js';
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
    
    const toClean = collections.length
      ? collections
      : Object.keys(mongoose.connection.collections);
    
    for (const name of toClean) {
      const coll = mongoose.connection.collections[name];
      if (coll) {
        await coll.deleteMany({});
        logger.info(`Cleaned collection: ${name}`);
      }
    }
    return { success: true, cleaned: toClean };
  } catch (err) {
    logger.error('Database cleaning failed:', err);
    throw err;
  }
};

/**
 * Seed default settings
 */
export const seedDefaultSettings = async () => {
  try {
    const existing = await Settings.findOne();
    if (existing) {
      logger.info('Settings already exist, skipping seed');
      return existing;
    }

    const s = new Settings({
      auction: {
        timer: parseInt(process.env.BID_TIMER) || 60,
        breakTimer: 10,
        mode: 'auto',
        ruleTill: { enabled: true, value: 20 },
        restartTimerAfterFirstBid: { enabled: true, reduction: 5 }
      },
      budget: {
        baseBudget: parseInt(process.env.BASE_BUDGET) || 200000000,
        currency: 'credits'
      },
      baseValues: [1,2,3,4,5,6,7,8,9,10],
      categories: ['GK','DEF','MID','FWD','UNSOLD'],
      achievements: { enabled: true, pointsMultiplier: 1 },
      notifications: { enabled: true, broadcastRetention: 30 }
    });

    const saved = await s.save();
    logger.info('Default settings seeded successfully');
    return saved;
  } catch (err) {
    logger.error('Failed to seed default settings:', err);
    throw err;
  }
};

/**
 * Seed default achievements
 */
export const seedDefaultAchievements = async () => {
  try {
    const count = await Achievement.countDocuments();
    if (count > 0) {
      logger.info('Achievements already exist, skipping seed');
      return;
    }
    const defaults = Achievement.getDefaultAchievements();
    const docs = await Achievement.insertMany(defaults);
    logger.info(`Seeded ${docs.length} default achievements`);
    return docs;
  } catch (err) {
    logger.error('Failed to seed default achievements:', err);
    throw err;
  }
};

/**
 * Create admin user if not exists
 */
export const createAdminUser = async () => {
  try {
    const existing = await User.findOne({ role: 'admin' });
    if (existing) {
      logger.info('Admin user already exists, skipping creation');
      return existing;
    }

    const pwd = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = await argon2.hash(pwd);

    const admin = new User({
      name: 'System Administrator',
      username: 'admin',
      password: hash,
      role: 'admin',
      balance: 0,
      teamName: 'Admin',
      isActive: true,
      isApproved: true
    });

    const saved = await admin.save();
    logger.info('Admin user created successfully', {
      username: saved.username,
      role: saved.role
    });
    return saved;
  } catch (err) {
    logger.error('Failed to create admin user:', err);
    throw err;
  }
};

/**
 * Initialize database with default data
 */
export const initializeDatabase = async () => {
  try {
    logger.info('Initializing database with default data...');
    const health = checkDatabaseHealth();
    if (!health.isHealthy) {
      throw new Error(`Database not healthy: ${health.status}`);
    }

    const [settings, achievements, admin] = await Promise.all([
      seedDefaultSettings(),
      seedDefaultAchievements(),
      createAdminUser()
    ]);

    logger.info('Database initialization completed', {
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
  } catch (err) {
    logger.error('Database initialization failed:', err);
    throw err;
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
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Pagination helper
 */
export const paginate = (page = 1, limit = 10) => {
  const p = parseInt(page, 10);
  const l = parseInt(limit, 10);
  const skip = (p - 1) * l;
  return { skip: Math.max(0, skip), limit: Math.min(l, 100) };
};

/**
 * Build aggregation pipeline for complex queries
 */
export const buildAggregationPipeline = (opts = {}) => {
  const pipeline = [];
  if (opts.match)    pipeline.push({ $match: opts.match });
  if (opts.populate) {
    for (const pop of opts.populate) {
      pipeline.push({
        $lookup: {
          from: pop.from,
          localField: pop.localField,
          foreignField: pop.foreignField || '_id',
          as: pop.as
        }
      });
      if (pop.unwind) pipeline.push({ $unwind: pop.unwind });
    }
  }
  if (opts.sort)   pipeline.push({ $sort: opts.sort });
  if (opts.skip !== undefined)  pipeline.push({ $skip: opts.skip });
  if (opts.limit !== undefined) pipeline.push({ $limit: opts.limit });
  if (opts.project) pipeline.push({ $project: opts.project });
  return pipeline;
};

/**
 * Database backup utilities (for development)
 */
export const createBackup = async (collections = []) => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Backup not available in production');
  }
  try {
    const backup = {};
    const toBackup = collections.length
      ? collections
      : Object.keys(mongoose.connection.collections);
    for (const name of toBackup) {
      const coll = mongoose.connection.collections[name];
      if (coll) {
        backup[name] = await coll.find({}).toArray();
      }
    }
    return backup;
  } catch (err) {
    logger.error('Backup creation failed:', err);
    throw err;
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