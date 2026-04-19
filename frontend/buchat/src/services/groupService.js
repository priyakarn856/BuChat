import api from './api';
import { API_ENDPOINTS } from '../config/api';

export const groupService = {
  // Create group
  creategroup: async (groupData) => {
    // Ensure creator and creatorId are included
    const response = await api.post(API_ENDPOINTS.GROUPS, {
      ...groupData,
      creator: groupData.creator || groupData.username,
      creatorId: groupData.creatorId || groupData.userId,
    });
    return response.data;
  },

  // Get all GROUPS
  getAllGROUPS: async (params = {}) => {
    const response = await api.get(API_ENDPOINTS.GROUPS, { params });
    return response.data;
  },

  // Get group by name
  getgroup: async (name) => {
    const response = await api.get(API_ENDPOINTS.GROUP_BY_NAME(name));
    return response.data;
  },

  // Join group
  joingroup: async (name, userId) => {
    const response = await api.post(API_ENDPOINTS.JOIN_GROUP(name), { userId });
    return response.data;
  },

  // Leave group
  leavegroup: async (name, userId) => {
    const response = await api.post(API_ENDPOINTS.LEAVE_GROUP(name), { userId });
    return response.data;
  },

  // Check if user is a member
  checkMembership: async (name, userId) => {
    try {
      const response = await api.get(API_ENDPOINTS.GROUP_BY_NAME(name) + `/members/${userId}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return { isMember: false };
      }
      
      return { isMember: false };
    }
  },

  // Discover GROUPS
  discoverGROUPS: async (userId) => {
    const response = await api.get(API_ENDPOINTS.GROUPS, {
      params: { userId, limit: 20 },
    });
    return response.data;
  },

  // Get joined groups
  getJoinedGroups: async (userId) => {
    const response = await api.get(API_ENDPOINTS.GROUPS, {
      params: { userId, joined: true },
    });
    return response.data;
  },

  // Get group leaderboard
  getgroupLeaderboard: async (name, params = {}) => {
    const response = await api.get(API_ENDPOINTS.GROUP_LEADERBOARD(name), { params });
    return response.data;
  },

  // Search GROUPS
  searchGROUPS: async (query, params = {}) => {
    const response = await api.get(API_ENDPOINTS.GROUPS, {
      params: { q: query, ...params },
    });
    return response.data;
  },

  // Invite moderator
  inviteModerator: async (groupName, userId, username, requesterId, permissions) => {
    const response = await api.post(`${API_ENDPOINTS.GROUP_BY_NAME(groupName)}/moderators/invite`, {
      userId,
      username,
      requesterId,
      permissions
    });
    return response.data;
  },

  // Respond to moderator invite
  respondModInvite: async (groupName, inviteId, userId, accept) => {
    const response = await api.post(`${API_ENDPOINTS.GROUP_BY_NAME(groupName)}/moderators/respond`, {
      inviteId,
      userId,
      accept
    });
    return response.data;
  },

  // Remove moderator
  removeModerator: async (groupName, userId, requesterId) => {
    const response = await api.delete(`${API_ENDPOINTS.GROUP_BY_NAME(groupName)}/moderators/${userId}`, {
      data: { requesterId }
    });
    return response.data;
  },

  // Get moderators
  getModerators: async (groupName) => {
    const response = await api.get(`${API_ENDPOINTS.GROUP_BY_NAME(groupName)}/moderators`);
    return response.data;
  },

  // Get members
  getMembers: async (groupName) => {
    const response = await api.get(`${API_ENDPOINTS.GROUP_BY_NAME(groupName)}/members`);
    return response.data;
  },

  // Update group settings
  updateGroup: async (groupName, requesterId, settings) => {
    const response = await api.put(API_ENDPOINTS.GROUP_BY_NAME(groupName), {
      requesterId,
      ...settings
    });
    return response.data;
  },
};
