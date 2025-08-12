// src/utils/constants.js

// Socket.IO event constants
export const SOCKET_EVENTS = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  ERROR: 'error',

  // Authentication events
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',
  AUTHENTICATION_ERROR: 'authentication_error',

  // Auction events
  JOIN_AUCTION: 'join_auction',
  LEAVE_AUCTION: 'leave_auction',
  AUCTION_STARTED: 'auction_started',
  AUCTION_PAUSED: 'auction_paused',
  AUCTION_RESUMED: 'auction_resumed',
  AUCTION_COMPLETED: 'auction_completed',
  AUCTION_STATE: 'auction_state',

  // Player events
  PLAYER_STARTED: 'player_started',
  PLAYER_COMPLETED: 'player_completed',
  PLAYER_SOLD: 'player_sold',
  PLAYER_UNSOLD: 'player_unsold',
  NEXT_PLAYER: 'next_player',

  // Bidding events
  BID_PLACED: 'bid_placed',
  BID_RECEIVED: 'bid_received',
  BID_ACCEPTED: 'bid_accepted',
  BID_REJECTED: 'bid_rejected',
  BID_OUTBID: 'bid_outbid',
  NEW_HIGHEST_BID: 'new_highest_bid',

  // Timer events
  TIMER_STARTED: 'timer_started',
  TIMER_TICK: 'timer_tick',
  TIMER_ENDED: 'timer_ended',
  TIMER_EXTENDED: 'timer_extended',

  // Break events
  BREAK_STARTED: 'break_started',
  BREAK_ENDED: 'break_ended',

  // Chat events
  CHAT_MESSAGE: 'chat_message',
  CHAT_MESSAGE_RECEIVED: 'chat_message_received',

  // Admin events
  ADMIN_ACTION: 'admin_action',
  ADMIN_BROADCAST: 'admin_broadcast',
  ADMIN_UPDATE: 'admin_update',

  // User events
  USER_JOINED: 'user_joined',
  USER_LEFT: 'user_left',
  USER_UPDATE: 'user_update',

  // Notification events
  NOTIFICATION: 'notification',
  BROADCAST: 'broadcast',
  ACHIEVEMENT_EARNED: 'achievement_earned',

  // Connection events
  PING: 'ping',
  PONG: 'pong',
  RECONNECT: 'reconnect',
  RECONNECT_ATTEMPT: 'reconnect_attempt'
};

// Player categories
export const PLAYER_CATEGORIES = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  MID: 'Midfielder',
  ATT: 'Attacker'
};

// Player status
export const PLAYER_STATUS = {
  AVAILABLE: 'available',
  SOLD: 'sold',
  UNSOLD: 'unsold'
};

// Auction status
export const AUCTION_STATUS = {
  UPCOMING: 'upcoming',
  ONGOING: 'ongoing',
  PAUSED: 'paused',
  COMPLETED: 'completed'
};

// Auction modes
export const AUCTION_MODES = {
  AUTO: 'auto',
  MANUAL: 'manual'
};

// User roles
export const USER_ROLES = {
  MANAGER: 'manager',
  ADMIN: 'admin'
};

// Request status
export const REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

// Broadcast types
export const BROADCAST_TYPES = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  SUCCESS: 'success',
  ANNOUNCEMENT: 'announcement'
};

// Broadcast priorities
export const BROADCAST_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

// Achievement categories
export const ACHIEVEMENT_CATEGORIES = {
  BIDDING: 'bidding',
  AUCTION: 'auction',
  SPENDING: 'spending',
  WINNING: 'winning',
  PARTICIPATION: 'participation',
  SPECIAL: 'special'
};

// Achievement types
export const ACHIEVEMENT_TYPES = {
  MILESTONE: 'milestone',
  STREAK: 'streak',
  CHALLENGE: 'challenge',
  BADGE: 'badge'
};

// Achievement rarities
export const ACHIEVEMENT_RARITIES = {
  COMMON: 'common',
  UNCOMMON: 'uncommon',
  RARE: 'rare',
  EPIC: 'epic',
  LEGENDARY: 'legendary'
};

// File types
export const FILE_TYPES = {
  IMAGE: 'image',
  DOCUMENT: 'document',
  AVATAR: 'avatar',
  PLAYER_IMAGE: 'player_image'
};

// Allowed image mime types
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp'
];

// Allowed document mime types
export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv'
];

// Default values
export const DEFAULTS = {
  BASE_BUDGET: 200000000,
  TIMER_DURATION: 60,
  BREAK_DURATION: 30,
  RULE_TILL_VALUE: 20,
  RESTART_TIMER_REDUCTION: 5,
  REGISTRATION_CODE: 'auction2025',
  PAGINATION_LIMIT: 20,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_AVATAR_SIZE: 5 * 1024 * 1024, // 5MB
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100
};

// API response messages
export const MESSAGES = {
  // Success messages
  SUCCESS: 'Operation completed successfully',
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  REGISTRATION_SUCCESS: 'Registration request submitted successfully',
  UPDATE_SUCCESS: 'Updated successfully',
  DELETE_SUCCESS: 'Deleted successfully',
  UPLOAD_SUCCESS: 'File uploaded successfully',

  // Error messages
  INVALID_CREDENTIALS: 'Invalid credentials',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Forbidden access',
  NOT_FOUND: 'Resource not found',
  VALIDATION_ERROR: 'Validation error',
  SERVER_ERROR: 'Internal server error',
  DATABASE_ERROR: 'Database error',
  FILE_UPLOAD_ERROR: 'File upload error',

  // Auction messages
  AUCTION_STARTED: 'Auction has started',
  AUCTION_PAUSED: 'Auction has been paused',
  AUCTION_RESUMED: 'Auction has been resumed',
  AUCTION_COMPLETED: 'Auction has been completed',
  BID_PLACED: 'Bid placed successfully',
  BID_TOO_LOW: 'Bid amount is too low',
  INSUFFICIENT_BALANCE: 'Insufficient balance',
  PLAYER_SOLD: 'Player has been sold',
  PLAYER_UNSOLD: 'Player remains unsold',

  // Registration messages
  INVALID_REGISTRATION_CODE: 'Invalid registration code',
  USERNAME_TAKEN: 'Username is already taken',
  PENDING_APPROVAL: 'Registration request is pending approval',
  ACCOUNT_DEACTIVATED: 'Account has been deactivated',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'Too many requests, please try again later',

  // Maintenance
  MAINTENANCE_MODE: 'System is under maintenance'
};

// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// Regex patterns
export const REGEX_PATTERNS = {
  USERNAME: /^[a-zA-Z0-9_]+$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
  EMAIL: /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/,
  PHONE: /^[\+]?[1-9]?[0-9]{7,15}$/,
  TEAM_NAME: /^[a-zA-Z0-9\s]+$/
};

// Cache keys
export const CACHE_KEYS = {
  SETTINGS: 'app:settings',
  ACTIVE_AUCTION: 'auction:active',
  USER_STATS: 'user:stats:',
  LEADERBOARD: 'leaderboard:',
  ACHIEVEMENTS: 'achievements:active',
  BROADCASTS: 'broadcasts:active'
};

// Export default bundle
export default {
  SOCKET_EVENTS,
  PLAYER_CATEGORIES,
  PLAYER_STATUS,
  AUCTION_STATUS,
  AUCTION_MODES,
  USER_ROLES,
  REQUEST_STATUS,
  BROADCAST_TYPES,
  BROADCAST_PRIORITIES,
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_TYPES,
  ACHIEVEMENT_RARITIES,
  FILE_TYPES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  DEFAULTS,
  MESSAGES,
  HTTP_STATUS,
  REGEX_PATTERNS,
  CACHE_KEYS
};