import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings, Loader } from 'lucide-react';
import './VideoPlayer.css';

// Dynamically import HLS.js only when needed
let Hls = null;

const VideoPlayer = ({ 
  src, 
  hlsSrc, 
  poster, 
  autoPlay = false,
  muted = false,
  loop = false,
  onEnded,
  onError,
  className = ''
}) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hlsRef = useRef(null);
  const progressRef = useRef(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [qualities, setQualities] = useState([]);
  const [currentQuality, setCurrentQuality] = useState('auto');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [error, setError] = useState(null);
  
  const controlsTimeoutRef = useRef(null);
  
  // Quality labels for display
  const QUALITY_LABELS = {
    '-1': 'Auto',
    '0': '144p',
    '1': '240p', 
    '2': '360p',
    '3': '480p',
    '4': '720p',
    '5': '1080p',
    '6': '1440p',
    '7': '4K'
  };

  const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // Initialize HLS.js for adaptive streaming
  const initHls = useCallback(async () => {
    if (!hlsSrc || !videoRef.current) return;
    
    try {
      // Dynamically import HLS.js
      if (!Hls) {
        const HlsModule = await import('hls.js');
        Hls = HlsModule.default;
      }
      
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          maxBufferLength: 30,
          maxMaxBufferLength: 600,
          maxBufferSize: 60 * 1000 * 1000, // 60MB
          maxBufferHole: 0.5,
          capLevelToPlayerSize: true, // Auto quality based on player size
          startLevel: -1, // Auto start level
          abrEwmaDefaultEstimate: 500000, // Default bandwidth estimate
          abrBandWidthFactor: 0.95,
          abrBandWidthUpFactor: 0.7,
        });
        
        hls.loadSource(hlsSrc);
        hls.attachMedia(videoRef.current);
        
        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          const levels = data.levels.map((level, index) => ({
            index,
            height: level.height,
            width: level.width,
            bitrate: level.bitrate,
            label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}kbps`
          }));
          setQualities([{ index: -1, label: 'Auto' }, ...levels]);
          setIsLoading(false);
          if (autoPlay) {
            videoRef.current.play().catch(() => {});
          }
        });
        
        hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
          const level = hls.levels[data.level];
          if (level) {
            setCurrentQuality(currentQuality === 'auto' ? 'auto' : level.height);
          }
        });
        
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error('Network error, trying to recover...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error('Media error, trying to recover...');
                hls.recoverMediaError();
                break;
              default:
                console.error('Fatal error, cannot recover');
                hls.destroy();
                setError('Video playback failed');
                if (onError) onError(data);
                break;
            }
          }
        });
        
        hlsRef.current = hls;
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        videoRef.current.src = hlsSrc;
        setIsLoading(false);
      }
    } catch (err) {
      console.error('HLS init error:', err);
      // Fallback to direct source
      if (src && videoRef.current) {
        videoRef.current.src = src;
        setIsLoading(false);
      }
    }
  }, [hlsSrc, src, autoPlay, onError, currentQuality]);

  // Initialize video
  useEffect(() => {
    if (hlsSrc) {
      initHls();
    } else if (src && videoRef.current) {
      videoRef.current.src = src;
      setIsLoading(false);
    }
    
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [hlsSrc, src, initHls]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoading(false);
    };
    
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);
    const handleEnded = () => {
      setIsPlaying(false);
      if (onEnded) onEnded();
    };
    const handleVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('volumechange', handleVolumeChange);
    
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('volumechange', handleVolumeChange);
    };
  }, [onEnded]);

  // Auto-hide controls
  useEffect(() => {
    const hideControls = () => {
      if (isPlaying && !showSettings) {
        setShowControls(false);
      }
    };
    
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    
    if (showControls) {
      controlsTimeoutRef.current = setTimeout(hideControls, 3000);
    }
    
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls, isPlaying, showSettings]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Control handlers
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      videoRef.current.muted = newVolume === 0;
    }
  };

  const handleSeek = (e) => {
    const rect = progressRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = pos * duration;
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const changeQuality = (levelIndex) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      setCurrentQuality(levelIndex === -1 ? 'auto' : qualities.find(q => q.index === levelIndex)?.label);
    }
    setShowSettings(false);
  };

  const changePlaybackSpeed = (speed) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      setPlaybackSpeed(speed);
    }
    setShowSettings(false);
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
  };

  const handleKeyDown = (e) => {
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'f':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'm':
        e.preventDefault();
        toggleMute();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (videoRef.current) videoRef.current.currentTime -= 10;
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (videoRef.current) videoRef.current.currentTime += 10;
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (videoRef.current) videoRef.current.volume = Math.min(1, volume + 0.1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (videoRef.current) videoRef.current.volume = Math.max(0, volume - 0.1);
        break;
      default:
        break;
    }
  };

  if (error) {
    return (
      <div className={`video-player video-player--error ${className}`}>
        <div className="video-player__error">
          <p>⚠️ {error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`video-player ${isFullscreen ? 'video-player--fullscreen' : ''} ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <video
        ref={videoRef}
        poster={poster}
        loop={loop}
        playsInline
        onClick={togglePlay}
        className="video-player__video"
      />
      
      {/* Loading overlay */}
      {isLoading && (
        <div className="video-player__loading">
          <Loader className="video-player__spinner" />
        </div>
      )}
      
      {/* Controls overlay */}
      <div className={`video-player__controls ${showControls ? 'visible' : ''}`}>
        {/* Progress bar */}
        <div 
          ref={progressRef}
          className="video-player__progress"
          onClick={handleSeek}
        >
          <div 
            className="video-player__progress-buffered"
            style={{ width: `${(buffered / duration) * 100}%` }}
          />
          <div 
            className="video-player__progress-played"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
          <div 
            className="video-player__progress-handle"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
        </div>
        
        {/* Controls bar */}
        <div className="video-player__controls-bar">
          <div className="video-player__controls-left">
            <button onClick={togglePlay} className="video-player__btn">
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            
            <div className="video-player__volume">
              <button onClick={toggleMute} className="video-player__btn">
                {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="video-player__volume-slider"
              />
            </div>
            
            <span className="video-player__time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          
          <div className="video-player__controls-right">
            {/* Settings menu */}
            <div className="video-player__settings">
              <button 
                onClick={() => setShowSettings(!showSettings)} 
                className="video-player__btn"
              >
                <Settings size={20} />
              </button>
              
              {showSettings && (
                <div className="video-player__settings-menu">
                  {/* Quality options */}
                  {qualities.length > 0 && (
                    <div className="video-player__settings-section">
                      <h4>Quality</h4>
                      {qualities.map((q) => (
                        <button
                          key={q.index}
                          onClick={() => changeQuality(q.index)}
                          className={`video-player__settings-option ${
                            (q.index === -1 && currentQuality === 'auto') || 
                            q.label === currentQuality ? 'active' : ''
                          }`}
                        >
                          {q.label}
                          {q.index === -1 && hlsRef.current?.currentLevel >= 0 && (
                            <span className="video-player__auto-quality">
                              ({qualities.find(x => x.index === hlsRef.current.currentLevel)?.label})
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {/* Playback speed */}
                  <div className="video-player__settings-section">
                    <h4>Speed</h4>
                    {PLAYBACK_SPEEDS.map((speed) => (
                      <button
                        key={speed}
                        onClick={() => changePlaybackSpeed(speed)}
                        className={`video-player__settings-option ${
                          playbackSpeed === speed ? 'active' : ''
                        }`}
                      >
                        {speed === 1 ? 'Normal' : `${speed}x`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <button onClick={toggleFullscreen} className="video-player__btn">
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
