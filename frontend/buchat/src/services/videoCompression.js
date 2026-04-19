/**
 * Video Compression Service
 * Provides YouTube-like video compression before upload
 * Reduces file size while maintaining quality
 */

// Target bitrates for different resolutions (in bps)
const BITRATE_MAP = {
  2160: 20000000,  // 4K: 20 Mbps
  1440: 10000000,  // 1440p: 10 Mbps
  1080: 5000000,   // 1080p: 5 Mbps
  720: 2500000,    // 720p: 2.5 Mbps
  480: 1000000,    // 480p: 1 Mbps
  360: 600000,     // 360p: 600 Kbps
};

// Maximum dimensions for upload (4K max)
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;

// Target file size limits (in bytes)
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const COMPRESSION_THRESHOLD = 10 * 1024 * 1024; // Compress if > 10 MB

/**
 * Check if compression is supported in the browser
 */
export const isCompressionSupported = () => {
  return (typeof MediaRecorder !== 'undefined' && 
         typeof VideoEncoder !== 'undefined') ||
         typeof MediaRecorder !== 'undefined';
};

/**
 * Get video metadata (duration, dimensions, etc.)
 */
export const getVideoMetadata = (file) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        aspectRatio: video.videoWidth / video.videoHeight,
      });
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };
    
    video.src = URL.createObjectURL(file);
  });
};

/**
 * Calculate target dimensions while maintaining aspect ratio
 */
const calculateTargetDimensions = (width, height, maxWidth = MAX_WIDTH, maxHeight = MAX_HEIGHT) => {
  let targetWidth = width;
  let targetHeight = height;
  
  // Scale down if larger than max dimensions
  if (width > maxWidth || height > maxHeight) {
    const widthRatio = maxWidth / width;
    const heightRatio = maxHeight / height;
    const ratio = Math.min(widthRatio, heightRatio);
    
    targetWidth = Math.round(width * ratio);
    targetHeight = Math.round(height * ratio);
  }
  
  // Ensure dimensions are even (required for many codecs)
  targetWidth = targetWidth - (targetWidth % 2);
  targetHeight = targetHeight - (targetHeight % 2);
  
  return { width: targetWidth, height: targetHeight };
};

/**
 * Compress video using Canvas + MediaRecorder
 * This is a lightweight compression that works in all browsers
 */
export const compressVideo = async (file, onProgress = () => {}) => {
  // Check if file needs compression
  if (file.size < COMPRESSION_THRESHOLD) {
    console.log('Video is small enough, skipping compression');
    onProgress({ stage: 'skip', progress: 100, message: 'Video is optimized' });
    return file;
  }

  onProgress({ stage: 'analyzing', progress: 0, message: 'Analyzing video...' });

  try {
    // Get video metadata
    const metadata = await getVideoMetadata(file);
    const { width, height, duration } = metadata;
    
    // Calculate target dimensions
    const target = calculateTargetDimensions(width, height);
    
    // Check if we need to resize
    const needsResize = target.width < width || target.height < height;
    
    // For short videos or no resize needed, skip compression
    if (duration < 5 && !needsResize && file.size < 50 * 1024 * 1024) {
      console.log('Video is short and well-sized, skipping compression');
      onProgress({ stage: 'skip', progress: 100, message: 'Video is optimized' });
      return file;
    }

    onProgress({ stage: 'preparing', progress: 10, message: 'Preparing compression...' });

    // Create video element
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = reject;
      video.src = URL.createObjectURL(file);
    });

    // Create canvas for frame processing
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');

    // Determine bitrate based on target height
    const targetBitrate = BITRATE_MAP[target.height] || BITRATE_MAP[720];
    
    // Calculate optimal bitrate based on file size target
    const targetFileSizeBits = MAX_FILE_SIZE * 8;
    const durationBitrate = targetFileSizeBits / duration;
    const optimalBitrate = Math.min(targetBitrate, durationBitrate);

    onProgress({ stage: 'compressing', progress: 20, message: 'Compressing video...' });

    // Create MediaRecorder from canvas stream
    const stream = canvas.captureStream(30);
    
    // Try to get audio track from original video
    if (video.captureStream) {
      try {
        const originalStream = video.captureStream();
        const audioTracks = originalStream.getAudioTracks();
        if (audioTracks.length > 0) {
          stream.addTrack(audioTracks[0]);
        }
      } catch (e) {
        console.log('Could not capture audio track:', e);
      }
    }

    // Determine best codec
    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/mp4';
    }

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: optimalBitrate,
    });

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    // Start recording
    recorder.start(100); // Collect data every 100ms

    // Play video and draw to canvas
    video.currentTime = 0;
    await video.play();

    // Process frames
    const frameInterval = setInterval(() => {
      if (video.paused || video.ended) return;
      
      ctx.drawImage(video, 0, 0, target.width, target.height);
      
      // Update progress
      const progress = Math.min(90, 20 + (video.currentTime / duration) * 70);
      onProgress({ 
        stage: 'compressing', 
        progress: Math.round(progress), 
        message: `Compressing... ${Math.round((video.currentTime / duration) * 100)}%` 
      });
    }, 1000 / 30);

    // Wait for video to end
    await new Promise((resolve) => {
      video.onended = resolve;
      video.onpause = resolve;
    });

    clearInterval(frameInterval);
    recorder.stop();

    // Wait for all data to be collected
    await new Promise((resolve) => {
      recorder.onstop = resolve;
    });

    // Cleanup
    video.pause();
    URL.revokeObjectURL(video.src);

    onProgress({ stage: 'finalizing', progress: 95, message: 'Finalizing...' });

    // Create compressed file
    const compressedBlob = new Blob(chunks, { type: mimeType });
    
    // Check if compression was beneficial
    if (compressedBlob.size >= file.size * 0.9) {
      console.log('Compression did not reduce size significantly, using original');
      onProgress({ stage: 'complete', progress: 100, message: 'Using original (optimized)' });
      return file;
    }

    // Create new file with compressed data
    const compressedFile = new File(
      [compressedBlob], 
      file.name.replace(/\.[^/.]+$/, '.webm'),
      { type: mimeType }
    );

    const savedPercent = Math.round((1 - compressedFile.size / file.size) * 100);
    console.log(`Compressed video: ${formatSize(file.size)} → ${formatSize(compressedFile.size)} (saved ${savedPercent}%)`);
    
    onProgress({ 
      stage: 'complete', 
      progress: 100, 
      message: `Compressed! Saved ${savedPercent}%`,
      originalSize: file.size,
      compressedSize: compressedFile.size,
    });

    return compressedFile;
  } catch (error) {
    console.error('Video compression failed:', error);
    onProgress({ stage: 'error', progress: 100, message: 'Compression failed, using original' });
    return file;
  }
};

/**
 * Quick compress using re-encoding with lower quality
 * Faster than full re-encode but less control
 */
export const quickCompress = async (file, quality = 0.8) => {
  // For images
  if (file.type.startsWith('image/')) {
    return await compressImage(file, quality);
  }
  
  // For videos, return original if small
  if (file.size < COMPRESSION_THRESHOLD) {
    return file;
  }
  
  // Otherwise use full compression
  return compressVideo(file);
};

/**
 * Compress image using Canvas
 */
export const compressImage = async (file, quality = 0.85, maxDimension = 2048) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      
      let { width, height } = img;
      
      // Scale down if needed
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            const compressedFile = new File([blob], file.name, { type: 'image/jpeg' });
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        quality
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(file);
    };
    
    img.src = URL.createObjectURL(file);
  });
};

/**
 * Format file size for display
 */
export const formatSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Estimate upload time based on file size and connection speed
 */
export const estimateUploadTime = (fileSize, speedMbps = 10) => {
  const speedBps = speedMbps * 1024 * 1024 / 8;
  const seconds = fileSize / speedBps;
  
  if (seconds < 60) {
    return `~${Math.ceil(seconds)}s`;
  } else if (seconds < 3600) {
    return `~${Math.ceil(seconds / 60)}m`;
  } else {
    return `~${Math.ceil(seconds / 3600)}h`;
  }
};

const videoCompressionService = {
  isCompressionSupported,
  getVideoMetadata,
  compressVideo,
  quickCompress,
  compressImage,
  formatSize,
  estimateUploadTime,
};

export default videoCompressionService;
