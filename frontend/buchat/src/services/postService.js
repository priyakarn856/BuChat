import api from './api';
import { API_ENDPOINTS } from '../config/api';

export const postService = {
  // Unified feed API - supports New, Trending, Following
  getFeed: async (feedType = 'new', filters = {}) => {
    const params = {
      feedType, // 'new', 'trending', 'following'
      limit: filters.limit || 25,
      ...filters // postType, group, timeframe, nsfw, flair, userId
    };
    const response = await api.get(API_ENDPOINTS.GLOBAL_POSTS, { params });
    return response.data;
  },

  // Legacy method - use getFeed instead
  getGlobalFeed: async (params = {}) => {
    const response = await api.get(API_ENDPOINTS.GLOBAL_POSTS, { 
      params: { feedType: 'new', ...params } 
    });
    return response.data;
  },

  // Legacy method - use getFeed with feedType='following' instead
  getUserFeed: async (userId, params = {}) => {
    const response = await api.get(API_ENDPOINTS.GLOBAL_POSTS, {
      params: { feedType: 'following', userId, ...params },
    });
    return response.data;
  },

  // Save/unsave post
  savePost: async (postId, userId) => {
    const response = await api.post(`/posts/${postId}/save`, { userId });
    return response.data;
  },

  // Unsave post
  unsavePost: async (postId, userId) => {
    const response = await api.delete(`/posts/${postId}/save?userId=${userId}`);
    return response.data;
  },

  // Get saved posts
  getSavedPosts: async (username) => {
    const token = localStorage.getItem('token');
    let userId = null;
    
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userId = payload.userId || payload.sub;
      } catch (error) {
        
      }
    }
    
    
    const params = userId ? { userId } : {};
    const response = await api.get(`/users/${username}/saved`, { params });
    
    return response.data;
  },

  // Create post
  createPost: async (groupName, postData) => {
    const response = await api.post(API_ENDPOINTS.CREATE_POST(groupName), postData);
    return response.data;
  },

  // Get post by ID
  getPost: async (postId) => {
    const token = localStorage.getItem('token');
    let userId = null;
    
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userId = payload.userId || payload.sub;
      } catch (error) {
        
      }
    }
    
    const params = userId ? { userId } : {};
    const response = await api.get(API_ENDPOINTS.POST_BY_ID(postId), { params });
    return response.data;
  },

  // Update post
  updatePost: async (postId, postData) => {
    const response = await api.put(API_ENDPOINTS.POST_BY_ID(postId), postData);
    return response.data;
  },

  // Delete post
  deletePost: async (postId, userId) => {
    const response = await api.delete(API_ENDPOINTS.POST_BY_ID(postId), {
      data: { userId },
    });
    return response.data;
  },

  // Get group posts
  getgroupPosts: async (groupName, params = {}) => {
    const response = await api.get(API_ENDPOINTS.GROUP_POSTS(groupName), { params });
    return response.data;
  },

  // Search posts
  searchPosts: async (query, params = {}) => {
    const response = await api.get(API_ENDPOINTS.SEARCH_POSTS, {
      params: { q: query, ...params },
    });
    return response.data;
  },

  // Get trending posts
  getTrendingPosts: async (params = {}) => {
    const response = await api.get(API_ENDPOINTS.TRENDING_POSTS, { params });
    return response.data;
  },

  // Vote on post
  votePost: async (postId, userId, vote) => {
    const response = await api.post(API_ENDPOINTS.VOTE_POST(postId), {
      userId,
      vote, // 1, -1, or 0
    });
    return response.data;
  },

  // Get user's vote on post
  getUserVote: async (postId, userId) => {
    const response = await api.get(API_ENDPOINTS.VOTE_POST(postId), {
      params: { userId },
    });
    return response.data;
  },

  // Auto-tag post (AI)
  autoTagPost: async (postId) => {
    const response = await api.post(API_ENDPOINTS.AUTO_TAG(postId));
    return response.data;
  },

  // Get post sentiment (AI)
  getPostSentiment: async (postId) => {
    const response = await api.get(API_ENDPOINTS.GET_SENTIMENT(postId));
    return response.data;
  },

  // Report post
  reportPost: async (postId, reportData) => {
    const response = await api.post(API_ENDPOINTS.REPORT_POST(postId), reportData);
    return response.data;
  },

  // Hide post
  hidePost: async (postId, userId) => {
    const response = await api.post(API_ENDPOINTS.HIDE_POST(postId), { userId });
    return response.data;
  },

  // Crosspost
  crosspostPost: async (postId, targetgroup, userId) => {
    const response = await api.post(API_ENDPOINTS.CROSSPOST(postId), {
      targetgroup,
      userId,
    });
    return response.data;
  },

  // Share post
  sharePost: async (postId, platform) => {
    const response = await api.post(API_ENDPOINTS.SHARE_POST(postId), { platform });
    return response.data;
  },

  // Get post media
  getPostMedia: async (postId) => {
    const response = await api.get(`/posts/${postId}/media`);
    return response.data;
  },

  // Track media view
  trackMediaView: async (postId, userId, mediaIndex, duration = 0) => {
    try {
      const response = await api.post(`/posts/${postId}/media/view`, {
        userId,
        mediaIndex,
        duration,
      });
      return response.data;
    } catch (error) {
      
      return null;
    }
  },

  // Update post media
  updatePostMedia: async (postId, userId, media) => {
    const response = await api.put(`/posts/${postId}/media`, {
      userId,
      media,
    });
    return response.data;
  },

  // Upload media for post with progress tracking
  uploadMedia: async (file, onProgress = null) => {
    try {
      // Determine media type
      let mediaType = 'document';
      if (file.type.startsWith('image/')) mediaType = 'image';
      else if (file.type.startsWith('video/')) mediaType = 'video';
      else if (file.type.startsWith('audio/')) mediaType = 'audio';
      else if (file.type === 'image/gif') mediaType = 'gif';

      // Report progress: Getting presigned URL
      if (onProgress) {
        onProgress({ stage: 'preparing', progress: 5, message: 'Preparing upload...' });
      }

      // Get presigned URL
      const presignResponse = await api.post(API_ENDPOINTS.UPLOAD_PRESIGN, {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        mediaType
      });

      const { uploadUrl, s3Key, fileId } = presignResponse.data;

      // Report progress: Starting upload
      if (onProgress) {
        onProgress({ stage: 'uploading', progress: 10, message: 'Starting upload...' });
      }

      // Upload to S3 with progress tracking using XMLHttpRequest
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable && onProgress) {
            // Progress from 10% to 90% during upload
            const uploadProgress = Math.round((event.loaded / event.total) * 80) + 10;
            const loadedMB = (event.loaded / (1024 * 1024)).toFixed(1);
            const totalMB = (event.total / (1024 * 1024)).toFixed(1);
            onProgress({ 
              stage: 'uploading', 
              progress: uploadProgress, 
              message: `Uploading ${loadedMB}MB / ${totalMB}MB`,
              loaded: event.loaded,
              total: event.total
            });
          }
        });
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            if (onProgress) {
              onProgress({ stage: 'processing', progress: 90, message: 'Processing...' });
            }
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });
        
        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });
        
        xhr.addEventListener('abort', () => {
          reject(new Error('Upload cancelled'));
        });
        
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.send(file);
      });

      // Return media object
      const bucketName = process.env.REACT_APP_MEDIA_BUCKET || 'buchat-media';
      const region = process.env.REACT_APP_AWS_REGION || 'ap-south-1';
      const s3Url = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
      
      const mediaData = {
        type: mediaType,
        url: s3Url,
        key: s3Key,
        fileId,
        metadata: {
          filename: file.name,
          size: file.size,
          mimeType: file.type
        }
      };

      // For videos, check transcoding status briefly (don't block upload)
      if (mediaType === 'video') {
        if (onProgress) {
          onProgress({ stage: 'finalizing', progress: 95, message: 'Video uploaded! Processing in background...' });
        }
        
        // Quick check if transcoding has started (don't wait long)
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const statusResponse = await api.get(`/transcode/status/${fileId}`);
          if (statusResponse.data.status === 'COMPLETE' && statusResponse.data.hlsManifest) {
            mediaData.metadata.hlsManifest = statusResponse.data.hlsManifest;
            mediaData.metadata.qualities = statusResponse.data.qualities;
          } else {
            // Transcoding in progress - video will be processed in background
            mediaData.metadata.hlsManifest = null;
            mediaData.metadata.qualities = null;
          }
        } catch (err) {
          // Transcoding not started yet - that's fine, it will happen in background
          console.log('Video transcoding will process in background');
          mediaData.metadata.hlsManifest = null;
          mediaData.metadata.qualities = null;
        }
      }
      
      // Report completion
      if (onProgress) {
        onProgress({ stage: 'complete', progress: 100, message: 'Upload complete!' });
      }
      
      return mediaData;
    } catch (error) {
      
      throw error;
    }
  },
};
