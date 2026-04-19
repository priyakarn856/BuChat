/* eslint-disable no-unused-vars */
/**
 * HLS Video Player Component
 * Industry-standard adaptive streaming player with quality controls
 * Supports HLS (HTTP Live Streaming) for efficient video delivery
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize,
  Settings,
  RefreshCw,
  AlertCircle,
  Loader,
  PictureInPicture,
  SkipBack,
  SkipForward,
  Download
} from 'lucide-react';
import './HLSVideoPlayer.css';

const HLS_QUALITY_MAP = {
  'Auto': -1,
  '4K (2160p)': 2160,
  '2K (1440p)': 1440,
  '1080p HD': 1080,
  '720p HD': 720,
  '480p': 480,
  '360p': 360,
  '240p': 240,
  '144p': 144
};

const HLSVideoPlayer = ({
  src,
  poster,
  autoPlay = false,
  muted = false,
  loop = false,
  controls = true,
  onError,
  onLoadStart,
  onLoadedData,
  onPlay,
  onPause,
  onEnded,
  onTimeUpdate,
  className = '',
  style = {}
}) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const containerRef = useRef(null);
  const progressRef = useRef(null);
  const hideControlsTimeout = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPiP, setIsPiP] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [availableQualities, setAvailableQualities] = useState([]);
  const [currentQuality, setCurrentQuality] = useState('Auto');
  const [networkStats, setNetworkStats] = useState({
    bandwidth: 0,
    latency: 0
  });

  // Initialize HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Cleanup previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
    }

    // Detect if source is HLS manifest or regular video file
    const isHLSManifest = src.includes('.m3u8') || src.includes('/hls/') || src.includes('manifest');
    const isRegularVideo = src.match(/\.(mp4|webm|ogg|mov)$/i);

    // If it's a regular video file, use native player
    if (isRegularVideo && !isHLSManifest) {
      video.src = src;
      setIsLoading(false);
      return;
    }

    // Check if HLS is supported
    if (Hls.isSupported()) {
      const hls = new Hls({
        // Optimized configuration for COST + PERFORMANCE balance
        enableWorker: true,
        lowLatencyMode: false, // Disable for cost savings - reduces segment fetches
        backBufferLength: 30, // Reduced from 90 - saves memory/bandwidth
        maxBufferLength: 15, // Reduced from 30 - faster start, less preload
        maxMaxBufferLength: 60, // Reduced from 600 - prevent excessive buffering
        maxBufferSize: 30 * 1000 * 1000, // 30MB max (halved for mobile optimization)
        maxBufferHole: 0.5,
        startLevel: -1, // Auto quality - starts with bandwidth estimate
        capLevelToPlayerSize: true, // Don't load 4K for small players
        // Aggressive ABR for cost savings
        abrEwmaDefaultEstimate: 300000, // Start lower, scale up
        abrBandWidthFactor: 0.8, // More conservative bandwidth usage
        abrBandWidthUpFactor: 0.5, // Slower quality increases
        abrMaxWithRealBitrate: true, // Cap quality to actual bandwidth
        progressive: true,
        // Retry configuration
        fragLoadingMaxRetry: 3, // Reduced retries for cost
        manifestLoadingMaxRetry: 2,
        levelLoadingMaxRetry: 2,
        fragLoadingMaxRetryTimeout: 4000,
        // Connection optimization
        testBandwidth: true,
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        }
      });

      hlsRef.current = hls;

      // Handle quality levels
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        const qualities = data.levels.map((level, index) => ({
          index,
          height: level.height,
          width: level.width,
          bitrate: level.bitrate,
          label: getQualityLabel(level.height)
        }));
        
        setAvailableQualities([
          { index: -1, label: 'Auto', height: 0 },
          ...qualities.sort((a, b) => b.height - a.height)
        ]);
        
        setIsLoading(false);
        onLoadStart?.();
      });

      // Handle level switching
      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        const level = hls.levels[data.level];
        if (level) {
          setCurrentQuality(getQualityLabel(level.height));
        }
      });

      // Handle bandwidth estimation
      hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
        if (data.stats) {
          setNetworkStats({
            bandwidth: Math.round(data.stats.bwEstimate / 1000), // Kbps
            latency: Math.round(data.stats.loading?.first || 0)
          });
        }
      });

      // Handle errors
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS Error:', data);
        
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError('Network error occurred. Retrying...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError('Media error. Attempting recovery...');
              hls.recoverMediaError();
              break;
            default:
              setError('Playback failed. Please refresh the page.');
              onError?.(data);
              break;
          }
        }
      });

      hls.loadSource(src);
      hls.attachMedia(video);

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = src;
    } else {
      setError('HLS is not supported in this browser');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [src, onError, onLoadStart]);

  // Get quality label
  const getQualityLabel = (height) => {
    if (height >= 2160) return '4K';
    if (height >= 1440) return '1440p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    if (height >= 360) return '360p';
    if (height >= 240) return '240p';
    return '144p';
  };

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      setIsPlaying(true);
      onPlay?.();
    };

    const handlePause = () => {
      setIsPlaying(false);
      onPause?.();
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
      
      // Update buffer progress
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        setBuffered((bufferedEnd / video.duration) * 100);
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoading(false);
      onLoadedData?.();
    };

    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);
    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onPlay, onPause, onTimeUpdate, onLoadedData, onEnded]);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Handle PiP changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePiPEnter = () => setIsPiP(true);
    const handlePiPLeave = () => setIsPiP(false);

    video.addEventListener('enterpictureinpicture', handlePiPEnter);
    video.addEventListener('leavepictureinpicture', handlePiPLeave);

    return () => {
      video.removeEventListener('enterpictureinpicture', handlePiPEnter);
      video.removeEventListener('leavepictureinpicture', handlePiPLeave);
    };
  }, []);

  // Auto-hide controls
  const resetControlsTimeout = useCallback(() => {
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }
    setShowControls(true);
    
    if (isPlaying) {
      hideControlsTimeout.current = setTimeout(() => {
        setShowControls(false);
        setShowSettings(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Playback controls
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    
    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(console.error);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e) => {
    const video = videoRef.current;
    if (!video) return;
    
    const newVolume = parseFloat(e.target.value);
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const handleSeek = (e) => {
    const video = videoRef.current;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    video.currentTime = percent * duration;
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (isFullscreen) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (isPiP) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.error('PiP error:', err);
    }
  };

  const skip = (seconds) => {
    const video = videoRef.current;
    if (!video) return;
    
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + seconds));
  };

  const changeQuality = (qualityIndex) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = qualityIndex;
      if (qualityIndex === -1) {
        setCurrentQuality('Auto');
      }
    }
    setShowSettings(false);
  };

  const changePlaybackRate = (rate) => {
    const video = videoRef.current;
    if (!video) return;
    
    video.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSettings(false);
  };

  // Format time
  const formatTime = (seconds) => {
    if (isNaN(seconds)) return '0:00';
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div 
      ref={containerRef}
      className={`hls-player-container ${className} ${isFullscreen ? 'fullscreen' : ''}`}
      style={style}
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        poster={poster}
        autoPlay={autoPlay}
        muted={isMuted}
        loop={loop}
        playsInline
        onClick={togglePlay}
        className="hls-video"
      />

      {/* Loading Indicator */}
      {isLoading && (
        <div className="hls-loading">
          <Loader className="spin" size={48} />
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="hls-error">
          <AlertCircle size={48} />
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      )}

      {/* Play Button Overlay */}
      {!isPlaying && !isLoading && !error && (
        <div className="hls-play-overlay" onClick={togglePlay}>
          <button className="big-play-btn">
            <Play size={48} />
          </button>
        </div>
      )}

      {/* Controls */}
      {controls && (
        <div className={`hls-controls ${showControls ? 'visible' : ''}`}>
          {/* Progress Bar */}
          <div 
            ref={progressRef}
            className="hls-progress"
            onClick={handleSeek}
          >
            <div className="hls-progress-buffer" style={{ width: `${buffered}%` }} />
            <div className="hls-progress-bar" style={{ width: `${progress}%` }} />
            <div className="hls-progress-handle" style={{ left: `${progress}%` }} />
          </div>

          {/* Control Buttons */}
          <div className="hls-controls-row">
            <div className="hls-controls-left">
              <button onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>
              
              <button onClick={() => skip(-10)} title="Skip back 10s">
                <SkipBack size={18} />
              </button>
              
              <button onClick={() => skip(10)} title="Skip forward 10s">
                <SkipForward size={18} />
              </button>

              <div className="hls-volume-control">
                <button onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
                  {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="hls-volume-slider"
                />
              </div>

              <span className="hls-time">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="hls-controls-right">
              {/* Quality Indicator */}
              {currentQuality !== 'Auto' && (
                <span className="hls-quality-badge">{currentQuality}</span>
              )}

              {/* Network Stats */}
              {networkStats.bandwidth > 0 && (
                <span className="hls-bandwidth">{networkStats.bandwidth} Kbps</span>
              )}

              {/* Settings */}
              <div className="hls-settings-container">
                <button 
                  onClick={() => setShowSettings(!showSettings)}
                  title="Settings"
                  className={showSettings ? 'active' : ''}
                >
                  <Settings size={20} />
                </button>

                {showSettings && (
                  <div className="hls-settings-menu">
                    {/* Quality Settings */}
                    <div className="settings-section">
                      <h4>Quality</h4>
                      {availableQualities.map((q) => (
                        <button
                          key={q.index}
                          className={currentQuality === (q.index === -1 ? 'Auto' : q.label) ? 'active' : ''}
                          onClick={() => changeQuality(q.index)}
                        >
                          {q.index === -1 ? 'Auto' : q.label}
                          {q.bitrate && <span className="bitrate">{Math.round(q.bitrate / 1000)} Kbps</span>}
                        </button>
                      ))}
                    </div>

                    {/* Playback Speed */}
                    <div className="settings-section">
                      <h4>Speed</h4>
                      {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                        <button
                          key={rate}
                          className={playbackRate === rate ? 'active' : ''}
                          onClick={() => changePlaybackRate(rate)}
                        >
                          {rate === 1 ? 'Normal' : `${rate}x`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* PiP Button */}
              {'pictureInPictureEnabled' in document && (
                <button onClick={togglePiP} title="Picture in Picture">
                  <PictureInPicture size={20} />
                </button>
              )}

              {/* Fullscreen Button */}
              <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HLSVideoPlayer;
