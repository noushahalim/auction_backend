// src/middleware/corsConfig.js

// Provides secure cross-origin resource sharing settings

import cors from 'cors';
import { config } from '../config/database.js';

const corsConfig = cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Define allowed origins based on environment
    const allowedOrigins = process.env.NODE_ENV === 'production' 
      ? [
          process.env.CLIENT_URL,
          process.env.ADMIN_URL,
          'https://your-production-domain.com',
          'https://your-admin-panel.com'
        ].filter(Boolean)
      : [
          'http://localhost:3000',
          'http://localhost:4200', // Angular dev server
          'http://127.0.0.1:3000',
          'http://127.0.0.1:4200',
          'http://localhost:8080'
        ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  
  credentials: true, // Allow cookies and authentication headers
  
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Access-Token',
    'X-Correlation-ID'
  ],
  
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count', 
    'X-Correlation-ID'
  ],
  
  // Cache preflight requests for 24 hours
  maxAge: 86400,
  
  // Handle preflight requests
  preflightContinue: false,
  optionsSuccessStatus: 204
});

export default corsConfig;