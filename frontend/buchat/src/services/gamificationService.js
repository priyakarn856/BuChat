import api from './api';
import { API_ENDPOINTS } from '../config/api';

export const gamificationService = {
  // Award badge
  awardBadge: async (username, badgeData) => {
    const response = await api.post(API_ENDPOINTS.AWARD_BADGE(username), badgeData);
    return response.data;
  },

  // Get user badges
  getUserBadges: async (username) => {
    const response = await api.get(API_ENDPOINTS.GET_BADGES(username));
    return response.data;
  },

  // Update streak
  updateStreak: async (username, userId) => {
    const response = await api.post(API_ENDPOINTS.UPDATE_STREAK(username), { userId });
    return response.data;
  },

  // Get global leaderboard
  getGlobalLeaderboard: async (params = {}) => {
    const response = await api.get(API_ENDPOINTS.GLOBAL_LEADERBOARD, { params });
    return response.data;
  },

  // Check achievements
  checkAchievements: async (username, userId) => {
    const response = await api.post(API_ENDPOINTS.CHECK_ACHIEVEMENTS(username), {
      userId,
    });
    return response.data;
  },
};
