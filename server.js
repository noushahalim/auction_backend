// server.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import morgan from 'morgan';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
const swaggerDocument = YAML.load(path.join(__dirname, 'docs', 'swagger.yaml'));

// Load .env
config();

// ESModule __dirname shim
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

import connectDB from './src/config/database.js';
import { logger } from './src/utils/logger.js';
import { errorHandler, notFound } from './src/middleware/errorHandler.js';
import rateLimiter from './src/middleware/rateLimiter.js';

// Import routes
import authRoutes    from './src/routes/auth.js';
import userRoutes    from './src/routes/users.js';
import auctionRoutes from './src/routes/auctions.js';
import adminRoutes   from './src/routes/admin.js';
import managerRoutes from './src/routes/managers.js';
import statsRoutes   from './src/routes/stats.js';

// Socket handler
import socketInit from './src/socket/index.js';

const app    = express();
const server = createServer(app);
const io     = new SocketIO(server, {
  cors: {
    origin:      process.env.CLIENT_URL || 'http://localhost:4200',
    methods:     ['GET','POST'],
    credentials: true
  }
});

// Connect to MongoDB
connectDB();

// Security headers + CORS
app.use(helmet());
app.use(
  cors({
    origin:      process.env.CLIENT_URL || 'http://localhost:4200',
    credentials: true
  })
);

// Compression & logging
app.use(compression());
app.use(
  morgan('combined', {
    stream: { write: msg => logger.info(msg.trim()) }
  })
);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting (global)
app.use(rateLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    success:   true,
    message:   'Auction API is running',
    timestamp: new Date().toISOString(),
    version:   process.env.npm_package_version || '1.0.0'
  });
});

// Mount API routes
app.use('/api/auth',     authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/managers', managerRoutes);
app.use('/api/stats',    statsRoutes);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Initialize Socket.IO handlers
socketInit(io);

// 404 + error handlers
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(
    `Server listening on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`
  );
});

// Graceful shutdown
const gracefulExit = signal => {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(() => {
    logger.info('Server closed. Exiting process.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulExit('SIGTERM'));
process.on('SIGINT',  () => gracefulExit('SIGINT'));

export { app, server, io };