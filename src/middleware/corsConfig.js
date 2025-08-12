// src/middleware/corsConfig.js

import cors from 'cors';

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // List of allowed origins
    const allowedOrigins = [
      process.env.CLIENT_URL || 'http://localhost:4200',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:4200',
      'http://127.0.0.1:3000'
    ];

    // Add additional origins from environment variable
    if (process.env.ADDITIONAL_ORIGINS) {
      const additionalOrigins = process.env.ADDITIONAL_ORIGINS.split(',');
      allowedOrigins.push(...additionalOrigins);
    }

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-Refresh-Token',
    'X-Request-ID'
  ],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 200,
  maxAge: 86400 // 24 hours
};

// Development CORS (less restrictive)
const devCorsOptions = {
  origin: true, // Allow all origins in development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-Refresh-Token',
    'X-Request-ID'
  ],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 200
};

// Choose configuration based on environment
const corsConfig = process.env.NODE_ENV === 'development' ? devCorsOptions : corsOptions;

// Create CORS middleware
const corsMiddleware = cors(corsConfig);

// Socket.IO CORS configuration
export const socketCorsOptions = {
  origin: corsConfig.origin,
  methods: corsConfig.methods,
  credentials: corsConfig.credentials
};

// API-specific CORS configuration
export const apiCorsOptions = {
  ...corsConfig,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: [
    ...corsConfig.allowedHeaders,
    'X-API-Key',
    'X-Client-Version'
  ]
};

// WebSocket CORS configuration
export const wsCorsOptions = {
  origin: corsConfig.origin,
  credentials: corsConfig.credentials
};

// Export default CORS middleware
export default corsMiddleware;

// Export named configurations
export {
  corsOptions,
  devCorsOptions,
  corsConfig,
  corsMiddleware
};