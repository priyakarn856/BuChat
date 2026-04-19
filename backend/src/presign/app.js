const { S3Client, PutObjectCommand, GetObjectCommand, CopyObjectCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { getCorsHeaders, handlePreflight, createResponse } = require('./shared/cors');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4: uuidv4 } = require("uuid");

const s3 = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// File size limits by type
const MAX_SIZES = {
  image: 10 * 1024 * 1024,    // 10MB
  video: 500 * 1024 * 1024,   // 500MB
  gif: 20 * 1024 * 1024,      // 20MB
  audio: 50 * 1024 * 1024,    // 50MB
  document: 20 * 1024 * 1024  // 20MB
};

// Supported video codecs and qualities
const VIDEO_QUALITIES = [
  { quality: '144p', resolution: '256x144', bitrate: '200k' },
  { quality: '240p', resolution: '426x240', bitrate: '400k' },
  { quality: '360p', resolution: '640x360', bitrate: '800k' },
  { quality: '480p', resolution: '854x480', bitrate: '1200k' },
  { quality: '720p', resolution: '1280x720', bitrate: '2500k' },
  { quality: '1080p', resolution: '1920x1080', bitrate: '5000k' }
];

// CORS headers


exports.handler = async (event) => {
  
  // Handle OPTIONS preflight
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) {
    return preflightResponse;
  }

  try {
    const method = event.requestContext?.httpMethod || event.httpMethod;
    const path = event.path || event.requestPath || '/';
    
    // GENERATE UPLOAD URL - POST /upload/presign
    if (method === "POST" && path.includes("/presign")) {
      const body = JSON.parse(event.body || "{}");
      const { filename, contentType, size, mediaType } = body;

      if (!filename || !contentType || !size) {
        return createResponse(event, 400, { 
          message: "filename, contentType and size are required" 
        });
      }

      // Determine media type
      let type = mediaType || 'document';
      if (contentType.startsWith('image/')) type = 'image';
      else if (contentType.startsWith('video/')) type = 'video';
      else if (contentType.startsWith('audio/')) type = 'audio';
      else if (contentType === 'image/gif') type = 'gif';

      // Check size limit
      const maxSize = MAX_SIZES[type] || MAX_SIZES.document;
      if (size > maxSize) {
        return createResponse(event, 413, { 
          message: `File too large. Maximum ${type} size is ${maxSize / (1024*1024)}MB` 
        });
      }

      const ext = filename.split(".").pop();
      const fileId = uuidv4();
      const key = `uploads/${type}/${fileId}.${ext}`;

      const putCmd = new PutObjectCommand({
        Bucket: process.env.MEDIA_BUCKET,
        Key: key,
        ContentType: contentType,
        Metadata: {
          originalFilename: filename,
          uploadedAt: new Date().toISOString(),
          mediaType: type
        }
      });

      const uploadUrl = await getSignedUrl(s3, putCmd, { expiresIn: 600 }); // 10 minutes

      return createResponse(event, 200, { 
        uploadUrl, 
        s3Key: key,
        fileId,
        mediaType: type,
        expiresIn: 600
      });
    }

    // GET VIDEO MANIFEST (HLS) - GET /video/{videoId}/manifest.m3u8
    if (method === "GET" && path.includes("/video/") && path.includes("/manifest.m3u8")) {
      const videoId = path.split("/video/")[1].split("/")[0];
      
      // Generate HLS manifest with multiple quality options
      const qualities = VIDEO_QUALITIES;
      
      let manifest = "#EXTM3U\n#EXT-X-VERSION:3\n\n";
      
      for (const q of qualities) {
        manifest += `#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(q.bitrate)*1000},RESOLUTION=${q.resolution}\n`;
        manifest += `${q.quality}/playlist.m3u8\n`;
      }

      return createResponse(event, 200, manifest, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'max-age=3600'
      });
    }

    // GET VIDEO QUALITY PLAYLIST - GET /video/{videoId}/{quality}/playlist.m3u8
    if (method === "GET" && path.includes("/video/") && path.includes("/playlist.m3u8")) {
      const parts = path.split("/");
      const videoId = parts[parts.indexOf("video") + 1];
      const quality = parts[parts.indexOf("video") + 2];
      
      // In production, this would generate segment URLs
      // For now, return a simple playlist pointing to the full video
      const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.0,
segment-0.ts
#EXT-X-ENDLIST`;

      return createResponse(event, 200, playlist, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'max-age=3600'
      });
    }

    // GET SIGNED URL FOR DOWNLOAD - GET /media/{key}
    if (method === "GET" && path.includes("/media/")) {
      const key = path.split("/media/")[1];
      
      const getCmd = new GetObjectCommand({
        Bucket: process.env.MEDIA_BUCKET,
        Key: decodeURIComponent(key)
      });

      const downloadUrl = await getSignedUrl(s3, getCmd, { expiresIn: 3600 }); // 1 hour

      return createResponse(event, 200, { 
        downloadUrl,
        expiresIn: 3600
      });
    }

    // GET TRANSCODING STATUS - GET /transcode/status/{fileId}
    if (method === "GET" && path.includes("/transcode/status/")) {
      const fileId = path.split("/transcode/status/")[1];
      
      try {
        const result = await docClient.send(new QueryCommand({
          TableName: process.env.APP_TABLE,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: {
            ':pk': `VIDEO#${fileId}`
          },
          Limit: 1,
          ScanIndexForward: false
        }));

        if (result.Items && result.Items.length > 0) {
          const transcodeJob = result.Items[0];
          return createResponse(event, 200, {
            status: transcodeJob.jobStatus,
            hlsManifest: transcodeJob.hlsManifest,
            qualities: transcodeJob.qualities,
            createdAt: transcodeJob.createdAt,
            completedAt: transcodeJob.completedAt
          });
        }

        return createResponse(event, 404, {
          message: 'Transcoding job not found. Video may not have been uploaded yet.'
        });
      } catch (error) {
        console.error('Error fetching transcode status:', error);
        return createResponse(event, 500, {
          message: 'Error fetching transcoding status',
          error: error.message
        });
      }
    }

    // GENERATE MULTIPART UPLOAD - POST /upload/multipart
    if (method === "POST" && path.includes("/multipart")) {
      const body = JSON.parse(event.body || "{}");
      const { filename, contentType, size, parts } = body;

      if (!filename || !contentType || !size || !parts) {
        return createResponse(event, 400, { 
          message: "filename, contentType, size, and parts are required" 
        });
      }

      const fileId = uuidv4();
      const key = `uploads/multipart/${fileId}/${filename}`;

      // Generate presigned URLs for each part
      const partUrls = [];
      for (let i = 1; i <= parts; i++) {
        const putCmd = new PutObjectCommand({
          Bucket: process.env.MEDIA_BUCKET,
          Key: `${key}.part${i}`,
          ContentType: contentType
        });
        
        const partUrl = await getSignedUrl(s3, putCmd, { expiresIn: 3600 });
        partUrls.push({ partNumber: i, uploadUrl: partUrl });
      }

      return createResponse(event, 200, { 
        uploadId: fileId,
        key,
        parts: partUrls,
        expiresIn: 3600
      });
    }

    // GET THUMBNAIL - GET /thumbnail/{key}
    if (method === "GET" && path.includes("/thumbnail/")) {
      const key = path.split("/thumbnail/")[1];
      const thumbnailKey = `thumbnails/${key}`;
      
      const getCmd = new GetObjectCommand({
        Bucket: process.env.MEDIA_BUCKET,
        Key: decodeURIComponent(thumbnailKey)
      });

      const thumbnailUrl = await getSignedUrl(s3, getCmd, { expiresIn: 86400 }); // 24 hours

      return createResponse(event, 200, { 
        thumbnailUrl,
        expiresIn: 86400
      });
    }

    return createResponse(event, 400, { 
      message: "bad request" 
    });
  } catch (err) {
    console.error("presign error", err);
    return createResponse(event, 500, { 
      message: "internal error",
      error: err.message 
    });
  }
};
