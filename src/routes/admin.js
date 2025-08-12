// src/routes/admin.js
import { Router } from 'express';
import {
  getRequests,
  approveRequest,
  rejectRequest,
  getAllManagers,
  getManager,
  updateManager,
  getAllPlayers,
  createPlayer,
  updatePlayer,
  deletePlayer,
  bulkUpdatePlayers,
  createAuction,
  getSettings,
  updateSettings,
  getAllBroadcasts,
  createBroadcast,
  deleteBroadcast,
  getDashboardStats
} from '../controllers/adminController.js';
import { auth, adminAuth } from '../middleware/auth.js';
import { uploadPlayerImage } from '../middleware/upload.js';
import {
  validatePlayerCreation,
  validatePlayerUpdate,
  validateAuctionCreation,
  validateBroadcast,
  validateSettings,
  validatePagination,
  validateSearch,
  validateObjectId
} from '../middleware/validation.js';
import auctionService from '../services/auctionService.js';
import User from '../models/User.js';
import Player from '../models/Player.js';

const router = Router();

// All admin routes require authentication and admin role
router.use(auth, adminAuth);

// Registration Requests Management
router.get(
  '/requests',
  validatePagination,
  getRequests
);
router.post(
  '/requests/:id/approve',
  validateObjectId('id'),
  approveRequest
);
router.post(
  '/requests/:id/reject',
  validateObjectId('id'),
  rejectRequest
);

// Manager Management
router.get(
  '/managers',
  validatePagination,
  validateSearch,
  getAllManagers
);
router.get(
  '/managers/:id',
  validateObjectId('id'),
  getManager
);
router.put(
  '/managers/:id',
  validateObjectId('id'),
  updateManager
);

// Player Management
router.get(
  '/players',
  validatePagination,
  validateSearch,
  getAllPlayers
);
router.post(
  '/players',
  uploadPlayerImage(),
  validatePlayerCreation,
  createPlayer
);
router.put(
  '/players/:id',
  validateObjectId('id'),
  uploadPlayerImage(),
  validatePlayerUpdate,
  updatePlayer
);
router.delete(
  '/players/:id',
  validateObjectId('id'),
  deletePlayer
);
router.post(
  '/players/bulk',
  bulkUpdatePlayers
);

// Auction Management
router.post(
  '/auctions',
  validateAuctionCreation,
  createAuction
);

// Settings Management
router.get(
  '/settings',
  getSettings
);
router.put(
  '/settings',
  validateSettings,
  updateSettings
);

// Broadcast Management
router.get(
  '/broadcasts',
  validatePagination,
  getAllBroadcasts
);
router.post(
  '/broadcasts',
  validateBroadcast,
  createBroadcast
);
router.delete(
  '/broadcasts/:id',
  validateObjectId('id'),
  deleteBroadcast
);

// Send simple managers-info to chat
router.post(
  '/auctions/:id/managers-info',
  validateObjectId('id'),
  async (req, res, next) => {
    try {
      const managers = await User.find({ role: 'manager', isActive: true })
        .select('name username teamName balance')
        .sort({ name: 1 });

      const managersInfo = managers
        .map(m => `${m.name} (${m.username}) – Team: ${m.teamName} – Balance: ${m.balance.toLocaleString()}`)
        .join('\n');

      req.app.get('io')?.to(`auction:${req.params.id}`).emit('chatMessage', {
        type: 'system',
        message: `📋 MANAGERS INFO\n${managersInfo}`,
        timestamp: new Date()
      });

      res.json({ success: true, message: 'Managers info sent to chat' });
    } catch (err) {
      next(err);
    }
  }
);

// Send detailed managers-info to chat
router.post(
  '/auctions/:id/managers-detailed',
  validateObjectId('id'),
  async (req, res, next) => {
    try {
      const managers = await User.find({ role: 'manager', isActive: true })
        .select('name username teamName balance')
        .sort({ name: 1 });

      let detailedInfo = '📊 DETAILED MANAGERS INFO\n\n';

      for (const m of managers) {
        const players = await Player.find({ soldTo: m._id, status: 'sold' })
          .select('name soldPrice')
          .sort({ soldPrice: -1 });

        const totalSpent = players.reduce((sum, p) => sum + (p.soldPrice || 0), 0);

        detailedInfo += `👤 ${m.name} (${m.teamName})\n`;
        detailedInfo += `💰 Balance: ${m.balance.toLocaleString()} | Spent: ${totalSpent.toLocaleString()}\n`;
        detailedInfo += players.length
          ? `🏆 Players (${players.length}): ${players.map(p => `${p.name} (${p.soldPrice?.toLocaleString()})`).join(', ')}\n\n`
          : '🏆 No players yet\n\n';
      }

      req.app.get('io')?.to(`auction:${req.params.id}`).emit('chatMessage', {
        type: 'system',
        message: detailedInfo,
        timestamp: new Date()
      });

      res.json({ success: true, message: 'Detailed managers info sent to chat' });
    } catch (err) {
      next(err);
    }
  }
);

// Admin dashboard stats
router.get(
  '/dashboard',
  async (req, res, next) => {
    try {
      const [
        totalManagers,
        activeManagers,
        totalPlayers,
        soldPlayers,
        pendingRequests,
        ongoingAuctions,
        totalBroadcasts
      ] = await Promise.all([
        User.countDocuments({ role: 'manager' }),
        User.countDocuments({ role: 'manager', isActive: true }),
        Player.countDocuments(),
        Player.countDocuments({ status: 'sold' }),
        Request.countDocuments({ status: 'pending' }),
        Auction.countDocuments({ status: { $in: ['ongoing', 'paused'] } }),
        Broadcast.countDocuments({ status: 'sent' })
      ]);

      const stats = {
        users: { total: totalManagers, active: activeManagers, inactive: totalManagers - activeManagers },
        players: { total: totalPlayers, sold: soldPlayers, available: totalPlayers - soldPlayers },
        requests: { pending: pendingRequests },
        auctions: { ongoing: ongoingAuctions },
        broadcasts: { total: totalBroadcasts }
      };

      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }
);

export default router;