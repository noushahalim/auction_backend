// src/utils/logger.js
import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ESModule __dirname shim
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define log levels
const levels = {
  error: 0,
  warn:  1,
  info:  2,
  http:  3,
  debug: 4,
};

// Define log colors
const colors = {
  error: 'red',
  warn:  'yellow',
  info:  'green',
  http:  'magenta',
  debug: 'white',
};
winston.addColors(colors);

// Determine log level by environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  return env === 'development' ? 'debug' : 'warn';
};

// Pretty console format
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    info => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// File (JSON) format
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Transports
const transports = [
  new winston.transports.Console({
    format: consoleFormat,
    level: level(),
  }),
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: fileFormat,
    maxsize: 5 * 1024 * 1024,  // 5MB
    maxFiles: 5
  }),
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    format: fileFormat,
    maxsize: 5 * 1024 * 1024,
    maxFiles: 10
  })
];

// Create logger
export const logger = winston.createLogger({
  level: level(),
  levels,
  transports,
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      format: fileFormat
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      format: fileFormat
    })
  ]
});

// Custom logging methods
logger.auction     = (msg, data = {}) => logger.info(`[AUCTION] ${msg}`, data);
logger.security    = (msg, data = {}) => logger.warn(`[SECURITY] ${msg}`, data);
logger.performance = (msg, data = {}) => logger.info(`[PERFORMANCE] ${msg}`, data);
logger.api         = (msg, data = {}) => logger.http(`[API] ${msg}`, data);

// Default export for convenience
export default { logger };