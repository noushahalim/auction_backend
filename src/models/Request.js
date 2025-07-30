// src/models/Request.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const requestSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    lowercase: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [50, 'Username cannot exceed 50 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
    index: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  code: {
    type: String,
    required: [true, 'Registration code is required'],
    select: false
  },
  // Request status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  // Admin actions
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  reviewNotes: {
    type: String,
    maxlength: [500, 'Review notes cannot exceed 500 characters']
  },
  // Assigned details (when approved)
  assignedTeamName: {
    type: String,
    trim: true,
    maxlength: [100, 'Team name cannot exceed 100 characters']
  },
  assignedBalance: {
    type: Number,
    default: null,
    min: [0, 'Balance cannot be negative']
  },
  assignedRole: {
    type: String,
    enum: ['manager', 'admin'],
    default: 'manager'
  },
  // Contact information (optional)
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    trim: true
  },
  // Additional metadata
  registrationIP: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  source: {
    type: String,
    enum: ['web', 'mobile', 'api'],
    default: 'web'
  },
  // Auto-expire settings
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    index: { expireAfterSeconds: 0 }
  }
}, {
  timestamps: true
});

// Indexes
requestSchema.index({ status: 1, createdAt: -1 });
requestSchema.index({ username: 1 });
requestSchema.index({ reviewedBy: 1 });

// Hash password before saving
requestSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to approve request
requestSchema.methods.approve = async function(adminId, assignmentData = {}) {
  if (this.status !== 'pending') {
    throw new Error('Only pending requests can be approved');
  }
  
  // Check if username is still available
  const User = require('./User');
  const existingUser = await User.findOne({ username: this.username });
  if (existingUser) {
    throw new Error('Username is no longer available');
  }
  
  // Create the user account
  const Settings = require('./Settings');
  const settings = await Settings.getSettings();
  
  const userData = {
    name: this.name,
    username: this.username,
    password: this.password,
    role: assignmentData.role || this.assignedRole || 'manager',
    teamName: assignmentData.teamName || this.assignedTeamName || `${this.name}'s Team`,
    balance: assignmentData.balance || this.assignedBalance || settings.baseBudget,
    isActive: true
  };
  
  const newUser = await User.create(userData);
  
  // Update request status
  this.status = 'approved';
  this.reviewedBy = adminId;
  this.reviewedAt = new Date();
  this.assignedTeamName = userData.teamName;
  this.assignedBalance = userData.balance;
  this.assignedRole = userData.role;
  
  await this.save();
  
  return {
    request: this,
    user: newUser
  };
};

// Method to reject request
requestSchema.methods.reject = async function(adminId, reason = null) {
  if (this.status !== 'pending') {
    throw new Error('Only pending requests can be rejected');
  }
  
  this.status = 'rejected';
  this.reviewedBy = adminId;
  this.reviewedAt = new Date();
  
  if (reason) {
    this.reviewNotes = reason;
  }
  
  return this.save();
};

// Method to validate registration code
requestSchema.methods.validateCode = async function() {
  const expectedCode = process.env.REGISTRATION_CODE;
  if (!expectedCode) {
    throw new Error('Registration code not configured');
  }
  
  return this.code === expectedCode;
};

// Static method to get pending requests
requestSchema.statics.getPendingRequests = function(limit = 50) {
  return this.find({ status: 'pending' })
    .select('-password -code')
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method to get requests by status
requestSchema.statics.getRequestsByStatus = function(status, limit = 50) {
  return this.find({ status })
    .populate('reviewedBy', 'name username')
    .select('-password -code')
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method to clean up expired requests
requestSchema.statics.cleanupExpired = async function() {
  const result = await this.deleteMany({
    status: 'pending',
    expiresAt: { $lte: new Date() }
  });
  
  return result.deletedCount;
};

// Static method to get registration statistics
requestSchema.statics.getStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$count' },
        breakdown: {
          $push: {
            status: '$_id',
            count: '$count'
          }
        }
      }
    }
  ]);
};

// Static method to check if username is already requested
requestSchema.statics.isUsernameRequested = function(username) {
  return this.findOne({ 
    username: username.toLowerCase(),
    status: 'pending'
  });
};

// Virtual for request age
requestSchema.virtual('ageInDays').get(function() {
  const now = new Date();
  const diffTime = Math.abs(now - this.createdAt);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for time until expiry
requestSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.expiresAt) return null;
  
  const now = new Date();
  const diffTime = this.expiresAt - now;
  
  if (diffTime <= 0) return 0;
  
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Method to extend expiry
requestSchema.methods.extendExpiry = function(days = 7) {
  this.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return this.save();
};

// Method to get request summary
requestSchema.methods.getSummary = function() {
  return {
    id: this._id,
    name: this.name,
    username: this.username,
    status: this.status,
    createdAt: this.createdAt,
    ageInDays: this.ageInDays,
    daysUntilExpiry: this.daysUntilExpiry,
    reviewedBy: this.reviewedBy,
    reviewedAt: this.reviewedAt,
    reviewNotes: this.reviewNotes,
    assignedTeamName: this.assignedTeamName,
    source: this.source
  };
};

// Pre-remove middleware to prevent deletion of approved requests
requestSchema.pre('remove', function(next) {
  if (this.status === 'approved') {
    return next(new Error('Cannot delete approved registration requests'));
  }
  next();
});

module.exports = mongoose.model('Request', requestSchema);