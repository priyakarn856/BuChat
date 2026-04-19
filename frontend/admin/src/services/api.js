import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('adminToken');
      window.location.href = '/login';
      toast.error('Session expired. Please login again.');
    } else if (error.response?.status === 403) {
      toast.error('You do not have permission to perform this action.');
    } else if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.');
    }
    return Promise.reject(error);
  }
);

// API Methods
export const adminAPI = {
  // Auth
  login: (credentials) => api.post('/admin/login', credentials),
  
  // Stats
  getStats: () => api.get('/admin/stats'),
  getAnalytics: () => api.get('/admin/analytics'),
  
  // Users
  getUsers: (params) => api.get('/admin/users', { params }),
  getUserDetails: (userId) => api.get(`/admin/users/${userId}`),
  banUser: (userId, data) => api.post(`/admin/users/${userId}/ban`, data),
  suspendUser: (userId, data) => api.post(`/admin/users/${userId}/suspend`, data),
  deleteUser: (userId) => api.delete(`/admin/users/${userId}`),
  updateUserRole: (userId, role) => api.patch(`/admin/users/${userId}/role`, { role }),
  
  // Posts
  getPosts: (params) => api.get('/admin/posts', { params }),
  deletePost: (postId) => api.delete(`/admin/posts/${postId}`),
  togglePostVisibility: (postId) => api.patch(`/admin/posts/${postId}/visibility`),
  
  // Communities
  getCommunities: (params) => api.get('/admin/communities', { params }),
  deleteCommunity: (communityId) => api.delete(`/admin/communities/${communityId}`),
  updateCommunity: (communityId, data) => api.patch(`/admin/communities/${communityId}`, data),
  
  // Comments
  getComments: (params) => api.get('/admin/comments', { params }),
  deleteComment: (commentId) => api.delete(`/admin/comments/${commentId}`),
  
  // Reports
  getReports: (params) => api.get('/admin/reports', { params }),
  resolveReport: (reportId, action) => api.post(`/admin/reports/${reportId}/resolve`, { action }),
  
  // Logs
  getLogs: (params) => api.get('/admin/logs', { params }),
  
  // Settings
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (settings) => api.put('/admin/settings', settings),
};

export default api;
