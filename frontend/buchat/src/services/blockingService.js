import api from './api';

class BlockingService {
  getCurrentUserId() {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      return user.userId || user.id;
    } catch {
      return null;
    }
  }

  // Block User
  async blockUser(username) {
    try {
      const response = await api.post(`/users/${username}/block`, {
        userId: this.getCurrentUserId()
      });
      return response.data;
    } catch (error) {
      
      throw error;
    }
  }

  // Unblock User
  async unblockUser(username) {
    try {
      const response = await api.delete(`/users/${username}/block`, {
        data: {
          userId: this.getCurrentUserId()
        }
      });
      return response.data;
    } catch (error) {
      
      throw error;
    }
  }

  // Get Blocked Users
  async getBlockedUsers() {
    try {
      const userId = this.getCurrentUserId();
      const response = await api.get(`/users/blocked?userId=${userId}`);
      return response.data.blocked || [];
    } catch (error) {
      
      return [];
    }
  }

  // Check if user is blocked
  async isUserBlocked(userId) {
    try {
      const blockedUsers = await this.getBlockedUsers();
      return blockedUsers.some(blocked => blocked.blockedId === userId);
    } catch (error) {
      return false;
    }
  }
}

export default new BlockingService();
