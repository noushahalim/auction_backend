// src/routes/index.js
import { Router } from 'express';
import authRoutes    from './auth.js';
import userRoutes    from './users.js';
import auctionRoutes from './auctions.js';
import adminRoutes   from './admin.js';
import managerRoutes from './managers.js';
import statsRoutes   from './stats.js';
import { logger }    from '../utils/logger.js';

const router = Router();

// Health check
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

// API info
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to Auction Platform API',
    version: process.env.API_VERSION || '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      auth:      '/api/auth',
      users:     '/api/users',
      auctions:  '/api/auctions',
      admin:     '/api/admin',
      managers:  '/api/managers',
      stats:     '/api/stats'
    }
  });
});

// Mount sub-routers
router.use('/auth',      authRoutes);
router.use('/users',     userRoutes);
router.use('/auctions',  auctionRoutes);
router.use('/admin',     adminRoutes);
router.use('/managers',  managerRoutes);
router.use('/stats',     statsRoutes);

// Placeholder for Swagger, OpenAPI, etc.
router.get('/docs', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API Documentation coming soon',
    endpoints: [
      { path: '/api/auth',     methods: ['POST'],           description: 'Login, register, etc.' },
      { path: '/api/users',    methods: ['GET','PUT'],      description: 'Profile and avatar' },
      { path: '/api/auctions', methods: ['GET','POST'],     description: 'Auction operations' },
      { path: '/api/admin',    methods: ['GET','POST','PUT','DELETE'], description: 'Admin-only' },
      { path: '/api/managers', methods: ['GET'],            description: 'Public manager info' },
      { path: '/api/stats',    methods: ['GET'],            description: 'Leaderboards & stats' }
    ]
  });
});

// 404 for any unmatched route
router.use('*', (req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    ua: req.get('User-Agent')
  });

  res.status(404).json({
    success: false,
    error: 'Endpoint Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    docs: '/api/docs'
  });
});

export default router;