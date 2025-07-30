// src/routes/index.js

// Central router that combines all route modules

import { Router } from 'express';
import authRoutes from './auth.js';
import userRoutes from './users.js';
import auctionRoutes from './auctions.js';
import adminRoutes from './admin.js';
import managerRoutes from './managers.js';
import statsRoutes from './stats.js';
import logger from '../utils/logger.js';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Auction API is running',
    timestamp: new Date().toISOString(),
    version: process.env.API_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// API info endpoint
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to Auction Platform API',
    version: process.env.API_VERSION || '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      auctions: '/api/auctions',
      admin: '/api/admin',
      managers: '/api/managers',
      stats: '/api/stats'
    }
  });
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/auctions', auctionRoutes);
router.use('/admin', adminRoutes);
router.use('/managers', managerRoutes);
router.use('/stats', statsRoutes);

// API documentation endpoint (if you want to add Swagger later)
router.get('/docs', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API Documentation',
    note: 'Swagger documentation will be available here in future updates',
    endpoints: [
      {
        path: '/api/auth',
        methods: ['POST'],
        description: 'Authentication endpoints (login, register)'
      },
      {
        path: '/api/users',
        methods: ['GET', 'PUT', 'POST'],
        description: 'User management endpoints'
      },
      {
        path: '/api/auctions',
        methods: ['GET', 'POST'],
        description: 'Auction-related endpoints'
      },
      {
        path: '/api/admin',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'Admin-only endpoints (requires admin role)'
      },
      {
        path: '/api/managers',
        methods: ['GET'],
        description: 'Manager information endpoints'
      },
      {
        path: '/api/stats',
        methods: ['GET'],
        description: 'Statistics and leaderboard endpoints'
      }
    ]
  });
});

// Route not found handler
router.use('*', (req, res) => {
  logger.warn(`API route not found: ${req.method} ${req.originalUrl}`, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`,
    availableEndpoints: '/api/docs'
  });
});

export default router;