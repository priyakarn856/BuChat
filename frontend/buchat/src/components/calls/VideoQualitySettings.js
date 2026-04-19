/**
 * Video Quality Settings Component
 * Industry-standard quality selector like YouTube/Netflix
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, 
  Signal, 
  SignalLow, 
  SignalMedium, 
  SignalHigh, 
  Wifi,
  WifiOff,
  Check,
  X,
  Gauge,
  Zap
} from 'lucide-react';
import { VIDEO_QUALITY_PRESETS, AUDIO_QUALITY_PRESETS } from '../../store/slices/callsSlice';
import './VideoQualitySettings.css';

const VideoQualitySettings = ({ 
  isOpen, 
  onClose, 
  currentVideoQuality,
  currentAudioQuality,
  adaptiveBitrate,
  networkStats,
  onVideoQualityChange,
  onAudioQualityChange,
  onAdaptiveBitrateToggle
}) => {
  
  const getQualityIcon = (level) => {
    switch (level) {
      case 'excellent': return <SignalHigh className="signal-icon excellent" />;
      case 'good': return <SignalMedium className="signal-icon good" />;
      case 'fair': return <SignalLow className="signal-icon fair" />;
      case 'poor': return <SignalLow className="signal-icon poor" />;
      default: return <Signal className="signal-icon" />;
    }
  };

  const getConnectionQuality = () => {
    if (!networkStats) return 'unknown';
    
    const { latency, packetLoss, bandwidth } = networkStats;
    
    if (latency < 50 && packetLoss < 0.5 && bandwidth > 2000) return 'excellent';
    if (latency < 100 && packetLoss < 1 && bandwidth > 1000) return 'good';
    if (latency < 200 && packetLoss < 3 && bandwidth > 500) return 'fair';
    return 'poor';
  };

  const getRecommendedQuality = () => {
    const quality = getConnectionQuality();
    
    switch (quality) {
      case 'excellent': return '1080p';
      case 'good': return '720p';
      case 'fair': return '480p';
      case 'poor': return '360p';
      default: return 'auto';
    }
  };

  const videoQualityOptions = [
    { key: 'auto', ...VIDEO_QUALITY_PRESETS.auto },
    { key: '2160p', ...VIDEO_QUALITY_PRESETS['2160p'], badge: '4K' },
    { key: '1440p', ...VIDEO_QUALITY_PRESETS['1440p'], badge: '2K' },
    { key: '1080p', ...VIDEO_QUALITY_PRESETS['1080p'], badge: 'HD' },
    { key: '720p', ...VIDEO_QUALITY_PRESETS['720p'] },
    { key: '480p', ...VIDEO_QUALITY_PRESETS['480p'] },
    { key: '360p', ...VIDEO_QUALITY_PRESETS['360p'] },
    { key: '240p', ...VIDEO_QUALITY_PRESETS['240p'] },
    { key: '144p', ...VIDEO_QUALITY_PRESETS['144p'] },
  ];

  const audioQualityOptions = [
    { key: 'studio', ...AUDIO_QUALITY_PRESETS.studio },
    { key: 'high', ...AUDIO_QUALITY_PRESETS.high },
    { key: 'medium', ...AUDIO_QUALITY_PRESETS.medium },
    { key: 'low', ...AUDIO_QUALITY_PRESETS.low },
  ];

  const formatBitrate = (bps) => {
    if (bps >= 1000000) return `${(bps / 1000000).toFixed(1)} Mbps`;
    if (bps >= 1000) return `${(bps / 1000).toFixed(0)} Kbps`;
    return `${bps} bps`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="quality-settings-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="quality-settings-panel"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="quality-header">
              <Settings size={20} />
              <h3>Quality Settings</h3>
              <button className="close-btn" onClick={onClose}>
                <X size={20} />
              </button>
            </div>

            {/* Network Stats */}
            {networkStats && (
              <div className="network-stats-section">
                <div className="stats-header">
                  {networkStats.isOnline !== false ? <Wifi size={16} /> : <WifiOff size={16} />}
                  <span>Connection Quality</span>
                  {getQualityIcon(getConnectionQuality())}
                </div>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-label">Latency</span>
                    <span className="stat-value">{networkStats.latency || 0}ms</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Packet Loss</span>
                    <span className="stat-value">{(networkStats.packetLoss || 0).toFixed(1)}%</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Resolution</span>
                    <span className="stat-value">{networkStats.resolution || '-'}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Frame Rate</span>
                    <span className="stat-value">{networkStats.frameRate || 0} fps</span>
                  </div>
                </div>
                {getRecommendedQuality() !== currentVideoQuality && (
                  <div className="quality-recommendation">
                    <Zap size={14} />
                    <span>Recommended: {getRecommendedQuality()}</span>
                  </div>
                )}
              </div>
            )}

            {/* Adaptive Bitrate Toggle */}
            <div className="settings-section">
              <div className="setting-row toggle-row">
                <div className="setting-info">
                  <Gauge size={18} />
                  <div>
                    <span className="setting-label">Adaptive Quality</span>
                    <span className="setting-desc">Automatically adjust based on connection</span>
                  </div>
                </div>
                <label className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={adaptiveBitrate} 
                    onChange={onAdaptiveBitrateToggle}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>

            {/* Video Quality */}
            <div className="settings-section">
              <h4 className="section-title">Video Quality</h4>
              <div className="quality-options">
                {videoQualityOptions.map(option => (
                  <button
                    key={option.key}
                    className={`quality-option ${currentVideoQuality === option.key ? 'active' : ''}`}
                    onClick={() => onVideoQualityChange(option.key)}
                    disabled={adaptiveBitrate && option.key !== 'auto'}
                  >
                    <div className="option-main">
                      <span className="option-label">{option.label}</span>
                      {option.badge && (
                        <span className={`quality-badge ${option.badge.toLowerCase()}`}>
                          {option.badge}
                        </span>
                      )}
                    </div>
                    <div className="option-meta">
                      {option.maxBitrate > 0 && (
                        <span className="option-bitrate">{formatBitrate(option.maxBitrate)}</span>
                      )}
                      {currentVideoQuality === option.key && (
                        <Check size={16} className="check-icon" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Audio Quality */}
            <div className="settings-section">
              <h4 className="section-title">Audio Quality</h4>
              <div className="quality-options audio-options">
                {audioQualityOptions.map(option => (
                  <button
                    key={option.key}
                    className={`quality-option ${currentAudioQuality === option.key ? 'active' : ''}`}
                    onClick={() => onAudioQualityChange(option.key)}
                  >
                    <div className="option-main">
                      <span className="option-label">{option.label}</span>
                    </div>
                    <div className="option-meta">
                      {currentAudioQuality === option.key && (
                        <Check size={16} className="check-icon" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Data Usage Info */}
            <div className="data-usage-info">
              <p>
                {currentVideoQuality === 'auto' 
                  ? 'Auto quality uses ~500 MB per hour on average'
                  : `${currentVideoQuality} uses approximately ${
                      VIDEO_QUALITY_PRESETS[currentVideoQuality]?.maxBitrate 
                        ? Math.round((VIDEO_QUALITY_PRESETS[currentVideoQuality].maxBitrate / 8 * 3600) / 1000000)
                        : '?'
                    } MB per hour`
                }
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default VideoQualitySettings;
