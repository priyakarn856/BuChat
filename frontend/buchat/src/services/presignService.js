import api from './api';
import { API_ENDPOINTS } from '../config/api';

export const presignService = {
  // Get presigned URL for file upload
  getUploadUrl: async ({ filename, contentType, fileType, size }) => {
    const response = await api.post(API_ENDPOINTS.UPLOAD_PRESIGN, {
      filename,
      contentType,
      size,
      mediaType: fileType, // 'image', 'video', 'audio', 'document'
    });
    
    // Backend returns { uploadUrl, s3Key, fileId, mediaType, expiresIn }
    const { uploadUrl, s3Key, fileId } = response.data;
    const fileUrl = `https://${process.env.REACT_APP_MEDIA_BUCKET || 'buchat-media'}.s3.amazonaws.com/${s3Key}`;
    
    return { uploadUrl, fileUrl, s3Key, fileId };
  },

  // Get presigned URL for multipart upload (large files)
  initiateMultipartUpload: async ({ filename, contentType, fileType }) => {
    const response = await api.post('/presign/multipart/initiate', {
      filename,
      contentType,
      fileType,
    });
    return response.data; // { uploadId, key }
  },

  // Get presigned URLs for multipart upload parts
  getMultipartUploadUrls: async ({ uploadId, key, partNumbers }) => {
    const response = await api.post('/presign/multipart/urls', {
      uploadId,
      key,
      partNumbers, // Array of part numbers [1, 2, 3, ...]
    });
    return response.data; // { urls: [{ partNumber, url }] }
  },

  // Complete multipart upload
  completeMultipartUpload: async ({ uploadId, key, parts }) => {
    const response = await api.post('/presign/multipart/complete', {
      uploadId,
      key,
      parts, // Array of { partNumber, etag }
    });
    return response.data; // { fileUrl }
  },

  // Abort multipart upload
  abortMultipartUpload: async ({ uploadId, key }) => {
    const response = await api.post('/presign/multipart/abort', {
      uploadId,
      key,
    });
    return response.data;
  },

  // Get video HLS manifest URL
  getVideoManifest: async (videoId) => {
    const response = await api.get(`/presign/video/${videoId}/manifest.m3u8`);
    return response.data.manifestUrl;
  },

  // Get video quality playlist URL
  getVideoQualityPlaylist: async (videoId, quality) => {
    const response = await api.get(`/presign/video/${videoId}/${quality}/playlist.m3u8`);
    return response.data.playlistUrl;
  },

  // Get thumbnail URL
  getThumbnailUrl: async ({ fileKey, width = 300, height = 200 }) => {
    const response = await api.post('/presign/thumbnail', {
      fileKey,
      width,
      height,
    });
    return response.data.thumbnailUrl;
  },

  // Get download URL for document
  getDownloadUrl: async (fileKey) => {
    const response = await api.post('/presign/download', {
      fileKey,
    });
    return response.data.downloadUrl;
  },

  // Upload file directly (helper function)
  uploadFile: async (file, fileType, onProgress) => {
    try {
      const fileSize = file.size;
      const isLargeFile = fileSize > 100 * 1024 * 1024; // 100MB

      if (isLargeFile) {
        // Use multipart upload for large files
        return await presignService.uploadLargeFile(file, fileType, onProgress);
      }

      // Use simple presigned URL for smaller files
      const { uploadUrl, fileUrl } = await presignService.getUploadUrl({
        filename: file.name,
        contentType: file.type,
        fileType,
        size: file.size,
      });

      // Upload with XHR for progress tracking
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            const progress = (e.loaded / e.total) * 100;
            onProgress(progress);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200 || xhr.status === 204) {
            resolve({ fileUrl });
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Upload failed')));
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });
    } catch (error) {
      
      throw error;
    }
  },

  // Upload large file with multipart upload
  uploadLargeFile: async (file, fileType, onProgress) => {
    const PART_SIZE = 5 * 1024 * 1024; // 5MB per part
    const numParts = Math.ceil(file.size / PART_SIZE);

    try {
      // Initiate multipart upload
      const { uploadId, key } = await presignService.initiateMultipartUpload({
        filename: file.name,
        contentType: file.type,
        fileType,
      });

      // Get presigned URLs for all parts
      const partNumbers = Array.from({ length: numParts }, (_, i) => i + 1);
      const { urls } = await presignService.getMultipartUploadUrls({
        uploadId,
        key,
        partNumbers,
      });

      // Upload parts in parallel (with concurrency limit)
      const uploadedParts = [];
      let uploadedBytes = 0;

      for (let i = 0; i < numParts; i++) {
        const start = i * PART_SIZE;
        const end = Math.min(start + PART_SIZE, file.size);
        const part = file.slice(start, end);
        const partNumber = i + 1;
        const uploadUrl = urls.find(u => u.partNumber === partNumber).url;

        const response = await fetch(uploadUrl, {
          method: 'PUT',
          body: part,
          headers: {
            'Content-Type': file.type,
          },
        });

        if (!response.ok) {
          throw new Error(`Part ${partNumber} upload failed`);
        }

        const etag = response.headers.get('ETag');
        uploadedParts.push({ partNumber, etag: etag.replace(/"/g, '') });

        uploadedBytes += part.size;
        if (onProgress) {
          const progress = (uploadedBytes / file.size) * 100;
          onProgress(progress);
        }
      }

      // Complete multipart upload
      const { fileUrl } = await presignService.completeMultipartUpload({
        uploadId,
        key,
        parts: uploadedParts,
      });

      return { fileUrl };
    } catch (error) {
      
      throw error;
    }
  },
};
