// src/models/Request.js
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

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
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
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
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days ahead
    index: { expireAfterSeconds: 0 }
  }
}, {
  timestamps: true
});

// Indexes
requestSchema.index({ status: 1, createdAt: -1 });
requestSchema.index({ username: 1 });
requestSchema.index({ reviewedBy: 1 });

// Pre-save hook: hash password
requestSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Virtuals
requestSchema.virtual('ageInDays').get(function() {
  const diff = Date.now() - this.createdAt.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});
requestSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.expiresAt) return null;
  const diff = this.expiresAt.getTime() - Date.now();
  return diff <= 0 ? 0 : Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Instance methods
requestSchema.methods.approve = async function(adminId, assignmentData = {}) {
  if (this.status !== 'pending') {
    throw new Error('Only pending requests can be approved');
  }
  // Check username availability
  const { default: User } = await import('./User.js');
  const existing = await User.findOne({ username: this.username });
  if (existing) throw new Error('Username is no longer available');

  // Create user
  const { default: Settings } = await import('./Settings.js');
  const settings = await Settings.getSettings();
  const userData = {
    name: this.name,
    username: this.username,
    password: this.password,
    role: assignmentData.role || this.assignedRole,
    teamName: assignmentData.teamName || this.assignedTeamName,
    balance: assignmentData.balance || this.assignedBalance || settings.baseBudget,
    isActive: true
  };
  const newUser = await User.create(userData);

  // Update request
  this.status = 'approved';
  this.reviewedBy = adminId;
  this.reviewedAt = new Date();
  this.assignedTeamName = userData.teamName;
  this.assignedBalance = userData.balance;
  this.assignedRole = userData.role;
  await this.save();

  return { request: this, user: newUser };
};

requestSchema.methods.reject = async function(adminId, reason = null) {
  if (this.status !== 'pending') {
    throw new Error('Only pending requests can be rejected');
  }
  this.status = 'rejected';
  this.reviewedBy = adminId;
  this.reviewedAt = new Date();
  if (reason) this.reviewNotes = reason;
  return this.save();
};

requestSchema.methods.validateCode = function() {
  const expected = process.env.REGISTRATION_CODE;
  if (!expected) throw new Error('Registration code not configured');
  return this.code === expected;
};

requestSchema.methods.extendExpiry = function(days = 7) {
  this.expiresAt = new Date(this.expiresAt.getTime() + days * 24 * 60 * 60 * 1000);
  return this.save();
};

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

// Static methods
requestSchema.statics.getPendingRequests = function(limit = 50) {
  return this.find({ status: 'pending' })
    .select('-password -code')
    .sort({ createdAt: -1 })
    .limit(limit);
};

requestSchema.statics.getRequestsByStatus = function(status, limit = 50) {
  return this.find({ status })
    .populate('reviewedBy', 'name username')
    .select('-password -code')
    .sort({ createdAt: -1 })
    .limit(limit);
};

requestSchema.statics.cleanupExpired = function() {
  return this.deleteMany({ status: 'pending', expiresAt: { $lte: new Date() } })
    .then(res => res.deletedCount);
};

requestSchema.statics.getStats = function() {
  return this.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $group: {
        _id: null,
        total: { $sum: '$count' },
        breakdown: { $push: { status: '$_id', count: '$count' } }
    }}
  ]);
};

requestSchema.statics.isUsernameRequested = function(username) {
  return this.findOne({ username: username.toLowerCase(), status: 'pending' });
};

// Prevent deletion of approved requests
requestSchema.pre('remove', function(next) {
  if (this.status === 'approved') {
    return next(new Error('Cannot delete approved registration requests'));
  }
  next();
});

export default mongoose.model('Request', requestSchema);