import api from './api';
import { API_ENDPOINTS } from '../config/api';

export const userService = {
  // Register with email/password
  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  // Login with email/password
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  // Verify email
  verifyEmail: async (email, code) => {
    const response = await api.post('/auth/verify', { email, code });
    return response.data;
  },

  // Resend verification
  resendVerification: async (email) => {
    const response = await api.post('/auth/resend', { email });
    return response.data;
  },

  // Google Sign-In
  googleAuth: async (idToken) => {
    const response = await api.post('/auth/google', { idToken });
    return response.data;
  },

  // Complete Google profile
  completeGoogleProfile: async (profileData) => {
    const response = await api.post('/auth/complete-profile', profileData);
    return response.data;
  },

  // Forgot password
  forgotPassword: async (email) => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },

  // Reset password
  resetPassword: async (email, code, newPassword) => {
    const response = await api.post('/auth/reset-password', { email, code, newPassword });
    return response.data;
  },

  // Create user (legacy)
  createUser: async (userData) => {
    const response = await api.post(API_ENDPOINTS.USERS, userData);
    return response.data;
  },

  // Get user profile
  getUserProfile: async (username) => {
    const response = await api.get(API_ENDPOINTS.USER_BY_USERNAME(username));
    return response.data;
  },

  // Update user profile
  updateUserProfile: async (username, userData) => {
    const response = await api.put(API_ENDPOINTS.USER_BY_USERNAME(username), userData);
    return response.data;
  },

  // Get user posts
  getUserPosts: async (username, params = {}) => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const response = await api.get(API_ENDPOINTS.USER_POSTS(username), { 
      params: { ...params, userId: user.userId } 
    });
    return response.data;
  },

  // Get user comments
  getUserComments: async (username, params = {}) => {
    const response = await api.get(API_ENDPOINTS.USER_COMMENTS(username), { params });
    return response.data;
  },

  // Get user stats
  getUserStats: async (username) => {
    const response = await api.get(API_ENDPOINTS.USER_STATS(username));
    return response.data;
  },

  // Get user level
  getUserLevel: async (username) => {
    const response = await api.get(API_ENDPOINTS.USER_LEVEL(username));
    return response.data;
  },

  // Search users
  searchUsers: async (query, params = {}) => {
    const response = await api.get('/users/search', {
      params: { q: query, ...params },
    });
    return response.data;
  },

  // Check if username exists
  checkUsername: async (username) => {
    const response = await api.get(`/users/check-username/${username}`);
    return response.data;
  },

  // Check if email exists
  checkEmail: async (email) => {
    const response = await api.get(`/users/check-email/${email}`);
    return response.data;
  },

  // Get user groups (owned and joined)
  getUserGroups: async (username) => {
    try {
      const response = await api.get(`/users/${username}/groups`);
      return response.data;
    } catch (error) {
      // Return empty if endpoint doesn't exist yet
      
      return { owned: [], joined: [] };
    }
  },

  // Get user suggestions
  getUserSuggestions: async (userId, limit = 10) => {
    const response = await api.get('/users/suggestions', {
      params: { userId, limit }
    });
    return response.data;
  },

  // Get user by ID
  getUserById: async (userId) => {
    const response = await api.get(`/users/${userId}`);
    return response.data.user || response.data;
  },

  // Get saved posts
  getSavedPosts: async (username) => {
    const response = await api.get(`/users/${username}/saved`);
    return response.data;
  },

  // Upload image (avatar/banner) to S3
  uploadImage: async (file) => {
    try {
      // Validate file size
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image size must be less than 5MB');
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        throw new Error('File must be an image');
      }

      // Step 1: Get presigned URL
      const presignResponse = await api.post(API_ENDPOINTS.UPLOAD_PRESIGN, {
        filename: file.name,
        contentType: file.type,
        size: file.size,
        mediaType: 'image'
      });

      const { uploadUrl, s3Key } = presignResponse.data;

      // Step 2: Upload file to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload to S3');
      }

      // Step 3: Return the S3 URL (construct from key)
      const bucketName = process.env.REACT_APP_MEDIA_BUCKET || 'buchat-media';
      const region = process.env.REACT_APP_AWS_REGION || 'ap-south-1';
      const s3Url = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
      
      return { url: s3Url, key: s3Key };
    } catch (error) {
      
      throw error;
    }
  },
};
