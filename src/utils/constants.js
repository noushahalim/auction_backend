// src/utils/constants.js

// Application constants

// User roles
const USER_ROLES = {
    MANAGER: 'manager',
    ADMIN: 'admin'
  };
  
  // Auction statuses
  const AUCTION_STATUS = {
    UPCOMING: 'upcoming',
    ONGOING: 'ongoing',
    PAUSED: 'paused',
    COMPLETED: 'completed'
  };
  
  // Player statuses
  const PLAYER_STATUS = {
    AVAILABLE: 'available',
    SOLD: 'sold',
    UNSOLD: 'unsold'
  };
  
  // Player categories
  const PLAYER_CATEGORIES = {
    GOALKEEPER: 'GK',
    DEFENDER: 'DEF',
    MIDFIELDER: 'MID',
    ATTACKER: 'ATT',
    UNSOLD: 'UNSOLD'
  };
  
  // Auction modes
  const AUCTION_MODES = {
    AUTO: 'auto',
    MANUAL: 'manual'
  };
  
  // Broadcast types
  const BROADCAST_TYPES = {
    GENERAL: 'general',
    ANNOUNCEMENT: 'announcement',
    AUCTION: 'auction',
    SYSTEM: 'system'
  };
  
  // Broadcast priorities
  const BROADCAST_PRIORITIES = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent'
  };
  
  // Target audiences
  const TARGET_AUDIENCES = {
    ALL: 'all',
    MANAGERS: 'managers',
    ADMINS: 'admins'
  };
  
  // Request statuses
  const REQUEST_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected'
  };
  
  // Achievement types
  const ACHIEVEMENT_TYPES = {
    FIRST_BID: 'first_bid',
    AUCTION_WIN: 'auction_win',
    PER_BID: 'per_bid',
    AUCTION_WINS: 'auction_wins',
    HIGH_BID: 'high_bid'
  };
  
  // Default values
  const DEFAULTS = {
    AUCTION_TIMER: 60, // seconds
    BREAK_TIMER: 30, // seconds
    BASE_BUDGET: 200000000, // 200M
    RULE_TILL_VALUE: 20,
    RESTART_TIMER_REDUCTION: 5,
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_AVATAR_SIZE: 5 * 1024 * 1024, // 5MB
    PAGINATION_LIMIT: 20,
    MAX_PAGINATION_LIMIT: 100
  };
  
  // File types
  const ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp'
  ];
  
  // Rate limiting
  const RATE_LIMITS = {
    AUTH: {
      WINDOW_MS: 15 * 60 * 1000, // 15 minutes
      MAX_ATTEMPTS: 5
    },
    GENERAL: {
      WINDOW_MS: 15 * 60 * 1000, // 15 minutes
      MAX_ATTEMPTS: 100
    },
    BID: {
      WINDOW_MS: 60 * 1000, // 1 minute
      MAX_ATTEMPTS: 30
    }
  };
  
  // Socket events
  const SOCKET_EVENTS = {
    // Connection events
    CONNECTION: 'connection',
    DISCONNECT: 'disconnect',
  
    // Authentication
    AUTHENTICATE: 'authenticate',
  
    // Auction events
    JOIN_AUCTION: 'joinAuction',
    LEAVE_AUCTION: 'leaveAuction',
    BID_PLACED: 'bidPlaced',
    BID_UPDATE: 'bidUpdate',
    AUCTION_STARTED: 'auctionStarted',
    AUCTION_STOPPED: 'auctionStopped',
    AUCTION_COMPLETED: 'auctionCompleted',
    PLAYER_SOLD: 'playerSold',
    PLAYER_SKIPPED: 'playerSkipped',
    NEXT_PLAYER: 'nextPlayer',
    CATEGORY_COMPLETED: 'categoryCompleted',
    TIMER_UPDATE: 'timerUpdate',
  
    // Vote events
    VOTE_UPDATE: 'voteUpdate',
    CELEBRATION: 'celebration',
  
    // Chat events
    CHAT_MESSAGE: 'chatMessage',
    CHAT_HISTORY: 'chatHistory',
  
    // Notification events
    BROADCAST: 'broadcast',
    NOTIFICATION: 'notification',
  
    // Admin events
    ADMIN_ACTION: 'adminAction',
    MANAGER_UPDATE: 'managerUpdate',
  
    // Error events
    ERROR: 'error',
    VALIDATION_ERROR: 'validationError'
  };
  
  // HTTP status codes
  const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500
  };
  
  // Error messages
  const ERROR_MESSAGES = {
    VALIDATION_FAILED: 'Validation failed',
    UNAUTHORIZED: 'Unauthorized access',
    FORBIDDEN: 'Access forbidden',
    NOT_FOUND: 'Resource not found',
    INTERNAL_ERROR: 'Internal server error',
    INVALID_CREDENTIALS: 'Invalid credentials',
    TOKEN_EXPIRED: 'Token expired',
    INSUFFICIENT_BALANCE: 'Insufficient balance',
    AUCTION_NOT_ACTIVE: 'Auction is not active',
    PLAYER_NOT_AVAILABLE: 'Player is not available',
    BID_TOO_LOW: 'Bid amount is too low',
    ALREADY_HIGHEST_BIDDER: 'You are already the highest bidder',
    DUPLICATE_USERNAME: 'Username already exists',
    INVALID_REGISTRATION_CODE: 'Invalid registration code',
    FILE_TOO_LARGE: 'File too large',
    INVALID_FILE_TYPE: 'Invalid file type',
    RATE_LIMIT_EXCEEDED: 'Rate limit exceeded'
  };
  
  // Success messages
  const SUCCESS_MESSAGES = {
    LOGIN_SUCCESS: 'Login successful',
    REGISTRATION_SUBMITTED: 'Registration request submitted',
    PROFILE_UPDATED: 'Profile updated successfully',
    BID_PLACED: 'Bid placed successfully',
    AUCTION_STARTED: 'Auction started successfully',
    AUCTION_STOPPED: 'Auction stopped successfully',
    PLAYER_CREATED: 'Player created successfully',
    PLAYER_UPDATED: 'Player updated successfully',
    PLAYER_DELETED: 'Player deleted successfully',
    BROADCAST_SENT: 'Broadcast message sent successfully',
    SETTINGS_UPDATED: 'Settings updated successfully',
    REQUEST_APPROVED: 'Request approved successfully',
    REQUEST_REJECTED: 'Request rejected successfully'
  };
  
  // Validation constraints
  const VALIDATION = {
    USERNAME: {
      MIN_LENGTH: 3,
      MAX_LENGTH: 50,
      PATTERN: /^[a-zA-Z0-9_]+$/
    },
    PASSWORD: {
      MIN_LENGTH: 6,
      PATTERN: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/
    },
    NAME: {
      MIN_LENGTH: 2,
      MAX_LENGTH: 100
    },
    TEAM_NAME: {
      MIN_LENGTH: 2,
      MAX_LENGTH: 100
    },
    PLAYER_NAME: {
      MIN_LENGTH: 2,
      MAX_LENGTH: 100
    },
    AUCTION_NAME: {
      MIN_LENGTH: 3,
      MAX_LENGTH: 200
    },
    DESCRIPTION: {
      MAX_LENGTH: 1000
    },
    BROADCAST_MESSAGE: {
      MIN_LENGTH: 1,
      MAX_LENGTH: 1000
    }
  };
  
  module.exports = {
    USER_ROLES,
    AUCTION_STATUS,
    PLAYER_STATUS,
    PLAYER_CATEGORIES,
    AUCTION_MODES,
    BROADCAST_TYPES,
    BROADCAST_PRIORITIES,
    TARGET_AUDIENCES,
    REQUEST_STATUS,
    ACHIEVEMENT_TYPES,
    DEFAULTS,
    ALLOWED_IMAGE_TYPES,
    RATE_LIMITS,
    SOCKET_EVENTS,
    HTTP_STATUS,
    ERROR_MESSAGES,
    SUCCESS_MESSAGES,
    VALIDATION
  };
  