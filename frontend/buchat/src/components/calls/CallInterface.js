/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, 
  Minimize2, Maximize2, Video, VideoOff, Settings,
  ScreenShare, ScreenShareOff, SwitchCamera, Users,
  Signal, SignalHigh, SignalMedium, SignalLow, Wifi
} from 'lucide-react';
import { useWebRTC } from '../../hooks/useWebRTC';
import { callService } from '../../services/callService';
import messagingService from '../../services/messagingService';
import callAudioManager from '../../utils/callAudio';
import { toast } from 'react-toastify';
import { 
  updateNetworkStats, 
  toggleAudio as reduxToggleAudio, 
  toggleVideo as reduxToggleVideo 
} from '../../store/slices/callsSlice';
import { VIDEO_QUALITY_PRESETS, AUDIO_QUALITY_PRESETS } from '../../store/slices/callsSlice';
import VideoQualitySettings from './VideoQualitySettings';
import EncryptionVerificationModal from '../security/EncryptionVerificationModal';
import EncryptionVerification from '../../utils/encryptionVerification';
import './CallInterface.css';

const CallInterface = ({ callId: initialCallId, recipientId, recipientName, callType, isIncoming, offer, onEnd }) => {
  const dispatch = useDispatch();
  const theme = useSelector(state => state.settings?.theme || 'dark');
  const savedVideoQuality = useSelector(state => state.settings?.videoQuality || 'auto');
  const savedAudioQuality = useSelector(state => state.settings?.audioQuality || 'high');
  
  const isVideoCall = callType === 'video';
  const [callId, setCallId] = useState(initialCallId);
  const [remoteStream, setRemoteStream] = useState(null);
  const [audioEnabled, setAudioEnabledState] = useState(true);
  const [videoEnabled, setVideoEnabledState] = useState(isVideoCall);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [callStatusText, setCallStatusText] = useState(isIncoming ? 'Incoming call' : 'Calling...');
  const [isMinimized, setIsMinimized] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [videoQuality, setVideoQuality] = useState(savedVideoQuality);
  const [audioQuality, setAudioQuality] = useState(savedAudioQuality);
  const [adaptiveBitrate, setAdaptiveBitrate] = useState(true);
  const [networkStats, setNetworkStatsLocal] = useState({
    latency: 0,
    packetLoss: 0,
    bandwidth: 0,
    resolution: '',
    frameRate: 0
  });
  const [showEncryptionVerification, setShowEncryptionVerification] = useState(false);
  const callStartTime = useRef(null);

  const remoteAudioRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const durationInterval = useRef(null);
  const statsInterval = useRef(null);
  const audioContext = useRef(null);
  const analyser = useRef(null);

  const {
    localStream,
    connectionState,
    peerConnection,
    startCall,
    answerCall,
    setRemoteAnswer,
    toggleAudio,
    toggleVideo,
    endCall: endWebRTCCall
  } = useWebRTC(callId, !isIncoming, setRemoteStream, handleCallEnd);

  // Start ringtone/dial tone when call starts
  useEffect(() => {
    if (isIncoming) {
      callAudioManager.playRingtone();
    } else {
      callAudioManager.playDialTone();
    }
    
    return () => {
      callAudioManager.stopAll();
    };
  }, [isIncoming]);

  // Collect WebRTC stats for quality monitoring
  const collectStats = useCallback(async () => {
    if (!peerConnection) return;
    
    try {
      const stats = await peerConnection.getStats();
      let videoStats = null;
      let audioStats = null;
      
      stats.forEach(report => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          videoStats = report;
        }
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          audioStats = report;
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          setNetworkStatsLocal(prev => ({
            ...prev,
            latency: Math.round(report.currentRoundTripTime * 1000) || prev.latency
          }));
        }
      });
      
      if (videoStats) {
        const track = remoteStream?.getVideoTracks()[0];
        const settings = track?.getSettings();
        
        setNetworkStatsLocal(prev => ({
          ...prev,
          resolution: settings ? `${settings.width}x${settings.height}` : prev.resolution,
          frameRate: Math.round(settings?.frameRate || videoStats.framesPerSecond || 0),
          packetLoss: videoStats.packetsLost ? 
            (videoStats.packetsLost / (videoStats.packetsReceived + videoStats.packetsLost) * 100) : 0
        }));
      }
      
      // Network stats updated in local state
    } catch (error) {
      console.debug('Stats collection error:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerConnection, remoteStream, dispatch, networkStats]);

  // Start stats collection when connected
  useEffect(() => {
    if (isConnected && peerConnection) {
      statsInterval.current = setInterval(collectStats, 2000);
    }
    
    return () => {
      if (statsInterval.current) {
        clearInterval(statsInterval.current);
      }
    };
  }, [isConnected, peerConnection, collectStats]);

  // Set up video streams
  useEffect(() => {
    if (localStream && localVideoRef.current && isVideoCall) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isVideoCall]);

  useEffect(() => {
    if (remoteStream && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
      
      // For video calls, set remote video stream
      if (isVideoCall && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      
      setCallStatusText('Connected');
      setIsConnected(true);
      callStartTime.current = Date.now();
      
      // Stop ringtone/dial tone and play connected sound
      callAudioManager.stopAll();
      callAudioManager.playConnected();
      
      // Start duration timer
      durationInterval.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

      // Setup audio visualization
      setupAudioVisualization(remoteStream);
    }
  }, [remoteStream, dispatch, isVideoCall]);

  useEffect(() => {
    return () => {
      if (durationInterval.current) clearInterval(durationInterval.current);
      if (statsInterval.current) clearInterval(statsInterval.current);
      if (audioContext.current && audioContext.current.state !== 'closed') {
        audioContext.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (isIncoming && callId) {
      fetchCallOffer();
    } else if (!isIncoming) {
      initiateCall();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setupAudioVisualization = (stream) => {
    try {
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
      analyser.current = audioContext.current.createAnalyser();
      const source = audioContext.current.createMediaStreamSource(stream);
      source.connect(analyser.current);
      analyser.current.fftSize = 256;
      
      const dataArray = new Uint8Array(analyser.current.frequencyBinCount);
      const updateLevel = () => {
        if (analyser.current) {
          analyser.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(Math.min(100, (average / 255) * 100));
          requestAnimationFrame(updateLevel);
        }
      };
      updateLevel();
    } catch (error) {
      console.error('Audio visualization error:', error);
    }
  };

  async function fetchCallOffer() {
    try {
      const status = await callService.getCallStatus(callId);
      if (status.offer) {
        setCallStatusText('Incoming call');
      }
    } catch (error) {
      console.error('Error fetching call offer:', error);
      toast.error('Failed to load call');
      handleCallEnd();
    }
  }

  async function initiateCall() {
    try {
      const isVideoCall = callType === 'video';
      const offer = await startCall(true, isVideoCall);
      const { callId: newCallId } = await callService.initiateCall(recipientId, callType, offer);
      setCallId(newCallId);
      
      const pollAnswer = setInterval(async () => {
        try {
          const status = await callService.getCallStatus(newCallId);
          if (status.answer) {
            clearInterval(pollAnswer);
            await setRemoteAnswer(status.answer);
            setCallStatusText('Connected');
          } else if (status.status === 'rejected' || status.status === 'ended') {
            clearInterval(pollAnswer);
            handleCallEnd();
          }
        } catch (error) {
          console.error('Error polling call status:', error);
        }
      }, 1000);

      setTimeout(() => clearInterval(pollAnswer), 60000);
    } catch (error) {
      toast.error('Failed to start call');
      handleCallEnd();
    }
  }

  async function handleAnswer() {
    try {
      // Stop ringtone when answering
      callAudioManager.stopRingtone();
      
      const status = await callService.getCallStatus(callId);
      if (status.status !== 'ringing') {
        toast.error(`Call is no longer available (${status.status})`);
        handleCallEnd();
        return;
      }
      
      const callOffer = status.offer;
      const isVideoCall = callType === 'video';
      const answer = await answerCall(callOffer, true, isVideoCall);
      await callService.answerCall(callId, answer);
      setCallStatusText('Connected');
    } catch (error) {
      console.error('Error answering call:', error);
      const errorMsg = error.response?.data?.message || 'Failed to answer call';
      toast.error(errorMsg);
      handleCallEnd();
    }
  }

  async function handleCallEnd(wasRejected = false) {
    // Stop all sounds
    callAudioManager.stopAll();
    
    if (durationInterval.current) clearInterval(durationInterval.current);
    if (audioContext.current && audioContext.current.state !== 'closed') {
      audioContext.current.close();
    }
    
    // Play end sound
    if (!wasRejected && callDuration > 0) {
      callAudioManager.playEnded();
    }
    
    // Log call as a message in the conversation
    try {
      const duration = callDuration;
      const callData = {
        callType: callType || 'voice',
        duration: duration,
        status: wasRejected ? 'missed' : (duration > 0 ? 'completed' : 'missed'),
        isOutgoing: !isIncoming
      };
      
      // Send a call log message
      await messagingService.sendCallLogMessage(recipientId, callData);
    } catch (error) {
      console.error('Error logging call message:', error);
    }
    
    endWebRTCCall();
    onEnd?.();
  }

  async function handleReject() {
    try {
      callAudioManager.stopAll();
      await callService.rejectCall(callId);
      handleCallEnd(true);
    } catch (error) {
      console.error('Error rejecting call:', error);
      handleCallEnd(true);
    }
  }

  async function handleEnd() {
    try {
      callAudioManager.stopAll();
      await callService.endCall(callId);
      handleCallEnd();
    } catch (error) {
      console.error('Error ending call:', error);
      handleCallEnd();
    }
  }

  function handleToggleAudio() {
    const enabled = toggleAudio();
    setAudioEnabledState(enabled);
    dispatch(reduxToggleAudio());
  }

  function handleToggleVideo() {
    const enabled = toggleVideo();
    setVideoEnabledState(enabled);
    dispatch(reduxToggleVideo());
  }

  function handleToggleSpeaker() {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = speakerEnabled;
      setSpeakerEnabled(!speakerEnabled);
    }
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get connection quality indicator
  const getConnectionQuality = () => {
    const { latency, packetLoss } = networkStats;
    if (latency < 50 && packetLoss < 0.5) return 'excellent';
    if (latency < 100 && packetLoss < 1) return 'good';
    if (latency < 200 && packetLoss < 3) return 'fair';
    return 'poor';
  };

  const getSignalIcon = () => {
    const quality = getConnectionQuality();
    switch (quality) {
      case 'excellent': return <SignalHigh className="signal-icon excellent" size={16} />;
      case 'good': return <SignalMedium className="signal-icon good" size={16} />;
      case 'fair': return <SignalLow className="signal-icon fair" size={16} />;
      default: return <Signal className="signal-icon poor" size={16} />;
    }
  };

  // Handle video quality change
  const handleVideoQualityChange = async (quality) => {
    setVideoQuality(quality);
    
    if (localStream && quality !== 'auto') {
      const preset = VIDEO_QUALITY_PRESETS[quality];
      if (preset) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          try {
            await videoTrack.applyConstraints({
              width: { ideal: preset.width },
              height: { ideal: preset.height },
              frameRate: { ideal: preset.frameRate }
            });
          } catch (error) {
            console.debug('Could not apply video constraints:', error);
          }
        }
      }
    }
  };

  // Handle audio quality change
  const handleAudioQualityChange = (quality) => {
    setAudioQuality(quality);
  };

  // Toggle adaptive bitrate
  const handleAdaptiveBitrateToggle = () => {
    setAdaptiveBitrate(!adaptiveBitrate);
    if (!adaptiveBitrate) {
      setVideoQuality('auto');
    }
  };

  if (isMinimized) {
    return (
      <motion.div 
        className={`call-minimized ${theme}`}
        drag
        dragMomentum={false}
        dragElastic={0}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={(e, info) => {
          setIsDragging(false);
          setPosition({ x: info.point.x, y: info.point.y });
        }}
        onClick={(e) => {
          if (!isDragging) setIsMinimized(false);
        }}
        style={{ x: position.x, y: position.y }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
      >
        <div className="minimized-avatar">{recipientName[0]?.toUpperCase()}</div>
        <div className="minimized-info">
          <span className="minimized-name">{recipientName}</span>
          <span className="minimized-duration">{formatDuration(callDuration)}</span>
        </div>
        {getSignalIcon()}
        <Maximize2 size={16} />
        <audio ref={remoteAudioRef} autoPlay />
      </motion.div>
    );
  }

  return (
    <motion.div 
      className={`call-overlay ${theme}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => setIsMinimized(true)}
    >
      <div className="call-overlay-bg" />
      <motion.div 
        className={`call-interface-modern ${theme}`}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="call-background">
          <div className="call-gradient"></div>
          <div className="call-pattern"></div>
        </div>

        <div className="call-content">
        <div className="call-header">
          {/* Network Quality Indicator */}
          {isConnected && (
            <div className="network-indicator" title={`Latency: ${networkStats.latency}ms`}>
              {getSignalIcon()}
              {networkStats.resolution && (
                <span className="resolution-badge">{networkStats.resolution.split('x')[1]}p</span>
              )}
            </div>
          )}
          
          <div className="header-actions">
            <motion.button 
              className="header-btn encryption-badge-btn"
              onClick={() => setShowEncryptionVerification(true)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Verify Encryption"
              style={{ 
                background: EncryptionVerification.isVerified(callId || recipientId) 
                  ? 'rgba(16, 185, 129, 0.2)' 
                  : 'rgba(245, 158, 11, 0.2)',
                color: EncryptionVerification.isVerified(callId || recipientId)
                  ? 'rgb(16, 185, 129)'
                  : 'rgb(245, 158, 11)'
              }}
            >
              {EncryptionVerification.isVerified(callId || recipientId) ? '🔒✓' : '🔒'}
            </motion.button>
            <motion.button 
              className="header-btn"
              onClick={() => setShowSettings(true)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Quality Settings"
            >
              <Settings size={20} />
            </motion.button>
            <motion.button 
              className="header-btn"
              onClick={() => setIsMinimized(true)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Minimize"
            >
              <Minimize2 size={20} />
            </motion.button>
          </div>
        </div>

        {/* Video Call Layout */}
        {isVideoCall ? (
          <div className="video-call-section">
            {/* Remote Video (Full Screen) */}
            <video 
              ref={remoteVideoRef} 
              autoPlay 
              playsInline 
              className="remote-video"
            />
            
            {/* Local Video (Picture-in-Picture) */}
            <div className="local-video-container">
              <video 
                ref={localVideoRef} 
                autoPlay 
                playsInline 
                muted 
                className="local-video"
              />
              {!videoEnabled && (
                <div className="video-off-overlay">
                  <VideoOff size={24} />
                </div>
              )}
            </div>
            
            {/* Screen share indicator */}
            {isScreenSharing && (
              <div className="screen-share-indicator">
                <ScreenShare size={16} />
                <span>Sharing screen</span>
              </div>
            )}
            
            {/* Overlay Info */}
            <div className="video-call-info">
              <h2 className="caller-name">{recipientName}</h2>
              <p className="call-status">
                {isConnected ? formatDuration(callDuration) : callStatusText}
              </p>
            </div>
          </div>
        ) : (
          /* Audio Call Layout */
          <div className="call-avatar-section">
            <div className="avatar-container">
              <motion.div 
                className="avatar-ring"
                animate={{ 
                  scale: isConnected ? [1, 1.1, 1] : 1,
                  opacity: isConnected ? [0.5, 0.8, 0.5] : 0.5
                }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <div className="avatar-circle">
                {recipientName[0]?.toUpperCase()}
              </div>
              
              {isConnected && (
                <motion.div 
                  className="audio-wave"
                  style={{ height: `${audioLevel}%` }}
                />
              )}
            </div>

            <h2 className="caller-name">{recipientName}</h2>
            <p className="call-status">
              {isConnected ? formatDuration(callDuration) : callStatusText}
            </p>
            
            {/* Audio quality indicator */}
            {isConnected && (
              <div className="audio-quality-info">
                {getSignalIcon()}
                <span>{networkStats.latency}ms</span>
              </div>
            )}
          </div>
        )}

        <div className="call-controls-modern">
          {isIncoming && callStatusText === 'Incoming call' ? (
            <>
              <motion.button 
                className="control-btn-modern reject"
                onClick={handleReject}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <PhoneOff size={28} />
              </motion.button>
              <motion.button 
                className="control-btn-modern accept"
                onClick={handleAnswer}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Phone size={28} />
              </motion.button>
            </>
          ) : (
            <>
              <motion.button 
                className={`control-btn-modern secondary ${!audioEnabled ? 'active' : ''}`}
                onClick={handleToggleAudio}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title={audioEnabled ? 'Mute' : 'Unmute'}
              >
                {audioEnabled ? <Mic size={24} /> : <MicOff size={24} />}
              </motion.button>

              {isVideoCall && (
                <>
                  <motion.button 
                    className={`control-btn-modern secondary ${!videoEnabled ? 'active' : ''}`}
                    onClick={handleToggleVideo}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
                  >
                    {videoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
                  </motion.button>
                  
                  <motion.button 
                    className={`control-btn-modern secondary ${isScreenSharing ? 'active' : ''}`}
                    onClick={() => setIsScreenSharing(!isScreenSharing)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title="Share screen"
                  >
                    {isScreenSharing ? <ScreenShareOff size={24} /> : <ScreenShare size={24} />}
                  </motion.button>
                </>
              )}

              <motion.button 
                className={`control-btn-modern secondary ${!speakerEnabled ? 'active' : ''}`}
                onClick={handleToggleSpeaker}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title={speakerEnabled ? 'Mute speaker' : 'Unmute speaker'}
              >
                {speakerEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
              </motion.button>

              <motion.button 
                className="control-btn-modern end"
                onClick={handleEnd}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="End call"
              >
                <PhoneOff size={28} />
              </motion.button>
            </>
          )}
        </div>

        <div className="call-footer">
          <span className="encryption-text">🔒 End-to-end encrypted</span>
        </div>
      </div>

        <audio ref={remoteAudioRef} autoPlay />
      </motion.div>

      {/* Quality Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <VideoQualitySettings
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            currentVideoQuality={videoQuality}
            currentAudioQuality={audioQuality}
            adaptiveBitrate={adaptiveBitrate}
            networkStats={networkStats}
            onVideoQualityChange={handleVideoQualityChange}
            onAudioQualityChange={handleAudioQualityChange}
            onAdaptiveBitrateToggle={handleAdaptiveBitrateToggle}
          />
        )}
      </AnimatePresence>

      {/* Encryption Verification Modal */}
      <EncryptionVerificationModal
        show={showEncryptionVerification}
        onClose={() => setShowEncryptionVerification(false)}
        conversationId={callId || recipientId}
        otherUserName={recipientName}
        userPublicKey={null}
        otherUserPublicKey={null}
      />
    </motion.div>
  );
};

export default CallInterface;
