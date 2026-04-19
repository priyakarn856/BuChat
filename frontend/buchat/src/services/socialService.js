import api from './api';
import { API_ENDPOINTS } from '../config/api';

export const socialService = {
  // Follow user
  followUser: async (username, userId) => {
    const response = await api.post(API_ENDPOINTS.FOLLOW_USER(username), {
      userId,
    });
    return response.data;
  },

  // Unfollow user
  unfollowUser: async (username, userId) => {
    const response = await api.delete(API_ENDPOINTS.FOLLOW_USER(username), {
      data: { userId },
    });
    return response.data;
  },

  // Get followers
  getFollowers: async (username, params = {}) => {
    const response = await api.get(API_ENDPOINTS.USER_FOLLOWERS(username), { params });
    return response.data;
  },

  // Get following
  getFollowing: async (username, params = {}) => {
    const response = await api.get(API_ENDPOINTS.USER_FOLLOWING(username), { params });
    return response.data;
  },

  // Send message
  sendMessage: async (messageData) => {
    const response = await api.post(API_ENDPOINTS.SEND_MESSAGE, messageData);
    return response.data;
  },

  // Get conversation
  getConversation: async (conversationId, params = {}) => {
    const response = await api.get(API_ENDPOINTS.GET_CONVERSATION(conversationId), {
      params,
    });
    return response.data;
  },

  // Get inbox
  getInbox: async (userId, params = {}) => {
    const response = await api.get(API_ENDPOINTS.GET_INBOX, {
      params: { userId, ...params },
    });
    return response.data;
  },

  // Mark message as read
  markMessageRead: async (messageId, userId) => {
    const response = await api.put(API_ENDPOINTS.MARK_MESSAGE_READ(messageId), {
      userId,
    });
    return response.data;
  },

  // Get personalized feed
  getPersonalizedFeed: async (userId, params = {}) => {
    const response = await api.get(API_ENDPOINTS.GET_FEED, {
      params: { userId, ...params },
    });
    return response.data;
  },

  // Get conversations list
  getConversations: async (userId) => {
    const response = await api.get(API_ENDPOINTS.GET_INBOX, {
      params: { userId },
    });
    return response.data;
  },

  // Create conversation
  createConversation: async (senderId, recipientId) => {
    const response = await api.post(API_ENDPOINTS.SEND_MESSAGE, {
      senderId,
      recipientId,
      body: '',
      type: 'init',
    });
    return response.data;
  },

  // Remove follower
  removeFollower: async (username, followerUsername) => {
    const response = await api.delete(`/users/${username}/followers/${followerUsername}`);
    return response.data;
  },

  // Status APIs - Disabled (not implemented in backend)
  createStatus: async (statusData) => {
    return { statuses: [] };
  },

  getStatuses: async (includePublic = true) => {
    return { statuses: [] };
  },

  viewStatus: async (statusId, ownerId) => {
    return { success: true };
  },

  deleteStatus: async (statusId) => {
    return { success: true };
  },
};
