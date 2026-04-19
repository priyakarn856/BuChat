import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'https://ul0we70whi.execute-api.ap-south-1.amazonaws.com/Prod',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth tokens
api.interceptors.request.use(
  (config) => {
    // Get token from localStorage
    const token = localStorage.getItem('token');
    if (token) {
      // Clean the token - remove any extra quotes or whitespace
      const cleanToken = token.replace(/["']/g, '').trim();
      config.headers.Authorization = `Bearer ${cleanToken}`;
    }
    
    // Ensure proper headers for all requests
    config.headers['Content-Type'] = 'application/json';
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Server responded with error
    } else if (error.request) {
      // Request made but no response
    } else {
      // Error setting up request
    }
    return Promise.reject(error);
  }
);

export default api;
