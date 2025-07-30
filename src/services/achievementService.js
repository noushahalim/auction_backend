// src/services/achievementService.js

const User = require('../models/User');
const Settings = require('../models/Settings');
const { logger } = require('../utils/logger');

class AchievementService {
  // Check achievements after a bid is placed
  async checkBidAchievements(user, bidAmount) {
    try {
      const settings = await Settings.getSettings();
      const achievements = settings.achievements;

      // First bid achievement
      if (user.bidCount === 1) {
        const firstBidAchievement = achievements.find(a => a.id === 'first_blood');
        if (firstBidAchievement) {
          await this.awardAchievement(user._id, firstBidAchievement);
        }
      }

      // Per bid achievement (awarded for each bid)
      const perBidAchievement = achievements.find(a => a.id === 'persistent_bidder');
      if (perBidAchievement) {
        await this.awardPoints(user._id, perBidAchievement.points);
      }

      // High bid achievements
      const highBidAchievements = achievements.filter(a => 
        a.criteria.type === 'high_bid' && bidAmount >= a.criteria.amount
      );

      for (const achievement of highBidAchievements) {
        await this.awardAchievement(user._id, achievement);
      }

    } catch (error) {
      logger.error('Check bid achievements error:', error);
    }
  }

  // Check achievements after winning an auction
  async checkWinAchievements(user, winPrice) {
    try {
      const settings = await Settings.getSettings();
      const achievements = settings.achievements;

      // First win achievement
      if (user.auctionsWon === 1) {
        const firstWinAchievement = achievements.find(a => a.id === 'auction_victor');
        if (firstWinAchievement) {
          await this.awardAchievement(user._id, firstWinAchievement);
        }
      }

      // Multiple wins achievement
      const multiWinAchievements = achievements.filter(a => 
        a.criteria.type === 'auction_wins' && user.auctionsWon >= a.criteria.count
      );

      for (const achievement of multiWinAchievements) {
        await this.awardAchievement(user._id, achievement);
      }

      // High spending achievements for this specific win
      const highSpendAchievements = achievements.filter(a => 
        a.criteria.type === 'high_bid' && winPrice >= a.criteria.amount
      );

      for (const achievement of highSpendAchievements) {
        await this.awardAchievement(user._id, achievement);
      }

    } catch (error) {
      logger.error('Check win achievements error:', error);
    }
  }

  // Award an achievement to a user
  async awardAchievement(userId, achievement) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if user already has this achievement
      const hasAchievement = user.achievements.some(a => a.id === achievement.id);
      if (hasAchievement) {
        return; // Already has this achievement
      }

      // Add achievement
      user.addAchievement(achievement.id, achievement.name);

      // Award points
      user.points += achievement.points;

      await user.save();

      logger.info(`Achievement "${achievement.name}" awarded to user ${user.username}`);

      return {
        achievement: {
          id: achievement.id,
          name: achievement.name,
          points: achievement.points
        },
        newTotalPoints: user.points
      };

    } catch (error) {
      logger.error('Award achievement error:', error);
      throw error;
    }
  }

  // Award points to a user (without specific achievement)
  async awardPoints(userId, points) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      user.points += points;
      await user.save();

      return user.points;

    } catch (error) {
      logger.error('Award points error:', error);
      throw error;
    }
  }

  // Get user's achievement progress
  async getUserAchievementProgress(userId) {
    try {
      const user = await User.findById(userId);
      const settings = await Settings.getSettings();

      if (!user) {
        throw new Error('User not found');
      }

      const availableAchievements = settings.achievements.map(achievement => {
        const userAchievement = user.achievements.find(ua => ua.id === achievement.id);

        return {
          id: achievement.id,
          name: achievement.name,
          description: achievement.description,
          points: achievement.points,
          achieved: !!userAchievement,
          achievedAt: userAchievement?.achievedAt,
          progress: this.calculateProgress(achievement, user)
        };
      });

      return {
        achievements: availableAchievements,
        totalPoints: user.points,
        totalAchievements: user.achievements.length
      };

    } catch (error) {
      logger.error('Get user achievement progress error:', error);
      throw error;
    }
  }

  // Calculate progress for an achievement
  calculateProgress(achievement, user) {
    switch (achievement.criteria.type) {
      case 'first_bid':
        return user.bidCount > 0 ? 100 : 0;

      case 'auction_win':
        return user.auctionsWon > 0 ? 100 : 0;

      case 'per_bid':
        // Show progress up to 100 bids for display purposes
        return Math.min(100, (user.bidCount / 100) * 100);

      case 'auction_wins':
        return Math.min(100, (user.auctionsWon / achievement.criteria.count) * 100);

      case 'high_bid':
        // This would need to check user's highest bid from bid history
        // For now, return 0 as placeholder
        return 0;

      default:
        return 0;
    }
  }

  // Get leaderboard based on points
  async getPointsLeaderboard(limit = 10) {
    try {
      return await User.find({ 
        role: 'manager', 
        isActive: true 
      })
      .select('name username teamName points avatarUrl achievements')
      .sort({ points: -1, name: 1 })
      .limit(limit);

    } catch (error) {
      logger.error('Get points leaderboard error:', error);
      throw error;
    }
  }

  // Get achievement statistics
  async getAchievementStats() {
    try {
      const settings = await Settings.getSettings();
      const allUsers = await User.find({ role: 'manager', isActive: true });

      const stats = settings.achievements.map(achievement => {
        const usersWithAchievement = allUsers.filter(user => 
          user.achievements.some(ua => ua.id === achievement.id)
        );

        return {
          id: achievement.id,
          name: achievement.name,
          totalEarned: usersWithAchievement.length,
          percentage: allUsers.length > 0 ? (usersWithAchievement.length / allUsers.length) * 100 : 0
        };
      });

      return {
        achievementStats: stats,
        totalUsers: allUsers.length,
        totalPointsAwarded: allUsers.reduce((sum, user) => sum + user.points, 0)
      };

    } catch (error) {
      logger.error('Get achievement stats error:', error);
      throw error;
    }
  }

  // Manually award achievement (admin function)
  async manualAwardAchievement(userId, achievementId, adminId) {
    try {
      const settings = await Settings.getSettings();
      const achievement = settings.achievements.find(a => a.id === achievementId);

      if (!achievement) {
        throw new Error('Achievement not found');
      }

      const result = await this.awardAchievement(userId, achievement);

      logger.info(`Achievement "${achievement.name}" manually awarded to user ${userId} by admin ${adminId}`);

      return result;

    } catch (error) {
      logger.error('Manual award achievement error:', error);
      throw error;
    }
  }
}

module.exports = new AchievementService();
